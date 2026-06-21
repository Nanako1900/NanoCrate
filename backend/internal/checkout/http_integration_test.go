//go:build integration

package checkout_test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/Nanako1900/NanoCrate/backend/internal/auth"
	"github.com/Nanako1900/NanoCrate/backend/internal/cart"
	"github.com/Nanako1900/NanoCrate/backend/internal/checkout"
	"github.com/Nanako1900/NanoCrate/backend/internal/inventory"
	"github.com/Nanako1900/NanoCrate/backend/internal/order"
	"github.com/Nanako1900/NanoCrate/backend/internal/payment"
	"github.com/Nanako1900/NanoCrate/backend/internal/testutil"
)

func buildAPIRouter(pool *pgxpool.Pool, verifier *auth.Verifier, provider payment.Provider) *gin.Engine {
	gin.SetMode(gin.TestMode)
	inv := inventory.NewService(pool, nil)
	cartH := cart.NewHandler(cart.NewService(pool), false)
	checkoutH := checkout.NewHandler(checkout.NewService(pool, inv, provider, nil))
	orderH := order.NewHandler(order.NewService(pool))

	r := gin.New()
	v1 := r.Group("/api/v1")
	checkoutH.RegisterWebhook(v1)
	session := v1.Group("", verifier.OptionalUser())
	cartH.Register(session)
	user := v1.Group("", verifier.RequireUser())
	checkoutH.RegisterCheckout(user)
	orderH.Register(user)
	return r
}

func TestIntegration_HTTP_FullCheckoutFlowAndAuth(t *testing.T) {
	pool := testutil.StartPostgres(t)
	fixture := testutil.NewAuthFixture(t)
	provider := payment.NewFakeProvider("whsec_test")
	variantID := testutil.SeedVariant(t, pool, 5)
	router := buildAPIRouter(pool, fixture.Verifier, provider)
	token := fixture.Token(t, "user-http", "customer")

	// Auth is enforced: no token -> 401 on checkout and orders.
	if code, _ := doJSON(t, router, http.MethodPost, "/api/v1/checkout", "", map[string]any{"cart_id": uuid.NewString()}, nil); code != http.StatusUnauthorized {
		t.Errorf("POST /checkout without token = %d, want 401", code)
	}
	if code, _ := doJSON(t, router, http.MethodGet, "/api/v1/orders", "", nil, nil); code != http.StatusUnauthorized {
		t.Errorf("GET /orders without token = %d, want 401", code)
	}

	// 1. Add to cart (contract §9.4 shape).
	code, body := doJSON(t, router, http.MethodPost, "/api/v1/cart/items", token,
		map[string]any{"variant_id": variantID.String(), "qty": 2}, nil)
	if code != http.StatusOK {
		t.Fatalf("add to cart = %d (%v)", code, body)
	}
	cartData := body["data"].(map[string]any)
	cartID := cartData["id"].(string)
	if cartData["item_count"].(float64) != 2 || cartData["subtotal_cents"].(float64) != 25800 {
		t.Errorf("cart totals = %v", cartData)
	}
	item0 := cartData["items"].([]any)[0].(map[string]any)
	if item0["available"].(float64) != 5 || item0["line_total_cents"].(float64) != 25800 || item0["sku"] == "" {
		t.Errorf("cart item shape = %v", item0)
	}

	// 2. Checkout -> {order_id, client_secret} (contract §9.3).
	code, body = doJSON(t, router, http.MethodPost, "/api/v1/checkout", token,
		map[string]any{"cart_id": cartID}, map[string]string{"Idempotency-Key": "http-idem-1"})
	if code != http.StatusOK {
		t.Fatalf("checkout = %d (%v)", code, body)
	}
	checkoutData := body["data"].(map[string]any)
	orderID := checkoutData["order_id"].(string)
	if orderID == "" || checkoutData["client_secret"].(string) == "" {
		t.Fatalf("checkout data = %v", checkoutData)
	}

	// 3. Stripe webhook (no token; signed) settles the order.
	payload := []byte(fmt.Sprintf(`{"id":"evt_http","type":"payment_succeeded","payment_intent":"pi_fake_%s"}`, orderID))
	code, _ = doRaw(t, router, "/api/v1/webhooks/stripe", payload, map[string]string{"Stripe-Signature": provider.Sign(payload)})
	if code != http.StatusOK {
		t.Fatalf("webhook = %d", code)
	}

	// 4. GET /orders lists the paid order (contract §9.4).
	code, body = doJSON(t, router, http.MethodGet, "/api/v1/orders", token, nil, nil)
	if code != http.StatusOK {
		t.Fatalf("list orders = %d", code)
	}
	if body["meta"].(map[string]any)["total"].(float64) < 1 {
		t.Errorf("orders meta = %v", body["meta"])
	}
	listed := body["data"].([]any)[0].(map[string]any)
	if listed["status"].(string) != "paid" || listed["item_count"].(float64) != 2 {
		t.Errorf("order summary = %v", listed)
	}

	// 5. GET /orders/:id detail with payment + snapshot items (contract §9.4).
	code, body = doJSON(t, router, http.MethodGet, "/api/v1/orders/"+orderID, token, nil, nil)
	if code != http.StatusOK {
		t.Fatalf("get order = %d", code)
	}
	detail := body["data"].(map[string]any)
	payInfo := detail["payment"].(map[string]any)
	if detail["status"].(string) != "paid" || payInfo["provider"].(string) != "stripe" || payInfo["status"].(string) != "succeeded" {
		t.Errorf("order detail = %v", detail)
	}
	if len(detail["items"].([]any)) != 1 {
		t.Errorf("order items = %v", detail["items"])
	}
}

