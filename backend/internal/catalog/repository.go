// Package catalog implements the public product catalog vertical slice:
// handler (HTTP) -> service (business) -> repository (data) -> domain (entities).
package catalog

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	catalogdb "github.com/Nanako1900/NanoCrate/backend/internal/catalog/db"
	"github.com/Nanako1900/NanoCrate/backend/internal/domain"
)

// ProductQuery carries already-normalized list filters from the service to the repository.
type ProductQuery struct {
	TypeKey *string
	Q       *string
	Sort    string
	Limit   int32
	Offset  int32
}

// Repository is the catalog data-access boundary. The pgx-backed implementation
// lives here; tests substitute an in-memory fake.
type Repository interface {
	ListProductTypes(ctx context.Context) ([]domain.ProductType, error)
	// ListProductsPage returns one page of products together with the total count
	// for the same filters, read from a single consistent snapshot.
	ListProductsPage(ctx context.Context, q ProductQuery) ([]domain.ProductSummary, int64, error)
	GetProductDetail(ctx context.Context, slug string) (domain.ProductDetail, error)
}

type pgRepository struct {
	pool *pgxpool.Pool
	q    *catalogdb.Queries
}

// NewRepository builds a Postgres-backed catalog repository over the given pool.
func NewRepository(pool *pgxpool.Pool) Repository {
	return &pgRepository{pool: pool, q: catalogdb.New(pool)}
}

func (r *pgRepository) ListProductTypes(ctx context.Context) ([]domain.ProductType, error) {
	rows, err := r.q.ListProductTypes(ctx)
	if err != nil {
		return nil, fmt.Errorf("list product types: %w", err)
	}
	out := make([]domain.ProductType, 0, len(rows))
	for _, row := range rows {
		out = append(out, domain.ProductType{
			Key:             row.Key,
			Name:            row.Name,
			AttributeSchema: row.AttributeSchema,
		})
	}
	return out, nil
}

// ListProductsPage runs the page query and its matching count inside one
// read-only REPEATABLE READ transaction, so the returned items and total always
// agree even under concurrent writes.
func (r *pgRepository) ListProductsPage(ctx context.Context, q ProductQuery) ([]domain.ProductSummary, int64, error) {
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{
		IsoLevel:   pgx.RepeatableRead,
		AccessMode: pgx.ReadOnly,
	})
	if err != nil {
		return nil, 0, fmt.Errorf("begin read tx: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	qtx := r.q.WithTx(tx)
	rows, err := qtx.ListProducts(ctx, catalogdb.ListProductsParams{
		Limit:   q.Limit,
		Offset:  q.Offset,
		TypeKey: q.TypeKey,
		Q:       q.Q,
		Sort:    q.Sort,
	})
	if err != nil {
		return nil, 0, fmt.Errorf("list products: %w", err)
	}
	total, err := qtx.CountProducts(ctx, catalogdb.CountProductsParams{
		TypeKey: q.TypeKey,
		Q:       q.Q,
	})
	if err != nil {
		return nil, 0, fmt.Errorf("count products: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, 0, fmt.Errorf("commit read tx: %w", err)
	}

	out := make([]domain.ProductSummary, 0, len(rows))
	for _, row := range rows {
		out = append(out, domain.ProductSummary{
			Slug:           row.Slug,
			Name:           row.Name,
			Type:           row.Type,
			Attributes:     row.Attributes,
			ImageURL:       row.ImageUrl,
			PriceFromCents: row.PriceFromCents,
			Currency:       row.Currency,
		})
	}
	return out, total, nil
}

func (r *pgRepository) GetProductDetail(ctx context.Context, slug string) (domain.ProductDetail, error) {
	p, err := r.q.GetProductBySlug(ctx, slug)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.ProductDetail{}, domain.ErrProductNotFound
		}
		return domain.ProductDetail{}, fmt.Errorf("get product by slug: %w", err)
	}
	variants, err := r.q.ListVariantsByProductID(ctx, p.ID)
	if err != nil {
		return domain.ProductDetail{}, fmt.Errorf("list variants: %w", err)
	}
	detail := domain.ProductDetail{
		Slug:        p.Slug,
		Name:        p.Name,
		Description: p.Description,
		Type:        p.Type,
		Attributes:  p.Attributes,
		Variants:    make([]domain.Variant, 0, len(variants)),
	}
	for _, v := range variants {
		detail.Variants = append(detail.Variants, domain.Variant{
			ID:         v.ID.String(),
			SKU:        v.Sku,
			Name:       v.Name,
			PriceCents: v.PriceCents,
			Currency:   v.Currency,
			Attributes: v.Attributes,
			Available:  v.Available,
		})
	}
	return detail, nil
}
