//go:build integration

package catalog_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sort"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"

	"github.com/Nanako1900/NanoCrate/backend/internal/catalog"
)

// startPostgres boots a pgvector-enabled Postgres container, applies the catalog
// migrations (schema + keyboard demo seed), and returns a ready pool.
func startPostgres(t *testing.T) *pgxpool.Pool {
	t.Helper()
	ctx := context.Background()

	container, err := postgres.Run(ctx, "pgvector/pgvector:pg16",
		postgres.WithDatabase("nanocrate"),
		postgres.WithUsername("nano"),
		postgres.WithPassword("nano"),
		testcontainers.WithWaitStrategy(
			wait.ForListeningPort("5432/tcp").WithStartupTimeout(90*time.Second),
		),
	)
	if err != nil {
		t.Fatalf("start postgres container: %v", err)
	}
	t.Cleanup(func() { _ = container.Terminate(context.Background()) })

	dsn, err := container.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		t.Fatalf("connection string: %v", err)
	}

	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatalf("new pool: %v", err)
	}
	t.Cleanup(pool.Close)
	waitForDB(t, ctx, pool)
	applyMigrations(t, ctx, pool)
	return pool
}

func waitForDB(t *testing.T, ctx context.Context, pool *pgxpool.Pool) {
	t.Helper()
	for i := 0; i < 40; i++ {
		if err := pool.Ping(ctx); err == nil {
			return
		}
		time.Sleep(250 * time.Millisecond)
	}
	t.Fatal("database never became ready")
}

func applyMigrations(t *testing.T, ctx context.Context, pool *pgxpool.Pool) {
	t.Helper()
	files, err := filepath.Glob(filepath.Join("..", "..", "db", "migrations", "*.up.sql"))
	if err != nil {
		t.Fatalf("glob migrations: %v", err)
	}
	if len(files) == 0 {
		t.Fatal("no migrations found")
	}
	sort.Strings(files)
	for _, f := range files {
		sqlBytes, err := os.ReadFile(f)
		if err != nil {
			t.Fatalf("read %s: %v", f, err)
		}
		if _, err := pool.Exec(ctx, string(sqlBytes)); err != nil {
			t.Fatalf("apply %s: %v", filepath.Base(f), err)
		}
	}
}

func buildRouter(pool *pgxpool.Pool) *gin.Engine {
	gin.SetMode(gin.TestMode)
	repo := catalog.NewRepository(pool)
	svc := catalog.NewService(repo)
	handler := catalog.NewHandler(svc)
	r := gin.New()
	handler.Register(r.Group("/api/v1"))
	return r
}

type apiResponse struct {
	Success bool            `json:"success"`
	Data    json.RawMessage `json:"data"`
	Error   *struct {
		Code    string `json:"code"`
		Message string `json:"message"`
	} `json:"error"`
	Meta *struct {
		Total int64 `json:"total"`
		Page  int   `json:"page"`
		Limit int   `json:"limit"`
	} `json:"meta"`
}

func get(t *testing.T, r *gin.Engine, path string) (int, apiResponse) {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, path, nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	var resp apiResponse
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode %s: %v (body=%s)", path, err, w.Body.String())
	}
	return w.Code, resp
}

func TestIntegration_ProductTypes(t *testing.T) {
	r := buildRouter(startPostgres(t))
	code, resp := get(t, r, "/api/v1/product-types")
	if code != http.StatusOK || !resp.Success {
		t.Fatalf("status=%d success=%v", code, resp.Success)
	}
	var types []struct {
		Key  string `json:"key"`
		Name string `json:"name"`
	}
	if err := json.Unmarshal(resp.Data, &types); err != nil {
		t.Fatalf("decode types: %v", err)
	}
	if len(types) != 1 || types[0].Key != "keyboard" {
		t.Fatalf("types = %+v, want one 'keyboard'", types)
	}
}

func TestIntegration_ListProductsPaginationAndFilter(t *testing.T) {
	r := buildRouter(startPostgres(t))

	code, resp := get(t, r, "/api/v1/products?type=keyboard&page=1&limit=2")
	if code != http.StatusOK || !resp.Success {
		t.Fatalf("status=%d success=%v", code, resp.Success)
	}
	// 9 active keyboards after the 0010 demo-seed expansion (3 base + 6 added).
	if resp.Meta == nil || resp.Meta.Total != 9 || resp.Meta.Limit != 2 {
		t.Fatalf("meta = %+v, want total=9 limit=2", resp.Meta)
	}
	var items []struct {
		Slug           string `json:"slug"`
		Type           string `json:"type"`
		PriceFromCents int64  `json:"price_from_cents"`
		Currency       string `json:"currency"`
		Image          string `json:"image"`
	}
	if err := json.Unmarshal(resp.Data, &items); err != nil {
		t.Fatalf("decode items: %v", err)
	}
	if len(items) != 2 {
		t.Fatalf("got %d items, want 2 (page size)", len(items))
	}
	for _, it := range items {
		if it.Type != "keyboard" || it.PriceFromCents <= 0 || it.Currency == "" || it.Image == "" {
			t.Errorf("item missing contract fields: %+v", it)
		}
	}

	// Search filter narrows results.
	_, searchResp := get(t, r, "/api/v1/products?q=nano65")
	if searchResp.Meta == nil || searchResp.Meta.Total != 1 {
		t.Fatalf("search meta = %+v, want total=1", searchResp.Meta)
	}
}

func TestIntegration_ProductDetailWithVariants(t *testing.T) {
	r := buildRouter(startPostgres(t))
	code, resp := get(t, r, "/api/v1/products/nano75")
	if code != http.StatusOK || !resp.Success {
		t.Fatalf("status=%d success=%v", code, resp.Success)
	}
	var detail struct {
		Slug     string `json:"slug"`
		Type     string `json:"type"`
		Variants []struct {
			SKU       string `json:"sku"`
			Available int32  `json:"available"`
		} `json:"variants"`
	}
	if err := json.Unmarshal(resp.Data, &detail); err != nil {
		t.Fatalf("decode detail: %v", err)
	}
	if detail.Slug != "nano75" || detail.Type != "keyboard" {
		t.Fatalf("detail = %+v", detail)
	}
	if len(detail.Variants) != 2 {
		t.Fatalf("got %d variants, want 2", len(detail.Variants))
	}
	bySKU := map[string]int32{}
	for _, v := range detail.Variants {
		bySKU[v.SKU] = v.Available
	}
	if bySKU["NANO75-RED-PBTW"] != 12 || bySKU["NANO75-BRN-ABS"] != 30 {
		t.Fatalf("available mismatch: %+v", bySKU)
	}
}

func TestIntegration_ProductNotFound(t *testing.T) {
	r := buildRouter(startPostgres(t))
	code, resp := get(t, r, "/api/v1/products/does-not-exist")
	if code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", code)
	}
	if resp.Success || resp.Error == nil || resp.Error.Code != "not_found" {
		t.Fatalf("resp = %+v, want not_found error", resp)
	}
}
