// Package checkout orchestrates the Stripe checkout saga (SPEC §7): atomically
// reserve every line + create the order in one transaction, create a payment
// intent, and settle on the (idempotent, signature-verified) Stripe webhook.
package checkout

import "errors"

// ErrEmptyCart means checkout was attempted on a cart with no items.
var ErrEmptyCart = errors.New("cart is empty")

// ErrCartNotFound means the cart id does not exist.
var ErrCartNotFound = errors.New("cart not found")

// OutOfStockError is returned when a line cannot be reserved. It carries the SKU
// for the contract message (§9.3).
type OutOfStockError struct {
	SKU string
}

func (e *OutOfStockError) Error() string {
	return e.SKU + " 库存不足"
}
