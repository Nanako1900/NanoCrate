package catalog

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"

	"github.com/Nanako1900/NanoCrate/backend/internal/domain"
)

func newTestHandler(repo Repository) *gin.Engine {
	gin.SetMode(gin.TestMode)
	h := NewHandler(NewService(repo))
	r := gin.New()
	h.Register(r.Group("/api/v1"))
	return r
}

func do(t *testing.T, r *gin.Engine, path string) (int, map[string]any) {
	t.Helper()
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, path, nil))
	var body map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode %s: %v (%s)", path, err, w.Body.String())
	}
	return w.Code, body
}

func TestHandler_ListProducts_OKWithMeta(t *testing.T) {
	repo := &fakeRepo{
		total:    1,
		products: []domain.ProductSummary{{Slug: "nano75", Name: "Nano75", Type: "keyboard", PriceFromCents: 12900, Currency: "USD"}},
	}
	code, body := do(t, newTestHandler(repo), "/api/v1/products?type=keyboard&limit=2")
	if code != http.StatusOK || body["success"] != true {
		t.Fatalf("code=%d body=%v", code, body)
	}
	meta, ok := body["meta"].(map[string]any)
	if !ok || meta["total"].(float64) != 1 {
		t.Fatalf("meta = %v", body["meta"])
	}
}

func TestHandler_ListProducts_InvalidPage(t *testing.T) {
	code, body := do(t, newTestHandler(&fakeRepo{}), "/api/v1/products?page=abc")
	if code != http.StatusBadRequest {
		t.Fatalf("code = %d, want 400", code)
	}
	if errObj := body["error"].(map[string]any); errObj["code"] != "validation_failed" {
		t.Errorf("error = %v", errObj)
	}
}

func TestHandler_ProductNotFound(t *testing.T) {
	repo := &fakeRepo{detailErr: domain.ErrProductNotFound}
	code, body := do(t, newTestHandler(repo), "/api/v1/products/ghost")
	if code != http.StatusNotFound {
		t.Fatalf("code = %d, want 404", code)
	}
	if errObj := body["error"].(map[string]any); errObj["code"] != "not_found" {
		t.Errorf("error = %v", errObj)
	}
}

func TestHandler_InternalErrorIsGeneric(t *testing.T) {
	repo := &fakeRepo{typesErr: errors.New("boom: secret connection string leaked")}
	code, body := do(t, newTestHandler(repo), "/api/v1/product-types")
	if code != http.StatusInternalServerError {
		t.Fatalf("code = %d, want 500", code)
	}
	errObj := body["error"].(map[string]any)
	if errObj["code"] != "internal" {
		t.Errorf("code = %v", errObj["code"])
	}
	msg, _ := errObj["message"].(string)
	if msg == "" || strings.Contains(msg, "secret") || strings.Contains(msg, "boom") {
		t.Errorf("message leaks internals: %q", msg)
	}
}
