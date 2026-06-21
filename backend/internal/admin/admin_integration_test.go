//go:build integration

package admin_test

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/Nanako1900/NanoCrate/backend/internal/admin"
	"github.com/Nanako1900/NanoCrate/backend/internal/inventory"
	"github.com/Nanako1900/NanoCrate/backend/internal/testutil"
)

func buildAdminRouter(t *testing.T, pool *pgxpool.Pool) (*gin.Engine, *testutil.AuthFixture) {
	gin.SetMode(gin.TestMode)
	fix := testutil.NewAuthFixture(t)
	h := admin.NewHandler(admin.NewService(pool, inventory.NewService(pool, nil)))
	r := gin.New()
	v1 := r.Group("/api/v1")
	g := v1.Group("", fix.Verifier.RequireUser(), fix.Verifier.RequireRole("admin"))
	h.RegisterAdmin(g)
	return r, fix
}

func TestIntegration_Admin_RBAC(t *testing.T) {
	pool := testutil.StartPostgres(t)
	r, fix := buildAdminRouter(t, pool)

	if code, _ := req(t, r, http.MethodGet, "/api/v1/admin/products", "", nil); code != http.StatusUnauthorized {
		t.Errorf("no token = %d, want 401", code)
	}
	custTok := fix.Token(t, "cust-1", "customer")
	if code, body := req(t, r, http.MethodGet, "/api/v1/admin/products", custTok, nil); code != http.StatusForbidden || errCode(body) != "forbidden" {
		t.Errorf("customer = %d (%v), want 403 forbidden", code, body)
	}
	adminTok := fix.Token(t, "admin-1", "admin")
	if code, _ := req(t, r, http.MethodGet, "/api/v1/admin/products", adminTok, nil); code != http.StatusOK {
		t.Errorf("admin = %d, want 200", code)
	}
}

func TestIntegration_Admin_ProductTypeSchema(t *testing.T) {
	pool := testutil.StartPostgres(t)
	r, fix := buildAdminRouter(t, pool)
	tok := fix.Token(t, "admin-1", "admin")

	code, body := req(t, r, http.MethodGet, "/api/v1/admin/product-types/keyboard", tok, nil)
	if code != http.StatusOK {
		t.Fatalf("schema = %d (%v)", code, body)
	}
	schema := body["data"].(map[string]any)["attribute_schema"].(map[string]any)
	fields := schema["fields"].([]any)
	if len(fields) == 0 || fields[0].(map[string]any)["name"] != "layout" {
		t.Errorf("schema fields = %v, want layout first", fields)
	}
}

