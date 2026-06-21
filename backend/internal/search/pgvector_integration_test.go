//go:build integration

package search_test

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/Nanako1900/NanoCrate/backend/internal/search"
	"github.com/Nanako1900/NanoCrate/backend/internal/testutil"
)

const keyboardType = "11111111-1111-1111-1111-111111111111"

// clearProducts removes the migration seed so a ranking test controls its dataset
// (the product_types row is preserved for re-seeding).
func clearProducts(t *testing.T, pool *pgxpool.Pool) {
	t.Helper()
	if _, err := pool.Exec(context.Background(), `TRUNCATE products CASCADE`); err != nil {
		t.Fatalf("clear products: %v", err)
	}
}

// seedProduct inserts an active product (under the seeded keyboard type) and
// returns its id; text is what we index for search.
func seedProduct(t *testing.T, pool *pgxpool.Pool, slug, name, desc string) uuid.UUID {
	t.Helper()
	var id uuid.UUID
	err := pool.QueryRow(context.Background(),
		`INSERT INTO products (slug, product_type_id, name, description, status)
		 VALUES ($1, $2, $3, $4, 'active') RETURNING id`,
		slug, keyboardType, name, desc).Scan(&id)
	if err != nil {
		t.Fatalf("seed product %s: %v", slug, err)
	}
	return id
}

func indexAll(t *testing.T, sp *search.PgVector, docs map[uuid.UUID]string) {
	t.Helper()
	for id, text := range docs {
		if err := sp.Index(context.Background(), search.Document{ProductID: id, Text: text}); err != nil {
			t.Fatalf("index %s: %v", id, err)
		}
	}
}

func slugs(hits []search.Hit) []string {
	out := make([]string, len(hits))
	for i, h := range hits {
		out[i] = h.Slug
	}
	return out
}

func TestIntegration_HybridSearch_FuzzyDescriptionFindsKeyboard(t *testing.T) {
	pool := testutil.StartPostgres(t)
	ctx := context.Background()
	sp := search.NewPgVector(pool, search.NewStubEmbedder())
	clearProducts(t, pool)

	full := seedProduct(t, pool, "test-full", "Nano Full",
		"full size keyboard with silent linear switches, quiet and great for the office and finance work")
	compact := seedProduct(t, pool, "test-60", "Nano Sixty",
		"compact sixty percent keyboard for gaming with a minimal desk footprint")
	coffee := seedProduct(t, pool, "test-coffee", "Cocoa Roast",
		"single origin coffee beans medium roast chocolate notes")

	indexAll(t, sp, map[uuid.UUID]string{
		full:    "Nano Full full size keyboard silent linear switches quiet office finance",
		compact: "Nano Sixty compact sixty percent keyboard gaming minimal desk",
		coffee:  "Cocoa Roast single origin coffee beans medium roast chocolate",
	})

	// Embeddings were written.
	var n int
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM products WHERE embedding IS NOT NULL AND slug LIKE 'test-%'`).Scan(&n)
	if n != 3 {
		t.Fatalf("indexed embeddings = %d, want 3", n)
	}

	// Fuzzy natural-language query → the quiet full-size office keyboard ranks first,
	// and the unrelated coffee product is not the top hit.
	hits, err := sp.Search(ctx, "a quiet full size keyboard for a calm office", 5)
	if err != nil {
		t.Fatalf("search: %v", err)
	}
	if len(hits) == 0 {
		t.Fatal("no hits")
	}
	if hits[0].Slug != "test-full" {
		t.Errorf("top hit = %q (all: %v), want test-full", hits[0].Slug, slugs(hits))
	}
	if hits[0].Type != "keyboard" || hits[0].Score <= 0 {
		t.Errorf("top hit shape = %+v", hits[0])
	}

	// A gaming query ranks the compact board above the full-size one.
	gaming, _ := sp.Search(ctx, "compact keyboard for gaming", 5)
	if len(gaming) == 0 || gaming[0].Slug != "test-60" {
		t.Errorf("gaming top hit = %v, want test-60", slugs(gaming))
	}
}

func TestIntegration_Search_KeywordRecallAndArchivedExcluded(t *testing.T) {
	pool := testutil.StartPostgres(t)
	ctx := context.Background()
	sp := search.NewPgVector(pool, search.NewStubEmbedder())
	clearProducts(t, pool)

	id := seedProduct(t, pool, "test-tkl", "Tenkeyless Pro", "tenkeyless aluminium keyboard for typists")
	indexAll(t, sp, map[uuid.UUID]string{id: "Tenkeyless Pro tenkeyless aluminium keyboard typists"})

	hits, err := sp.Search(ctx, "aluminium tenkeyless", 5)
	if err != nil {
		t.Fatalf("search: %v", err)
	}
	if len(hits) == 0 || hits[0].Slug != "test-tkl" {
		t.Errorf("keyword recall = %v, want test-tkl", slugs(hits))
	}

	// Archived products must not surface.
	if _, err := pool.Exec(ctx, `UPDATE products SET status='archived' WHERE slug='test-tkl'`); err != nil {
		t.Fatal(err)
	}
	hits, _ = sp.Search(ctx, "aluminium tenkeyless", 5)
	for _, h := range hits {
		if h.Slug == "test-tkl" {
			t.Errorf("archived product surfaced in search: %v", slugs(hits))
		}
	}
}
