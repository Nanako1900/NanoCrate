// Package search is the SearchProvider port (SPEC §6/§8): semantic + keyword
// hybrid product search. The default implementation uses pgvector (cosine kNN) +
// Postgres full-text (tsvector) fused with Reciprocal Rank Fusion. Embeddings come
// from a configurable Embedder: a deterministic offline stub (default, so dev/test
// run with no API key) or OpenAI text-embedding-3-small.
package search

import (
	"context"
	"hash/fnv"
	"math"
	"strings"
	"unicode"
)

// Dim is the embedding dimensionality. It must match the products.embedding
// vector(1536) column and the OpenAI text-embedding-3-small output.
const Dim = 1536

// Embedder turns text into a fixed-dimension embedding vector.
type Embedder interface {
	Embed(ctx context.Context, text string) ([]float32, error)
	Dim() int
}

// StubEmbedder is a deterministic, offline embedder: a hashed bag-of-words
// projected onto Dim dimensions and L2-normalized. It needs no API key and is
// reproducible, so tests can assert ranking. Because shared tokens land on shared
// dimensions, texts with overlapping vocabulary have higher cosine similarity —
// enough to demonstrate "fuzzy description → relevant products" offline.
type StubEmbedder struct{ dim int }

// NewStubEmbedder builds the deterministic stub embedder.
func NewStubEmbedder() *StubEmbedder { return &StubEmbedder{dim: Dim} }

// Dim returns the embedding dimensionality.
func (s *StubEmbedder) Dim() int { return s.dim }

// Embed hashes tokens into dimensions and L2-normalizes. Empty/tokenless text
// yields a zero vector (the caller skips the semantic leg for those).
func (s *StubEmbedder) Embed(_ context.Context, text string) ([]float32, error) {
	vec := make([]float32, s.dim)
	for _, tok := range tokenize(text) {
		// Two independent hashes: one picks the dimension, one picks the sign,
		// which reduces collision cancellation (signed feature hashing).
		dim := hashWith(tok, 0) % uint32(s.dim)
		sign := float32(1)
		if hashWith(tok, 1)&1 == 1 {
			sign = -1
		}
		vec[dim] += sign
	}
	normalize(vec)
	return vec, nil
}

func tokenize(text string) []string {
	fields := strings.FieldsFunc(strings.ToLower(text), func(r rune) bool {
		return !unicode.IsLetter(r) && !unicode.IsNumber(r)
	})
	out := fields[:0]
	for _, f := range fields {
		if len(f) >= 2 { // drop single-char noise
			out = append(out, f)
		}
	}
	return out
}

func hashWith(s string, salt byte) uint32 {
	h := fnv.New32a()
	_, _ = h.Write([]byte{salt})
	_, _ = h.Write([]byte(s))
	return h.Sum32()
}

func normalize(vec []float32) {
	var sum float64
	for _, v := range vec {
		sum += float64(v) * float64(v)
	}
	if sum == 0 {
		return
	}
	norm := float32(math.Sqrt(sum))
	for i := range vec {
		vec[i] /= norm
	}
}

// isZero reports whether the vector has no magnitude (tokenless text).
func isZero(vec []float32) bool {
	for _, v := range vec {
		if v != 0 {
			return false
		}
	}
	return true
}
