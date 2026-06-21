package catalog

import (
	"context"
	"encoding/json"
	"errors"
	"testing"

	"github.com/Nanako1900/NanoCrate/backend/internal/domain"
)

// fakeRepo is an in-memory Repository for service/handler unit tests.
type fakeRepo struct {
	lastQuery ProductQuery
	products  []domain.ProductSummary
	total     int64
	detail    domain.ProductDetail
	detailErr error
	typesErr  error
	pageErr   error
}

func (f *fakeRepo) ListProductTypes(context.Context) ([]domain.ProductType, error) {
	if f.typesErr != nil {
		return nil, f.typesErr
	}
	return []domain.ProductType{{Key: "keyboard", Name: "Keyboard", AttributeSchema: json.RawMessage(`{}`)}}, nil
}

func (f *fakeRepo) ListProductsPage(_ context.Context, q ProductQuery) ([]domain.ProductSummary, int64, error) {
	f.lastQuery = q
	if f.pageErr != nil {
		return nil, 0, f.pageErr
	}
	return f.products, f.total, nil
}

func (f *fakeRepo) GetProductDetail(_ context.Context, slug string) (domain.ProductDetail, error) {
	if f.detailErr != nil {
		return domain.ProductDetail{}, f.detailErr
	}
	f.detail.Slug = slug
	return f.detail, nil
}

func TestListProducts_NormalizesPagingAndSort(t *testing.T) {
	tests := []struct {
		name                       string
		in                         ListParams
		wantPage, wantLimit        int
		wantLimitParam, wantOffset int32
		wantSort                   string
		wantTypePtr, wantQPtr      bool
	}{
		{"defaults", ListParams{}, 1, 20, 20, 0, "", false, false},
		{"zero page clamps to 1", ListParams{Page: 0, Limit: 10}, 1, 10, 10, 0, "", false, false},
		{"negative page clamps to 1", ListParams{Page: -5, Limit: 10}, 1, 10, 10, 0, "", false, false},
		{"limit over max clamps", ListParams{Page: 1, Limit: 5000}, 1, 100, 100, 0, "", false, false},
		{"offset from page", ListParams{Page: 3, Limit: 10}, 3, 10, 10, 20, "", false, false},
		{"newest maps to default order", ListParams{Sort: "newest"}, 1, 20, 20, 0, "", false, false},
		{"unknown sort falls back", ListParams{Sort: "bogus"}, 1, 20, 20, 0, "", false, false},
		{"price_asc passes through", ListParams{Sort: "price_asc"}, 1, 20, 20, 0, "price_asc", false, false},
		{"type and q trimmed and set", ListParams{Type: " keyboard ", Q: " nano "}, 1, 20, 20, 0, "", true, true},
		{"blank type and q stay nil", ListParams{Type: "   ", Q: ""}, 1, 20, 20, 0, "", false, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			repo := &fakeRepo{total: 7}
			svc := NewService(repo)
			got, err := svc.ListProducts(context.Background(), tt.in)
			if err != nil {
				t.Fatalf("unexpected err: %v", err)
			}
			if got.Page != tt.wantPage || got.Limit != tt.wantLimit {
				t.Errorf("page/limit = %d/%d, want %d/%d", got.Page, got.Limit, tt.wantPage, tt.wantLimit)
			}
			if got.Total != 7 {
				t.Errorf("total = %d, want 7", got.Total)
			}
			q := repo.lastQuery
			if q.Limit != tt.wantLimitParam || q.Offset != tt.wantOffset {
				t.Errorf("query limit/offset = %d/%d, want %d/%d", q.Limit, q.Offset, tt.wantLimitParam, tt.wantOffset)
			}
			if q.Sort != tt.wantSort {
				t.Errorf("sort = %q, want %q", q.Sort, tt.wantSort)
			}
			if (q.TypeKey != nil) != tt.wantTypePtr {
				t.Errorf("typeKey set = %v, want %v", q.TypeKey != nil, tt.wantTypePtr)
			}
			if tt.wantTypePtr && q.TypeKey != nil && *q.TypeKey != "keyboard" {
				t.Errorf("typeKey = %q, want trimmed 'keyboard'", *q.TypeKey)
			}
			if (q.Q != nil) != tt.wantQPtr {
				t.Errorf("q set = %v, want %v", q.Q != nil, tt.wantQPtr)
			}
			if tt.wantQPtr && q.Q != nil && *q.Q != "nano" {
				t.Errorf("q = %q, want trimmed 'nano'", *q.Q)
			}
		})
	}
}

func TestGetProduct_EmptySlugIsNotFound(t *testing.T) {
	svc := NewService(&fakeRepo{})
	for _, slug := range []string{"", "   "} {
		_, err := svc.GetProduct(context.Background(), slug)
		if !errors.Is(err, domain.ErrProductNotFound) {
			t.Errorf("slug %q: err = %v, want ErrProductNotFound", slug, err)
		}
	}
}

func TestGetProduct_PropagatesNotFound(t *testing.T) {
	svc := NewService(&fakeRepo{detailErr: domain.ErrProductNotFound})
	_, err := svc.GetProduct(context.Background(), "ghost")
	if !errors.Is(err, domain.ErrProductNotFound) {
		t.Errorf("err = %v, want ErrProductNotFound", err)
	}
}

func TestGetProduct_TrimsSlug(t *testing.T) {
	repo := &fakeRepo{detail: domain.ProductDetail{Name: "X"}}
	svc := NewService(repo)
	got, err := svc.GetProduct(context.Background(), "  nano75  ")
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	if got.Slug != "nano75" {
		t.Errorf("slug = %q, want trimmed 'nano75'", got.Slug)
	}
}
