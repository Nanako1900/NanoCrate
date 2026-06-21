//go:build integration

package inventory_test

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/Nanako1900/NanoCrate/backend/internal/inventory"
	invdb "github.com/Nanako1900/NanoCrate/backend/internal/inventory/db"
	"github.com/Nanako1900/NanoCrate/backend/internal/testutil"
)

// SPEC §7 race "sweeper release vs webhook commit happening at once": both target
// the same held reservation; the MarkReservation `WHERE status='held'` gate must
// make exactly one win (first writer), the other a no-op (ErrReservationNotHeld).
// The ledger and inventory must reflect exactly one terminal transition and stay
// reconcilable. Run many trials to surface the race.
func TestIntegration_Sweeper_VsCommit_OnlyOneWins(t *testing.T) {
	pool := testutil.StartPostgres(t)
	ctx := context.Background()
	svc := inventory.NewService(pool, nil)
	q := invdb.New(pool)

	const initialAvail = 10
	for trial := 0; trial < 40; trial++ {
		variantID := testutil.SeedVariant(t, pool, initialAvail)
		// Reserve 1, already expired (negative TTL) so the sweeper will pick it up.
		res, err := svc.ReserveOne(ctx, variantID, 1, -time.Minute)
		if err != nil {
			t.Fatalf("trial %d reserve: %v", trial, err)
		}

		var commitErr, sweepErr error
		var swept int
		var wg sync.WaitGroup
		wg.Add(2)
		go func() { defer wg.Done(); commitErr = svc.Commit(ctx, res.ID) }()
		go func() { defer wg.Done(); swept, sweepErr = svc.ReleaseExpired(ctx, 10) }()
		wg.Wait()

		if sweepErr != nil {
			t.Fatalf("trial %d sweep error: %v", trial, sweepErr)
		}
		inv, _ := svc.GetInventory(ctx, variantID)

		commitWon := commitErr == nil
		sweepWon := swept == 1
		if commitWon == sweepWon {
			t.Fatalf("trial %d: exactly one must win (commitErr=%v swept=%d)", trial, commitErr, swept)
		}

		if commitWon {
			// Commit won; the sweeper found it no longer held and skipped (swept==0).
			assertReservationStatus(t, pool, res.ID, "committed")
			if inv.Available != initialAvail-1 || inv.Reserved != 0 {
				t.Fatalf("trial %d commit-won inventory = %d/%d, want %d/0", trial, inv.Available, inv.Reserved, initialAvail-1)
			}
		} else {
			// Sweeper won; commit lost the race with ErrReservationNotHeld.
			assertReservationStatus(t, pool, res.ID, "expired")
			if inv.Available != initialAvail || inv.Reserved != 0 {
				t.Fatalf("trial %d sweep-won inventory = %d/%d, want %d/0", trial, inv.Available, inv.Reserved, initialAvail)
			}
			if !errors.Is(commitErr, inventory.ErrReservationNotHeld) {
				t.Fatalf("trial %d: commit loser err = %v, want ErrReservationNotHeld", trial, commitErr)
			}
		}

		// Exactly one terminal ledger entry (commit XOR expire); reserve is always present.
		commits, _ := q.CountLedgerByKind(ctx, invdb.CountLedgerByKindParams{VariantID: variantID, Kind: "commit"})
		expires, _ := q.CountLedgerByKind(ctx, invdb.CountLedgerByKindParams{VariantID: variantID, Kind: "expire"})
		if commits+expires != 1 {
			t.Fatalf("trial %d terminal ledger entries commit=%d expire=%d, want exactly 1", trial, commits, expires)
		}

		// Ledger reconciles to inventory: initial + Σdelta == current.
		rec, _ := q.ReconcileLedger(ctx, variantID)
		if int64(initialAvail)+rec.SumAvailable != int64(inv.Available) || rec.SumReserved != int64(inv.Reserved) {
			t.Fatalf("trial %d ledger mismatch: sum_avail=%d sum_reserved=%d inv=%d/%d",
				trial, rec.SumAvailable, rec.SumReserved, inv.Available, inv.Reserved)
		}
	}
}
