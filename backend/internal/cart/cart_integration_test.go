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
