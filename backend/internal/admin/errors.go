package admin

import "errors"

// ErrProductNotFound means the product id does not exist.
var ErrProductNotFound = errors.New("product not found")

// ErrVariantNotFound means the variant id does not exist.
var ErrVariantNotFound = errors.New("variant not found")

// ErrProductTypeNotFound means the product type key does not exist.
var ErrProductTypeNotFound = errors.New("product type not found")

// ErrSlugConflict means the slug (or SKU) is already taken.
var ErrSlugConflict = errors.New("slug or sku already exists")

// ValidationError carries field-located attribute validation failures (§9.5).
type ValidationError struct {
	Details []FieldError
}

func (e *ValidationError) Error() string { return "attribute validation failed" }
