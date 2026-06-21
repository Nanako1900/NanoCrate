package search

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/pgvector/pgvector-go"
)

const (
	defaultLimit      = 10
	maxLimit          = 50
	defaultCandidateK = 200 // per-leg candidate pool before fusion (decoupled from maxLimit)
	rrfK              = 60  // Reciprocal Rank Fusion constant (standard default)
)

// PgVector is the default SearchProvider: pgvector cosine kNN for the semantic leg
// and Postgres full-text (tsvector) for the keyword leg, fused with Reciprocal
// Rank Fusion. Vectors cross the pgx boundary as text with an explicit ::vector
// cast (parameterized — pgvector-go v0.4.0 ships no pgx-v5 codec).
type PgVector struct {
	pool       *pgxpool.Pool
	embedder   Embedder
	candidateK int
}

// Option customizes the pgvector provider.
type Option func(*PgVector)

// WithCandidateK overrides the per-leg candidate pool size (values <= 0 ignored).
func WithCandidateK(n int) Option {
	return func(p *PgVector) {
		if n > 0 {
			p.candidateK = n
		}
	}
}

// NewPgVector builds the pgvector search provider.
func NewPgVector(pool *pgxpool.Pool, embedder Embedder, opts ...Option) *PgVector {
	p := &PgVector{pool: pool, embedder: embedder, candidateK: defaultCandidateK}
	for _, o := range opts {
		o(p)
	}
	return p
}

// Index computes and stores the product's embedding (the tsvector column is a
// generated column maintained by Postgres, so only the embedding is written here).
func (p *PgVector) Index(ctx context.Context, doc Document) error {
	vec, err := p.embedder.Embed(ctx, doc.Text)
	if err != nil {
		return fmt.Errorf("embed product %s: %w", doc.ProductID, err)
	}
	// Only the embedding is touched — not products.updated_at, which is a business
	// audit column and must not be churned by (re)indexing/backfill.
	if _, err := p.pool.Exec(ctx,
		`UPDATE products SET embedding = $1::vector WHERE id = $2`,
		pgvector.NewVector(vec).String(), doc.ProductID,
	); err != nil {
		return fmt.Errorf("write embedding for %s: %w", doc.ProductID, err)
	}
	return nil
}

// Search runs hybrid semantic+keyword search fused with RRF. When the query embeds
// to a zero vector (tokenless), it falls back to keyword-only so the semantic leg
// never produces NaN cosine distances.
func (p *PgVector) Search(ctx context.Context, query string, limit int) ([]Hit, error) {
	if limit <= 0 {
		limit = defaultLimit
	}
	if limit > maxLimit {
		limit = maxLimit
	}
	vec, err := p.embedder.Embed(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("embed query: %w", err)
	}
	if isZero(vec) {
		return p.keywordOnly(ctx, query, limit)
	}
	return p.hybrid(ctx, pgvector.NewVector(vec).String(), query, limit)
}

func (p *PgVector) hybrid(ctx context.Context, vecStr, query string, limit int) ([]Hit, error) {
	const sql = `
WITH semantic AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY embedding <=> $1::vector, id) AS rnk
    FROM products
    WHERE status = 'active' AND embedding IS NOT NULL
    ORDER BY embedding <=> $1::vector, id
    LIMIT $3
),
keyword AS (
    SELECT id, ROW_NUMBER() OVER (
        ORDER BY ts_rank(search_tsv, plainto_tsquery('english', $2)) DESC, id
    ) AS rnk
    FROM products
    WHERE status = 'active' AND search_tsv @@ plainto_tsquery('english', $2)
    ORDER BY ts_rank(search_tsv, plainto_tsquery('english', $2)) DESC, id
    LIMIT $3
),
fused AS (
    SELECT u.id,
           COALESCE(1.0 / ($4 + s.rnk), 0) + COALESCE(1.0 / ($4 + k.rnk), 0) AS score
    FROM (SELECT id FROM semantic UNION SELECT id FROM keyword) u
    LEFT JOIN semantic s ON s.id = u.id
    LEFT JOIN keyword k ON k.id = u.id
)
SELECT p.slug, p.name, pt.key AS type, f.score
FROM fused f
JOIN products p ON p.id = f.id
JOIN product_types pt ON pt.id = p.product_type_id
ORDER BY f.score DESC, p.slug
LIMIT $5`
	rows, err := p.pool.Query(ctx, sql, vecStr, query, p.candidateK, rrfK, limit)
	if err != nil {
		return nil, fmt.Errorf("hybrid search: %w", err)
	}
	return scanHits(rows)
}

func (p *PgVector) keywordOnly(ctx context.Context, query string, limit int) ([]Hit, error) {
	const sql = `
SELECT p.slug, p.name, pt.key AS type,
       ts_rank(p.search_tsv, plainto_tsquery('english', $1)) AS score
FROM products p
JOIN product_types pt ON pt.id = p.product_type_id
WHERE p.status = 'active' AND p.search_tsv @@ plainto_tsquery('english', $1)
ORDER BY score DESC, p.slug
LIMIT $2`
	rows, err := p.pool.Query(ctx, sql, query, limit)
	if err != nil {
		return nil, fmt.Errorf("keyword search: %w", err)
	}
	return scanHits(rows)
}

func scanHits(rows pgx.Rows) ([]Hit, error) {
	defer rows.Close()
	hits := make([]Hit, 0)
	for rows.Next() {
		var h Hit
		if err := rows.Scan(&h.Slug, &h.Name, &h.Type, &h.Score); err != nil {
			return nil, fmt.Errorf("scan hit: %w", err)
		}
		hits = append(hits, h)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate hits: %w", err)
	}
	return hits, nil
}

// compile-time guard.
var _ Provider = (*PgVector)(nil)
