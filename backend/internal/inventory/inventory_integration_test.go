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

// TestIntegration_Reserve_NoOversellUnderConcurrency is the signature test
// (SPEC §7): 500 goroutines each reserve 1 unit against available=100. Exactly
// 100 must succeed, the rest must get ErrOutOfStock, the final counts must be
// available=0 / reserved=100, and the ledger must reconcile.
func TestIntegration_Reserve_NoOversellUnderConcurrency(t *testing.T) {
	pool := testutil.StartPostgres(t)
	variantID := testutil.SeedVariant(t, pool, 100)
	svc := inventory.NewService(pool, inventory.NoopMetrics{})

	const goroutines = 500
	results := make(chan error, goroutines)
	var start sync.WaitGroup
	start.Add(1)
	var done sync.WaitGroup
	for i := 0; i < goroutines; i++ {
		done.Add(1)
		go func() {
			defer done.Done()
			start.Wait() // release all goroutines at once for maximum contention
			_, err := svc.ReserveOne(context.Background(), variantID, 1, 15*time.Minute)
			results <- err
		}()
	}
	start.Done()
	done.Wait()
	close(results)

	success, outOfStock, other := 0, 0, 0
	for err := range results {
		switch {
		case err == nil:
			success++
		case errors.Is(err, inventory.ErrOutOfStock):
			outOfStock++
		default:
			other++
			t.Errorf("unexpected error: %v", err)
		}
	}

	if success != 100 {
		t.Errorf("successful reservations = %d, want exactly 100 (oversell!)", success)
	}
	if outOfStock != goroutines-100 {
		t.Errorf("out-of-stock = %d, want %d", outOfStock, goroutines-100)
	}
	if other != 0 {
		t.Errorf("unexpected errors = %d, want 0", other)
	}

	inv, err := svc.GetInventory(context.Background(), variantID)
	if err != nil {
		t.Fatalf("get inventory: %v", err)
	}
	if inv.Available != 0 || inv.Reserved != 100 {
		t.Errorf("final inventory = available %d / reserved %d, want 0 / 100", inv.Available, inv.Reserved)
	}

	// Ledger reconciliation: deltas must equal the net inventory change, and
	// there must be exactly one 'reserve' entry per success.
	invq := invdb.New(pool)
	rec, err := invq.ReconcileLedger(context.Background(), variantID)
	if err != nil {
		t.Fatalf("reconcile ledger: %v", err)
	}
	if rec.SumAvailable != -100 || rec.SumReserved != 100 {
		t.Errorf("ledger sums = available %d / reserved %d, want -100 / 100", rec.SumAvailable, rec.SumReserved)
	}
	reserveEntries, err := invq.CountLedgerByKind(context.Background(), invdb.CountLedgerByKindParams{VariantID: variantID, Kind: "reserve"})
	if err != nil {
		t.Fatalf("count reserve entries: %v", err)
	}
	if reserveEntries != 100 {
		t.Errorf("reserve ledger entries = %d, want 100", reserveEntries)
	}
}