func TestIntegration_Admin_CreateProduct_ValidationAndSuccess(t *testing.T) {
	pool := testutil.StartPostgres(t)
	r, fix := buildAdminRouter(t, pool)
	tok := fix.Token(t, "admin-1", "admin")

	// Invalid: missing required 'layout' + unknown attribute -> 422 with field details.
	code, body := req(t, r, http.MethodPost, "/api/v1/admin/products", tok, map[string]any{
		"type": "keyboard", "slug": "bad-kb", "name": "Bad", "attributes": map[string]any{"frob": 1},
	})
	if code != http.StatusUnprocessableEntity || errCode(body) != "validation_failed" {
		t.Fatalf("invalid create = %d (%v), want 422 validation_failed", code, body)
	}
	details := body["error"].(map[string]any)["details"].([]any)
	if !hasFieldError(details, "layout") || !hasFieldError(details, "frob") {
		t.Errorf("details = %v, want errors on layout and frob", details)
	}

	// Valid create -> 201.
	code, body = req(t, r, http.MethodPost, "/api/v1/admin/products", tok, map[string]any{
		"type": "keyboard", "slug": "nano-admin", "name": "Nano Admin", "status": "active",
		"attributes": map[string]any{"layout": "75%", "hot_swappable": true},
	})
	if code != http.StatusCreated {
		t.Fatalf("valid create = %d (%v), want 201", code, body)
	}
	data := body["data"].(map[string]any)
	if data["type"] != "keyboard" || data["status"] != "active" {
		t.Errorf("created = %v", data)
	}
	productID := data["id"].(string)

	// Add a variant -> 201, available 0.
	code, body = req(t, r, http.MethodPost, "/api/v1/admin/products/"+productID+"/variants", tok, map[string]any{
		"sku": "NANO-ADM-RED", "name": "75% / red", "price_cents": 12900, "attributes": map[string]any{"switch": "red"},
	})
	if code != http.StatusCreated {
		t.Fatalf("create variant = %d (%v), want 201", code, body)
	}
	variantID := body["data"].(map[string]any)["id"].(string)
	if body["data"].(map[string]any)["available"].(float64) != 0 {
		t.Errorf("new variant available = %v, want 0", body["data"])
	}

	// Restock 50 -> available 50, and a 'restock' ledger entry appears.
	code, body = req(t, r, http.MethodPost, "/api/v1/admin/inventory/"+variantID+"/restock", tok, map[string]any{"qty": 50})
	if code != http.StatusOK || body["data"].(map[string]any)["available"].(float64) != 50 {
		t.Fatalf("restock = %d (%v), want available 50", code, body)
	}
	code, body = req(t, r, http.MethodGet, "/api/v1/admin/inventory/"+variantID+"/ledger", tok, nil)
	if code != http.StatusOK {
		t.Fatalf("ledger = %d", code)
	}
	led := body["data"].([]any)
	if len(led) != 1 || led[0].(map[string]any)["kind"] != "restock" || led[0].(map[string]any)["delta_available"].(float64) != 50 {
		t.Errorf("ledger = %v, want one restock +50", led)
	}
}

func TestIntegration_Admin_LowStockAndOrders(t *testing.T) {
	pool := testutil.StartPostgres(t)
	r, fix := buildAdminRouter(t, pool)
	tok := fix.Token(t, "admin-1", "admin")

	// Seeded data has out-of-stock + low variants; low=true&threshold=5 must surface them.
	code, body := req(t, r, http.MethodGet, "/api/v1/admin/inventory?low=true&threshold=5", tok, nil)
	if code != http.StatusOK {
		t.Fatalf("low inventory = %d (%v)", code, body)
	}
	items := body["data"].([]any)
	if len(items) == 0 {
		t.Fatal("expected at least one low-stock item")
	}
	for _, it := range items {
		if it.(map[string]any)["available"].(float64) > 5 {
			t.Errorf("low list contains available>5: %v", it)
		}
	}

	if code, _ := req(t, r, http.MethodGet, "/api/v1/admin/orders?status=paid", tok, nil); code != http.StatusOK {
		t.Errorf("admin orders = %d, want 200", code)
	}
}

// --- helpers ---

func req(t *testing.T, r *gin.Engine, method, path, token string, body any) (int, map[string]any) {
	t.Helper()
	var reader io.Reader
	if body != nil {
		raw, _ := json.Marshal(body)
		reader = bytes.NewReader(raw)
	}
	httpReq := httptest.NewRequest(method, path, reader)
	if body != nil {
		httpReq.Header.Set("Content-Type", "application/json")
	}
	if token != "" {
		httpReq.Header.Set("Authorization", "Bearer "+token)
	}
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httpReq)
	var decoded map[string]any
	if w.Body.Len() > 0 {
		_ = json.Unmarshal(w.Body.Bytes(), &decoded)
	}
	return w.Code, decoded
}

func errCode(body map[string]any) string {
	e, ok := body["error"].(map[string]any)
	if !ok {
		return ""
	}
	s, _ := e["code"].(string)
	return s
}

func hasFieldError(details []any, field string) bool {
	for _, d := range details {
		if d.(map[string]any)["field"] == field {
			return true
		}
	}
	return false
}
