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
