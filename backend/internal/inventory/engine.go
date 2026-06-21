package inventory

import (
	"context"
	"fmt"

	"github.com/google/uuid"

	invdb "github.com/Nanako1900/NanoCrate/backend/internal/inventory/db"
)

// reserve performs a single-line reservation against the given Queries (pool- or
// tx-backed): atomically decrement available / increment reserved, create the
// held reservation, and journal the movement.
//
// Oversell prevention: TryReserveStock is a single conditional UPDATE
// (... WHERE available >= qty). Postgres takes an implicit row lock and re-checks
// the predicate after acquiring it, so under any concurrency exactly the right
// number of reservations succeed; the rest affect zero rows -> ErrOutOfStock. The
// inventory CHECK (available >= 0) is the defense-in-depth backstop.
func reserve(ctx context.Context, q *invdb.Queries, in ReserveInput) (invdb.Reservation, error) {
	rows, err := q.TryReserveStock(ctx, invdb.TryReserveStockParams{
		VariantID: in.VariantID,
		Available: in.Qty,
	})
	if err != nil {
		return invdb.Reservation{}, fmt.Errorf("try reserve stock: %w", err)
	}
	if rows == 0 {
		return invdb.Reservation{}, ErrOutOfStock
	}
	return finishReserve(ctx, q, in)
}

// finishReserve creates the held reservation row and writes the reserve ledger entry.
func finishReserve(ctx context.Context, q *invdb.Queries, in ReserveInput) (invdb.Reservation, error) {
	res, err := q.CreateReservation(ctx, invdb.CreateReservationParams{
		OrderID:   pgUUIDPtr(in.OrderID),
		VariantID: in.VariantID,
		Qty:       in.Qty,
		ExpiresAt: in.ExpiresAt,
	})
	if err != nil {
		return invdb.Reservation{}, fmt.Errorf("create reservation: %w", err)
	}
	if err := q.InsertLedger(ctx, invdb.InsertLedgerParams{
		VariantID:      in.VariantID,
		DeltaAvailable: -in.Qty,
		DeltaReserved:  in.Qty,
		Kind:           kindReserve,
		ReservationID:  pgUUID(res.ID),
	}); err != nil {
		return invdb.Reservation{}, fmt.Errorf("ledger reserve: %w", err)
	}
	return res, nil
}

// commit confirms a held reservation: reserved-- (available already decremented
// at reserve time). Only acts on a 'held' reservation (idempotent vs races).
func commit(ctx context.Context, q *invdb.Queries, reservationID uuid.UUID) error {
	res, err := q.GetReservation(ctx, reservationID)
	if err != nil {
		return fmt.Errorf("get reservation: %w", err)
	}
	rows, err := q.MarkReservation(ctx, invdb.MarkReservationParams{ID: reservationID, Status: statusCommitted})
	if err != nil {
		return fmt.Errorf("mark committed: %w", err)
	}
	if rows == 0 {
		return ErrReservationNotHeld
	}
	affected, err := q.CommitReservedStock(ctx, invdb.CommitReservedStockParams{VariantID: res.VariantID, Reserved: res.Qty})
	if err != nil {
		return fmt.Errorf("commit stock: %w", err)
	}
	if affected != 1 {
		// reserved < qty: conservation is broken. Fail hard so the tx rolls back
		// instead of writing a ledger entry that would never reconcile.
		return fmt.Errorf("commit stock variant %s qty %d: %w", res.VariantID, res.Qty, ErrStockConservation)
	}
	return q.InsertLedger(ctx, invdb.InsertLedgerParams{
		VariantID:      res.VariantID,
		DeltaAvailable: 0,
		DeltaReserved:  -res.Qty,
		Kind:           kindCommit,
		ReservationID:  pgUUID(reservationID),
	})
}

// release returns a held reservation's stock: available++ / reserved--. status is
// 'released' or 'expired'; kind is the matching ledger kind. Only acts on 'held'.
func release(ctx context.Context, q *invdb.Queries, reservationID uuid.UUID, status, kind string) error {
	res, err := q.GetReservation(ctx, reservationID)
	if err != nil {
		return fmt.Errorf("get reservation: %w", err)
	}
	rows, err := q.MarkReservation(ctx, invdb.MarkReservationParams{ID: reservationID, Status: status})
	if err != nil {
		return fmt.Errorf("mark %s: %w", status, err)
	}
	if rows == 0 {
		return ErrReservationNotHeld
	}
	affected, err := q.ReleaseReservedStock(ctx, invdb.ReleaseReservedStockParams{VariantID: res.VariantID, Available: res.Qty})
	if err != nil {
		return fmt.Errorf("release stock: %w", err)
	}
	if affected != 1 {
		// reserved < qty: conservation is broken. Fail hard so the tx rolls back.
		return fmt.Errorf("release stock variant %s qty %d: %w", res.VariantID, res.Qty, ErrStockConservation)
	}
	return q.InsertLedger(ctx, invdb.InsertLedgerParams{
		VariantID:      res.VariantID,
		DeltaAvailable: res.Qty,
		DeltaReserved:  -res.Qty,
		Kind:           kind,
		ReservationID:  pgUUID(reservationID),
	})
}
