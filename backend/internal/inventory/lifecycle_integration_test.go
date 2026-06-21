//go:build integration

package inventory_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/Nanako1900/NanoCrate/backend/internal/inventory"
	invdb "github.com/Nanako1900/NanoCrate/backend/internal/inventory/db"
	"github.com/Nanako1900/NanoCrate/backend/internal/testutil"
)

func TestIntegration_Commit_DecrementsReservedOnly(t *testing.T) {
	pool := testutil.StartPostgres(t)
	variantID := testutil.SeedVariant(t, pool, 10)
	svc := inventory.NewService(pool, nil)
	ctx := context.Background()

	res, err := svc.ReserveOne(ctx, variantID, 3, time.Hour)
	if err != nil {
		t.Fatalf("reserve: %v", err)
	}
	if err := svc.Commit(ctx, res.ID); err != nil {
		t.Fatalf("commit: %v", err)
	}

	inv, _ := svc.GetInventory(ctx, variantID)
	if inv.Available != 7 || inv.Reserved != 0 {
		t.Errorf("after commit: available %d / reserved %d, want 7 / 0", inv.Available, inv.Reserved)
	}
	assertReservationStatus(t, pool, res.ID, "committed")

	// Committing again is rejected (no longer held).
	if err := svc.Commit(ctx, res.ID); !errors.Is(err, inventory.ErrReservationNotHeld) {
		t.Errorf("double commit err = %v, want ErrReservationNotHeld", err)
	}
}

func TestIntegration_Release_RestoresAvailable(t *testing.T) {
	pool := testutil.StartPostgres(t)
	variantID := testutil.SeedVariant(t, pool, 10)
	svc := inventory.NewService(pool, nil)
	ctx := context.Background()

	res, err := svc.ReserveOne(ctx, variantID, 4, time.Hour)
	if err != nil {
		t.Fatalf("reserve: %v", err)
	}
	inv, _ := svc.GetInventory(ctx, variantID)
	if inv.Available != 6 || inv.Reserved != 4 {
		t.Fatalf("after reserve: available %d / reserved %d, want 6 / 4", inv.Available, inv.Reserved)
	}

	if err := svc.Release(ctx, res.ID); err != nil {
		t.Fatalf("release: %v", err)
	}
	inv, _ = svc.GetInventory(ctx, variantID)
	if inv.Available != 10 || inv.Reserved != 0 {
		t.Errorf("after release: available %d / reserved %d, want 10 / 0", inv.Available, inv.Reserved)
	}
	assertReservationStatus(t, pool, res.ID, "released")
}

func TestIntegration_ReleaseExpired_SweepsHeldPastTTL(t *testing.T) {
	pool := testutil.StartPostgres(t)
	variantID := testutil.SeedVariant(t, pool, 10)
	svc := inventory.NewService(pool, nil)
	ctx := context.Background()

	// Negative TTL => already expired.
	res, err := svc.ReserveOne(ctx, variantID, 2, -1*time.Minute)
	if err != nil {
		t.Fatalf("reserve: %v", err)
	}
	n, err := svc.ReleaseExpired(ctx, 100)
	if err != nil {
		t.Fatalf("release expired: %v", err)
	}
	if n != 1 {
		t.Errorf("released %d expired reservations, want 1", n)
	}
	inv, _ := svc.GetInventory(ctx, variantID)
	if inv.Available != 10 || inv.Reserved != 0 {
		t.Errorf("after sweep: available %d / reserved %d, want 10 / 0", inv.Available, inv.Reserved)
	}
	assertReservationStatus(t, pool, res.ID, "expired")

	// A non-expired held reservation is left untouched by the sweeper.
	res2, _ := svc.ReserveOne(ctx, variantID, 1, time.Hour)
	if n, _ := svc.ReleaseExpired(ctx, 100); n != 0 {
		t.Errorf("swept %d non-expired reservations, want 0", n)
	}
	assertReservationStatus(t, pool, res2.ID, "held")
}

func assertReservationStatus(t *testing.T, pool *pgxpool.Pool, id uuid.UUID, want string) {
	t.Helper()
	res, err := invdb.New(pool).GetReservation(context.Background(), id)
	if err != nil {
		t.Fatalf("get reservation %s: %v", id, err)
	}
	if res.Status != want {
		t.Errorf("reservation status = %q, want %q", res.Status, want)
	}
}
