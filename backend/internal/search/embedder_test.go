package search

import (
	"context"
	"math"
	"testing"
)

func cosine(a, b []float32) float64 {
	var dot, na, nb float64
	for i := range a {
		dot += float64(a[i]) * float64(b[i])
		na += float64(a[i]) * float64(a[i])
		nb += float64(b[i]) * float64(b[i])
	}
	if na == 0 || nb == 0 {
		return 0
	}
	return dot / (math.Sqrt(na) * math.Sqrt(nb))
}

func TestStubEmbedder_DeterministicAndUnit(t *testing.T) {
	e := NewStubEmbedder()
	ctx := context.Background()
	a, _ := e.Embed(ctx, "75% hot-swappable mechanical keyboard")
	b, _ := e.Embed(ctx, "75% hot-swappable mechanical keyboard")
	if len(a) != Dim {
		t.Fatalf("dim = %d, want %d", len(a), Dim)
	}
	for i := range a {
		if a[i] != b[i] {
			t.Fatalf("stub embedder not deterministic at %d", i)
		}
	}
	if n := cosine(a, a); math.Abs(n-1.0) > 1e-6 {
		t.Errorf("self-cosine = %v, want ~1 (L2-normalized)", n)
	}
}

func TestStubEmbedder_LexicalOverlapRaisesSimilarity(t *testing.T) {
	e := NewStubEmbedder()
	ctx := context.Background()
	q, _ := e.Embed(ctx, "quiet full-size keyboard for the office")
	related, _ := e.Embed(ctx, "full size silent office keyboard")
	unrelated, _ := e.Embed(ctx, "red leather running shoes")

	if cosine(q, related) <= cosine(q, unrelated) {
		t.Errorf("related cosine %.4f should exceed unrelated %.4f", cosine(q, related), cosine(q, unrelated))
	}
}

func TestStubEmbedder_EmptyTextIsZero(t *testing.T) {
	v, _ := NewStubEmbedder().Embed(context.Background(), "  !!  ")
	if !isZero(v) {
		t.Error("tokenless text should embed to the zero vector")
	}
}
