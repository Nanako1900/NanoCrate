//go:build integration

package cart_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/Nanako1900/NanoCrate/backend/internal/cart"
	"github.com/Nanako1900/NanoCrate/backend/internal/testutil"
)

func buildCartRouter(t *testing.T, pool *pgxpool.Pool) *gin.Engine {
	gin.SetMode(gin.TestMode)
	verifier := testutil.NewAuthFixture(t).Verifier // OptionalUser passes through for guests
	h := cart.NewHandler(cart.NewService(pool), false)
	r := gin.New()
	h.Register(r.Group("", verifier.OptionalUser()))
	return r
}

// TestIntegration_Cart_GuestFlow exercises the full guest cart lifecycle over HTTP
// with a cookie jar, asserting the §9.4 shape and that every mutation returns the
// latest cart.
func TestIntegration_Cart_GuestFlow(t *testing.T) {
	pool := testutil.StartPostgres(t)
	variantID := testutil.SeedVariant(t, pool, 8)
	router := buildCartRouter(t, pool)
	jar := map[string]string{}

	// Add 2 -> cart with one line, item_count 2.
	body := req(t, router, http.MethodPost, "/cart/items", jar, map[string]any{"variant_id": variantID.String(), "qty": 2})
	data := body["data"].(map[string]any)
	if data["item_count"].(float64) != 2 || data["subtotal_cents"].(float64) != 25800 {
		t.Fatalf("after add: %v", data)
	}
	itemID := data["items"].([]any)[0].(map[string]any)["id"].(string)
	if data["items"].([]any)[0].(map[string]any)["available"].(float64) != 8 {
		t.Errorf("available not surfaced: %v", data["items"])
	}

	// GET returns the same cart via cookie.
	body = req(t, router, http.MethodGet, "/cart", jar, nil)
	if body["data"].(map[string]any)["item_count"].(float64) != 2 {
		t.Errorf("GET cart lost items: %v", body["data"])
	}

	// PATCH qty -> 5.
	body = req(t, router, http.MethodPatch, "/cart/items/"+itemID, jar, map[string]any{"qty": 5})
	if body["data"].(map[string]any)["item_count"].(float64) != 5 {
		t.Errorf("after patch: %v", body["data"])
	}

	// DELETE -> empty cart.
	body = req(t, router, http.MethodDelete, "/cart/items/"+itemID, jar, nil)
	d := body["data"].(map[string]any)
	if d["item_count"].(float64) != 0 || len(d["items"].([]any)) != 0 {
		t.Errorf("after delete: %v", d)
	}
}

// B9: a cart line's quantity is bounded to [1, MaxLineQty]. An over-cap request
// is rejected at the boundary, and accumulating adds cannot exceed the cap either
// (defense against int32 overflow), enforced by a DB CHECK.
func TestIntegration_Cart_RejectsQtyOverMax(t *testing.T) {
	pool := testutil.StartPostgres(t)
	variantID := testutil.SeedVariant(t, pool, 100)
	router := buildCartRouter(t, pool)
	jar := map[string]string{}

	// Direct over-cap add is rejected at the boundary.
	code, body := reqCode(t, router, http.MethodPost, "/cart/items", jar,
		map[string]any{"variant_id": variantID.String(), "qty": cart.MaxLineQty + 1})
	if code != http.StatusBadRequest || errCode(body) != "validation_failed" {
		t.Fatalf("over-cap add = %d (%v), want 400 validation_failed", code, body)
	}

	// A valid add, then a PATCH over the cap is rejected.
	_, body = reqCode(t, router, http.MethodPost, "/cart/items", jar,
		map[string]any{"variant_id": variantID.String(), "qty": 1})
	itemID := body["data"].(map[string]any)["items"].([]any)[0].(map[string]any)["id"].(string)
	code, body = reqCode(t, router, http.MethodPatch, "/cart/items/"+itemID, jar,
		map[string]any{"qty": cart.MaxLineQty + 1})
	if code != http.StatusBadRequest || errCode(body) != "validation_failed" {
		t.Fatalf("over-cap patch = %d (%v), want 400 validation_failed", code, body)
	}
}

// B9: each add is individually within the cap but their accumulation exceeds it;
// the upsert's running total must be rejected (DB CHECK), not silently overflow.
func TestIntegration_Cart_RejectsAccumulationOverMax(t *testing.T) {
	pool := testutil.StartPostgres(t)
	variantID := testutil.SeedVariant(t, pool, 100)
	router := buildCartRouter(t, pool)
	jar := map[string]string{}

	half := int32(cart.MaxLineQty/2 + 1) // two of these exceed the cap
	if code, body := reqCode(t, router, http.MethodPost, "/cart/items", jar,
		map[string]any{"variant_id": variantID.String(), "qty": half}); code != http.StatusOK {
		t.Fatalf("first add = %d (%v), want 200", code, body)
	}
	code, body := reqCode(t, router, http.MethodPost, "/cart/items", jar,
		map[string]any{"variant_id": variantID.String(), "qty": half})
	if code != http.StatusBadRequest || errCode(body) != "validation_failed" {
		t.Fatalf("accumulating add = %d (%v), want 400 validation_failed", code, body)
	}
}

func errCode(body map[string]any) string {
	e, ok := body["error"].(map[string]any)
	if !ok {
		return ""
	}
	s, _ := e["code"].(string)
	return s
}

// reqCode is like req but returns the status code instead of failing on non-200.
func reqCode(t *testing.T, r *gin.Engine, method, path string, jar map[string]string, body any) (int, map[string]any) {
	t.Helper()
	var reader *bytes.Reader
	if body != nil {
		raw, _ := json.Marshal(body)
		reader = bytes.NewReader(raw)
	} else {
		reader = bytes.NewReader(nil)
	}
	httpReq := httptest.NewRequest(method, path, reader)
	if body != nil {
		httpReq.Header.Set("Content-Type", "application/json")
	}
	for k, v := range jar {
		httpReq.AddCookie(&http.Cookie{Name: k, Value: v})
	}
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httpReq)
	for _, ck := range w.Result().Cookies() {
		jar[ck.Name] = ck.Value
	}
	var decoded map[string]any
	if w.Body.Len() > 0 {
		_ = json.Unmarshal(w.Body.Bytes(), &decoded)
	}
	return w.Code, decoded
}

// req performs a request, persists any Set-Cookie into the jar, and returns the
// decoded envelope.
func req(t *testing.T, r *gin.Engine, method, path string, jar map[string]string, body any) map[string]any {
	t.Helper()
	var reader *bytes.Reader
	if body != nil {
		raw, _ := json.Marshal(body)
		reader = bytes.NewReader(raw)
	} else {
		reader = bytes.NewReader(nil)
	}
	httpReq := httptest.NewRequest(method, path, reader)
	if body != nil {
		httpReq.Header.Set("Content-Type", "application/json")
	}
	for k, v := range jar {
		httpReq.AddCookie(&http.Cookie{Name: k, Value: v})
	}
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httpReq)
	for _, ck := range w.Result().Cookies() {
		jar[ck.Name] = ck.Value
	}
	if w.Code != http.StatusOK {
		t.Fatalf("%s %s = %d (%s)", method, path, w.Code, w.Body.String())
	}
	var decoded map[string]any
	_ = json.Unmarshal(w.Body.Bytes(), &decoded)
	return decoded
}
