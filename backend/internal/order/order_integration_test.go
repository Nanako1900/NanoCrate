//go:build integration

package order_test

import (
	"context"
	"testing"

	orderdb "github.com/Nanako1900/NanoCrate/backend/internal/order/db"
	"github.com/Nanako1900/NanoCrate/backend/internal/testutil"
)

// B10: stripe_payment_intent_id must be unique among the orders that have one, so
// GetOrderByPaymentIntent (a sqlc :one) can never silently pick one of several
// matching rows. A partial UNIQUE INDEX (WHERE stripe_payment_intent_id IS NOT
// NULL) enforces this while still allowing many NULLs (orders without a PI yet).
func TestIntegration_Orders_PaymentIntentIDIsUnique(t *testing.T) {
	pool := testutil.StartPostgres(t)
	ctx := context.Background()
	q := orderdb.New(pool)

	mkOrder := func(key string) orderdb.Order {
		o, err := q.CreateOrder(ctx, orderdb.CreateOrderParams{
			UserID:         "user-pi",
			Currency:       "USD",
			SubtotalCents:  100,
			TotalCents:     100,
			IdempotencyKey: key,
		})
		if err != nil {
			t.Fatalf("create order %s: %v", key, err)
		}
		return o
	}

	o1 := mkOrder("k1")
	o2 := mkOrder("k2")

	pi := "pi_shared_123"
	cs1, cs2 := "cs_1", "cs_2"
	if err := q.SetOrderPaymentIntent(ctx, orderdb.SetOrderPaymentIntentParams{
		ID: o1.ID, StripePaymentIntentID: &pi, ClientSecret: &cs1,
	}); err != nil {
		t.Fatalf("set payment intent on first order: %v", err)
	}

	// The second order must be rejected: two orders cannot share a payment intent.
	err := q.SetOrderPaymentIntent(ctx, orderdb.SetOrderPaymentIntentParams{
		ID: o2.ID, StripePaymentIntentID: &pi, ClientSecret: &cs2,
	})
	if err == nil {
		t.Fatal("two orders accepted the same stripe_payment_intent_id; partial unique index is missing")
	}

	// Many orders WITHOUT a payment intent must still be allowed (NULLs are exempt).
	_ = mkOrder("k3")
	_ = mkOrder("k4")
}
