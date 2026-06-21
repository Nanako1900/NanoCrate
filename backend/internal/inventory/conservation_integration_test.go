//go:build integration

package inventory_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/Nanako1900/NanoCrate/backend/internal/inventory"
	invdb "github.com/Nanako1900/NanoCrate/backend/internal/inventory/db"
	"github.com/Nanako1900/NanoCrate/backend/internal/testutil"
)

// B3: a held reservation's stock transition is guarded by `reserved >= qty`. If
// reserved has somehow fallen below the held qty, the conditional UPDATE affects
// zero rows. Commit must then fail loudly and roll back — never silently write a
// ledger entry that breaks available/reserved conservation.
func TestIntegration_Commit_FailsWhenReservedBelowQty(t *testing.T) {
	pool := testutil.StartPostgres(t)
	ctx := context.Background()
	variantID := testutil.SeedVariant(t, pool, 10)
	svc := inventory.NewService(pool, nil)
	q := invdb.New(pool)

	res, err := svc.ReserveOne(ctx, variantID, 5, time.Hour) // available 5 / reserved 5
	if err != nil {
		t.Fatalf("reserve: %v", err)
	}
	// Corrupt the invariant so reserved (2) < the held reservation's qty (5).
	if err := q.SetInventory(ctx, invdb.SetInventoryParams{VariantID: variantID, Available: 5, Reserved: 2}); err != nil {
		t.Fatalf("corrupt inventory: %v", err)
	}

	err = svc.Commit(ctx, res.ID)
	if !errors.Is(err, inventory.ErrStockConservation) {
		t.Fatalf("commit err = %v, want ErrStockConservation", err)
	}
	// The whole transaction rolled back: reservation still held, no commit ledger
	// entry, reserved untouched.
	assertReservationStatus(t, pool, res.ID, "held")
	if n, _ := q.CountLedgerByKind(ctx, invdb.CountLedgerByKindParams{VariantID: variantID, Kind: "commit"}); n != 0 {
		t.Errorf("commit ledger entries = %d, want 0 (rolled back)", n)
	}
	if inv, _ := svc.GetInventory(ctx, variantID); inv.Reserved != 2 {
		t.Errorf("reserved = %d, want 2 (unchanged after rolled-back commit)", inv.Reserved)
	}
}

// B3 (release path, engine.go:98): the same guard applies to releasing stock.
func TestIntegration_Release_FailsWhenReservedBelowQty(t *testing.T) {
	pool := testutil.StartPostgres(t)
	ctx := context.Background()
	variantID := testutil.SeedVariant(t, pool, 10)
	svc := inventory.NewService(pool, nil)
	q := invdb.New(pool)

	res, err := svc.ReserveOne(ctx, variantID, 5, time.Hour) // available 5 / reserved 5
	if err != nil {
		t.Fatalf("reserve: %v", err)
	}
	if err := q.SetInventory(ctx, invdb.SetInventoryParams{VariantID: variantID, Available: 5, Reserved: 2}); err != nil {
		t.Fatalf("corrupt inventory: %v", err)
	}

	err = svc.Release(ctx, res.ID)
	if !errors.Is(err, inventory.ErrStockConservation) {
		t.Fatalf("release err = %v, want ErrStockConservation", err)
	}
	assertReservationStatus(t, pool, res.ID, "held")
	if n, _ := q.CountLedgerByKind(ctx, invdb.CountLedgerByKindParams{VariantID: variantID, Kind: "release"}); n != 0 {
		t.Errorf("release ledger entries = %d, want 0 (rolled back)", n)
	}
	if inv, _ := svc.GetInventory(ctx, variantID); inv.Available != 5 || inv.Reserved != 2 {
		t.Errorf("inventory = %d/%d, want 5/2 (unchanged after rolled-back release)", inv.Available, inv.Reserved)
	}
}
