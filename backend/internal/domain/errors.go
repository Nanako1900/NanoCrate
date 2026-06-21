package domain

import "errors"

// ErrProductNotFound is returned when a requested product does not exist or is not active.
var ErrProductNotFound = errors.New("product not found")
