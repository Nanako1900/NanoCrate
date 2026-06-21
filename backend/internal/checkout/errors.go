// Package checkout orchestrates the Stripe checkout saga (SPEC §7): atomically
// reserve every line + create the order in one transaction, create a payment
// intent, and settle on the (idempotent, signature-verified) Stripe webhook.
package checkout

import "errors"

// ErrEmptyCart means checkout was attempted on a cart with no items.
var ErrEmptyCart = errors.New("cart is empty")

// ErrCartNotFound means the cart id does not exist or the caller is not allowed
// to check it out (a wrong/missing owner is reported as not-found, not forbidden,
// to avoid leaking which cart ids exist).
var ErrCartNotFound = errors.New("cart not found")

// ErrCartNotActive means the cart is no longer in the 'active' state (already
// converted by a prior or concurrent checkout, or abandoned). Maps to 409.
var ErrCartNotActive = errors.New("cart is not active")

// ErrLineQtyTooLarge means a cart line exceeds the per-line quantity cap allowed
// at checkout (defense against a single line locking a whole SKU). Maps to 422.
var ErrLineQtyTooLarge = errors.New("cart line quantity exceeds maximum")

// OutOfStockError is returned when a line cannot be reserved. It carries the SKU
// for the contract message (§9.3).
type OutOfStockError struct {
	SKU string
}

func (e *OutOfStockError) Error() string {
	return e.SKU + " 库存不足"
}
