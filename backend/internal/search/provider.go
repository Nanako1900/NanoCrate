package search

import (
	"context"

	"github.com/google/uuid"
)

// Document is a product to (re)index: its id plus the text whose embedding +
// full-text vector power search (typically name + description + attribute values).
type Document struct {
	ProductID uuid.UUID
	Text      string
}

// Hit is one search result (contract §9.3): a product slug/name/type plus a fused
// relevance score (higher = more relevant).
type Hit struct {
	Slug  string  `json:"slug"`
	Name  string  `json:"name"`
	Type  string  `json:"type"`
	Score float64 `json:"score"`
}

// Provider is the SearchProvider port (SPEC §6): write an embedding for a product
// (Index) and run hybrid semantic+keyword search (Search). Default impl: pgvector.
type Provider interface {
	Index(ctx context.Context, doc Document) error
	Search(ctx context.Context, query string, limit int) ([]Hit, error)
}
