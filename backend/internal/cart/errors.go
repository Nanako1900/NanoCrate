// Package cart implements the shopping cart: session resolution (guest cookie or
// JWT), item mutations, and the "latest cart" snapshot returned by every endpoint
// (contract §9.4).
package cart

import "errors"

// ErrVariantNotFound means an added variant does not exist (FK violation).
var ErrVariantNotFound = errors.New("variant not found")

// ErrItemNotFound means the cart item does not exist in the resolved cart.
var ErrItemNotFound = errors.New("cart item not found")

// ErrQtyTooLarge means a mutation would push a line's quantity above MaxLineQty
// (e.g. an accumulating add). Reported as validation_failed.
var ErrQtyTooLarge = errors.New("cart line quantity exceeds maximum")