func TestIntegration_HTTP_CheckoutOutOfStock(t *testing.T) {
	pool := testutil.StartPostgres(t)
	fixture := testutil.NewAuthFixture(t)
	provider := payment.NewFakeProvider("whsec_test")
	variantID := testutil.SeedVariant(t, pool, 1) // only 1 in stock
	router := buildAPIRouter(pool, fixture.Verifier, provider)
	token := fixture.Token(t, "user-oos", "customer")

	_, body := doJSON(t, router, http.MethodPost, "/api/v1/cart/items", token,
		map[string]any{"variant_id": variantID.String(), "qty": 3}, nil)
	cartID := body["data"].(map[string]any)["id"].(string)

	code, body := doJSON(t, router, http.MethodPost, "/api/v1/checkout", token,
		map[string]any{"cart_id": cartID}, map[string]string{"Idempotency-Key": "oos-1"})
	if code != http.StatusConflict {
		t.Fatalf("checkout = %d, want 409", code)
	}
	if body["error"].(map[string]any)["code"].(string) != "out_of_stock" {
		t.Errorf("error = %v, want out_of_stock", body["error"])
	}
}

func TestIntegration_HTTP_WebhookBadSignatureAndOrderNotFound(t *testing.T) {
	pool := testutil.StartPostgres(t)
	fixture := testutil.NewAuthFixture(t)
	router := buildAPIRouter(pool, fixture.Verifier, payment.NewFakeProvider("whsec_test"))
	token := fixture.Token(t, "user-x", "customer")

	// Forged webhook signature is rejected (400).
	code, body := doRaw(t, router, "/api/v1/webhooks/stripe", []byte(`{"id":"evt"}`), map[string]string{"Stripe-Signature": "forged"})
	if code != http.StatusBadRequest || body["error"].(map[string]any)["code"].(string) != "validation_failed" {
		t.Errorf("forged webhook = %d (%v)", code, body)
	}

	// Another user's / nonexistent order is 404 (no IDOR leak).
	code, body = doJSON(t, router, http.MethodGet, "/api/v1/orders/"+uuid.NewString(), token, nil, nil)
	if code != http.StatusNotFound || body["error"].(map[string]any)["code"].(string) != "not_found" {
		t.Errorf("unknown order = %d (%v)", code, body)
	}
}

