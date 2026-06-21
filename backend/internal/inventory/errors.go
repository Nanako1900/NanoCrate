// Package inventory implements the reservation-based stock engine: the
// oversell-prevention signature of NanoCrate (SPEC §7). The available/reserved
// double-count, an append-only ledger, and atomic conditional updates guarantee
// no oversell under concurrency.
package inventory

import "errors"

// ErrOutOfStock means the atomic conditional reserve affected zero rows: not
// enough available stock for the requested quantity.
var ErrOutOfStock = errors.New("out of stock")

// ErrReservationNotHeld means a commit/release found the reservation in a state
// other than 'held' (already committed, released, or expired) — a lost race.
var ErrReservationNotHeld = errors.New("reservation not held")

// ErrInvalidRestock means a restock was requested with a non-positive quantity.
var ErrInvalidRestock = errors.New("restock quantity must be positive")

// ErrStockConservation means an atomic stock transition (commit/release) affected
// a number of rows other than exactly one — the available/reserved invariant has
// been violated. It is a hard, transaction-aborting error: better to fail loudly
// and roll back than to write a ledger entry that silently breaks conservation.
var ErrStockConservation = errors.New("stock conservation violated")
