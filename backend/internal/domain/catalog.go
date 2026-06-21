// Package domain holds pure business entities for NanoCrate.
// It has no IO and no framework dependencies (dependencies point inward only).
package domain

import "encoding/json"

// ProductType is a category template declaring which attributes a product may carry.
type ProductType struct {
	Key             string
	Name            string
	AttributeSchema json.RawMessage
}

// ProductSummary is a product as shown in listing results, with the cheapest
// active variant price rolled up.
type ProductSummary struct {
	Slug           string
	Name           string
	Type           string
	Attributes     json.RawMessage
	ImageURL       string
	PriceFromCents int64
	Currency       string
}

// Variant is a sellable SKU together with its sellable quantity (available).
type Variant struct {
	ID         string
	SKU        string
	Name       string
	PriceCents int64
	Currency   string
	Attributes json.RawMessage
	Available  int32
}

// ProductDetail is a product with its sellable variants.
type ProductDetail struct {
	Slug        string
	Name        string
	Description string
	Type        string
	Attributes  json.RawMessage
	Variants    []Variant
}
