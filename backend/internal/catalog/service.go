package catalog

import (
	"context"
	"strings"

	"github.com/Nanako1900/NanoCrate/backend/internal/domain"
)

const (
	defaultLimit = 20
	maxLimit     = 100
	// maxOffset bounds deep pagination so the int32 offset can never overflow
	// (page arrives unbounded from the query string). Beyond it, results are empty anyway.
	maxOffset = 1_000_000
)

// allowedSorts maps each explicit sort value to its SQL form. Anything not in
// the map (including "" and "newest") collapses to the default ordering.
var allowedSorts = map[string]string{
	"price_asc":  "price_asc",
	"price_desc": "price_desc",
	"name":       "name",
}

// Service holds catalog business logic: input normalization, pagination bounds,
// and orchestration of repository calls.
type Service struct {
	repo Repository
}

// NewService wires a catalog service over the given repository.
func NewService(repo Repository) *Service {
	return &Service{repo: repo}
}

// ListParams are the raw (pre-normalization) list inputs from the handler.
type ListParams struct {
	Type  string
	Q     string
	Sort  string
	Page  int
	Limit int
}

// ProductList is a normalized page of products plus its pagination metadata.
type ProductList struct {
	Items []domain.ProductSummary
	Total int64
	Page  int
	Limit int
}

// ListProductTypes returns all category templates.
func (s *Service) ListProductTypes(ctx context.Context) ([]domain.ProductType, error) {
	return s.repo.ListProductTypes(ctx)
}

// ListProducts normalizes paging/sort/filters, then returns a page of products
// with the total count for the same filters.
func (s *Service) ListProducts(ctx context.Context, p ListParams) (ProductList, error) {
	page := p.Page
	if page < 1 {
		page = 1
	}
	limit := p.Limit
	if limit <= 0 {
		limit = defaultLimit
	}
	if limit > maxLimit {
		limit = maxLimit
	}

	offset := (page - 1) * limit
	if offset > maxOffset {
		offset = maxOffset
	}
	q := ProductQuery{
		Sort:   normalizeSort(p.Sort),
		Limit:  int32(limit),
		Offset: int32(offset),
	}
	if t := strings.TrimSpace(p.Type); t != "" {
		q.TypeKey = &t
	}
	if term := strings.TrimSpace(p.Q); term != "" {
		q.Q = &term
	}

	items, total, err := s.repo.ListProductsPage(ctx, q)
	if err != nil {
		return ProductList{}, err
	}
	return ProductList{Items: items, Total: total, Page: page, Limit: limit}, nil
}

// GetProduct returns a product detail by slug, or domain.ErrProductNotFound.
func (s *Service) GetProduct(ctx context.Context, slug string) (domain.ProductDetail, error) {
	slug = strings.TrimSpace(slug)
	if slug == "" {
		return domain.ProductDetail{}, domain.ErrProductNotFound
	}
	return s.repo.GetProductDetail(ctx, slug)
}

// normalizeSort maps client sort input to a SQL-recognized value. "newest" and
// any unrecognized value collapse to "" (the default created_at DESC ordering).
func normalizeSort(s string) string {
	return allowedSorts[strings.TrimSpace(s)]
}
