package inventory

import (
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
)

// ReserveInput describes a single-line reservation request.
type ReserveInput struct {
	VariantID uuid.UUID
	Qty       int32
	OrderID   *uuid.UUID // nil for standalone reservations
	ExpiresAt time.Time
}

// Reservation status values (the state machine: held → committed/released/expired).
const (
	statusCommitted = "committed"
	statusReleased  = "released"
	statusExpired   = "expired"
)

// stock_ledger kinds.
const (
	kindReserve = "reserve"
	kindCommit  = "commit"
	kindRelease = "release"
	kindExpire  = "expire"
)

func pgUUID(id uuid.UUID) pgtype.UUID {
	return pgtype.UUID{Bytes: id, Valid: true}
}

func pgUUIDPtr(id *uuid.UUID) pgtype.UUID {
	if id == nil {
		return pgtype.UUID{}
	}
	return pgtype.UUID{Bytes: *id, Valid: true}
}
