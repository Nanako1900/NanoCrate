package inventory

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	invdb "github.com/Nanako1900/NanoCrate/backend/internal/inventory/db"
)

// Service owns the connection pool and metrics for inventory operations. Reserve/
// commit/release each run in a transaction; the *InTx variants join a caller's
// transaction (used by the checkout saga for multi-line atomicity).
type Service struct {
	pool    *pgxpool.Pool
	metrics Metrics
}

// NewService builds an inventory service.
func NewService(pool *pgxpool.Pool, metrics Metrics) *Service {
	if metrics == nil {
		metrics = NoopMetrics{}
	}
	return &Service{pool: pool, metrics: metrics}
}

// ReserveOne reserves qty of one variant in its own transaction. Returns
// ErrOutOfStock (and records a conflict metric) when stock is insufficient.
func (s *Service) ReserveOne(ctx context.Context, variantID uuid.UUID, qty int32, ttl time.Duration) (invdb.Reservation, error) {
	in := ReserveInput{VariantID: variantID, Qty: qty, ExpiresAt: time.Now().Add(ttl)}
	var res invdb.Reservation
	err := s.inTx(ctx, func(q *invdb.Queries) error {
		var e error
		res, e = s.ReserveInTx(ctx, q, in)
		return e
	})
	return res, err
}

// ReserveInTx reserves within a caller-provided transaction's Queries.
func (s *Service) ReserveInTx(ctx context.Context, q *invdb.Queries, in ReserveInput) (invdb.Reservation, error) {
	res, err := reserve(ctx, q, in)
	if errors.Is(err, ErrOutOfStock) {
		s.metrics.IncInventoryConflict()
	}
	return res, err
}

// CommitInTx commits a reservation within a caller-provided transaction.
func (s *Service) CommitInTx(ctx context.Context, q *invdb.Queries, reservationID uuid.UUID) error {
	return commit(ctx, q, reservationID)
}

// ReleaseInTx releases a reservation within a caller-provided transaction.
func (s *Service) ReleaseInTx(ctx context.Context, q *invdb.Queries, reservationID uuid.UUID) error {
	return release(ctx, q, reservationID, statusReleased, kindRelease)
}

// Commit commits a single reservation in its own transaction.
func (s *Service) Commit(ctx context.Context, reservationID uuid.UUID) error {
	return s.inTx(ctx, func(q *invdb.Queries) error {
		return commit(ctx, q, reservationID)
	})
}

// Release releases a single reservation in its own transaction.
func (s *Service) Release(ctx context.Context, reservationID uuid.UUID) error {
	return s.inTx(ctx, func(q *invdb.Queries) error {
		return release(ctx, q, reservationID, statusReleased, kindRelease)
	})
}

// ReleaseExpired finds up to limit expired held reservations and releases each in
// its own transaction (re-checking 'held' inside, so it cannot double-release vs a
// concurrent webhook). Returns the number actually released. This is the function
// a Phase-3 sweeper schedules; the logic and its test live here now.
func (s *Service) ReleaseExpired(ctx context.Context, limit int32) (int, error) {
	expired, err := invdb.New(s.pool).ListExpiredHeldReservations(ctx, limit)
	if err != nil {
		return 0, fmt.Errorf("list expired reservations: %w", err)
	}
	released := 0
	for _, r := range expired {
		err := s.inTx(ctx, func(q *invdb.Queries) error {
			return release(ctx, q, r.ID, statusExpired, kindExpire)
		})
		switch {
		case err == nil:
			released++
		case errors.Is(err, ErrReservationNotHeld):
			// Lost the race to a concurrent commit/release; skip.
			continue
		default:
			return released, err
		}
	}
	return released, nil
}

// GetInventory returns the current counts for a variant (read-only helper).
func (s *Service) GetInventory(ctx context.Context, variantID uuid.UUID) (invdb.Inventory, error) {
	return invdb.New(s.pool).GetInventory(ctx, variantID)
}

// Restock adds qty to a variant's available stock (admin), creating the inventory
// row if absent, and journals a 'restock' ledger entry — all in one transaction.
func (s *Service) Restock(ctx context.Context, variantID uuid.UUID, qty int32) (invdb.Inventory, error) {
	if qty <= 0 {
		return invdb.Inventory{}, ErrInvalidRestock
	}
	var inv invdb.Inventory
	err := s.inTx(ctx, func(q *invdb.Queries) error {
		if _, e := q.RestockStock(ctx, invdb.RestockStockParams{VariantID: variantID, Available: qty}); e != nil {
			return fmt.Errorf("restock stock: %w", e)
		}
		if e := q.InsertLedger(ctx, invdb.InsertLedgerParams{
			VariantID:      variantID,
			DeltaAvailable: qty,
			DeltaReserved:  0,
			Kind:           kindRestock,
			ReservationID:  pgUUIDPtr(nil),
		}); e != nil {
			return fmt.Errorf("ledger restock: %w", e)
		}
		var ge error
		inv, ge = q.GetInventory(ctx, variantID)
		return ge
	})
	return inv, err
}

// EnsureInventoryRow creates a zeroed inventory row for a new variant if absent.
func (s *Service) EnsureInventoryRow(ctx context.Context, variantID uuid.UUID) error {
	return invdb.New(s.pool).EnsureInventoryRow(ctx, variantID)
}

// inTx runs fn inside a transaction (default READ COMMITTED, which is correct for
// the atomic conditional reserve).
func (s *Service) inTx(ctx context.Context, fn func(*invdb.Queries) error) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if err := fn(invdb.New(tx)); err != nil {
		return err
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit tx: %w", err)
	}
	return nil
}