// TestIntegration_HTTP_GuestCartCheckoutRequiresCookie proves the B4 guest-cart
// IDOR fix end-to-end through the real router/middleware: a logged-in user can
// only check out a guest cart if they present its nano_cart cookie.
func TestIntegration_HTTP_GuestCartCheckoutRequiresCookie(t *testing.T) {
	pool := testutil.StartPostgres(t)
	fixture := testutil.NewAuthFixture(t)
	provider := payment.NewFakeProvider("whsec_test")
	variantID := testutil.SeedVariant(t, pool, 5)
	router := buildAPIRouter(pool, fixture.Verifier, provider)
	token := fixture.Token(t, "user-guest-http", "customer")

	// Guest (no token) creates a cart; the guest cookie value is the cart id.
	code, body := doJSON(t, router, http.MethodPost, "/api/v1/cart/items", "",
		map[string]any{"variant_id": variantID.String(), "qty": 1}, nil)
	if code != http.StatusOK {
		t.Fatalf("guest add to cart = %d (%v)", code, body)
	}
	guestCartID := body["data"].(map[string]any)["id"].(string)

	// A logged-in user posting that guest cart_id WITHOUT the cookie is blocked
	// (404 not_found — no IDOR, no existence leak).
	code, body = doJSON(t, router, http.MethodPost, "/api/v1/checkout", token,
		map[string]any{"cart_id": guestCartID}, map[string]string{"Idempotency-Key": "no-cookie"})
	if code != http.StatusNotFound || body["error"].(map[string]any)["code"].(string) != "not_found" {
		t.Fatalf("guest checkout without cookie = %d (%v), want 404 not_found", code, body)
	}

	// Presenting the matching guest cookie authorizes the checkout (200).
	code, body = doJSON(t, router, http.MethodPost, "/api/v1/checkout", token,
		map[string]any{"cart_id": guestCartID},
		map[string]string{"Idempotency-Key": "with-cookie", "Cookie": cart.CookieName + "=" + guestCartID})
	if code != http.StatusOK {
		t.Fatalf("guest checkout with cookie = %d (%v), want 200", code, body)
	}
	if body["data"].(map[string]any)["order_id"].(string) == "" {
		t.Errorf("checkout returned no order id: %v", body)
	}
}

// TestIntegration_HTTP_WebhookEarlyArrivalIsRetryable proves the B1 fix at the
// HTTP boundary: a settlement webhook for a payment intent no order carries yet
// must return a retryable 503 (not a 200 ack that would drop the settlement).
func TestIntegration_HTTP_WebhookEarlyArrivalIsRetryable(t *testing.T) {
	pool := testutil.StartPostgres(t)
	fixture := testutil.NewAuthFixture(t)
	provider := payment.NewFakeProvider("whsec_test")
	router := buildAPIRouter(pool, fixture.Verifier, provider)

	payload := []byte(`{"id":"evt_early_http","type":"payment_succeeded","payment_intent":"pi_no_order_yet"}`)
	code, _ := doRaw(t, router, "/api/v1/webhooks/stripe", payload, map[string]string{"Stripe-Signature": provider.Sign(payload)})
	if code != http.StatusServiceUnavailable {
		t.Fatalf("early webhook = %d, want 503 (retryable)", code)
	}
}

// doJSON sends a JSON request (optional bearer token + extra headers) and decodes
// the envelope.
func doJSON(t *testing.T, r *gin.Engine, method, path, token string, body any, headers map[string]string) (int, map[string]any) {
	t.Helper()
	var reader io.Reader
	if body != nil {
		raw, _ := json.Marshal(body)
		reader = bytes.NewReader(raw)
	}
	req := httptest.NewRequest(method, path, reader)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	var decoded map[string]any
	if w.Body.Len() > 0 {
		_ = json.Unmarshal(w.Body.Bytes(), &decoded)
	}
	return w.Code, decoded
}

func doRaw(t *testing.T, r *gin.Engine, path string, body []byte, headers map[string]string) (int, map[string]any) {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, path, bytes.NewReader(body))
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	var decoded map[string]any
	if w.Body.Len() > 0 {
		_ = json.Unmarshal(w.Body.Bytes(), &decoded)
	}
	return w.Code, decoded
}
