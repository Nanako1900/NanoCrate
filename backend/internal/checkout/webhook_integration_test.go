//go:build integration

package checkout_test

import (
	"context"
	"fmt"
	"testing"

	"github.com/Nanako1900/NanoCrate/backend/internal/checkout"
	"github.com/Nanako1900/NanoCrate/backend/internal/inventory"
	orderdb "github.com/Nanako1900/NanoCrate/backend/internal/order/db"
	"github.com/Nanako1900/NanoCrate/backend/internal/payment"
	"github.com/Nanako1900/NanoCrate/backend/internal/testutil"
)

// B1: the webhook can legitimately arrive before checkout has stored the payment
// intent id on the order (Stripe fires fast; SetOrderPaymentIntent commits a
// moment later). The handler must NOT record the event as processed and ack it
// in that window — doing so dedups every retry into a no-op and the paid order is
// never settled (lost money). It must instead leave nothing recorded and signal a
// retry, so a later delivery (once the order is visible) settles it.
func TestIntegration_Webhook_EarlyArrivalDoesNotDropSettlement(t *testing.T) {
	pool := testutil.StartPostgres(t)
	ctx := context.Background()
	svc := checkout.NewService(pool, inventory.NewService(pool, nil), payment.NewFakeProvider("whsec_test"), nil)
	provider := payment.NewFakeProvider("whsec_test")
	orderQ := orderdb.New(pool)

	// An order exists (pending) but its payment intent id is not stored yet.
	order, err := orderQ.CreateOrder(ctx, orderdb.CreateOrderParams{
		UserID: "user-early", Currency: "USD", SubtotalCents: 100, TotalCents: 100, IdempotencyKey: "early-k",
	})
	if err != nil {
		t.Fatalf("create order: %v", err)
	}

	pi := "pi_fake_early"
	payload := []byte(fmt.Sprintf(`{"id":"evt_early","type":"payment_succeeded","payment_intent":"%s"}`, pi))

	// 1. Webhook arrives before the PI is visible: it must not be acked-and-dropped.
	if err := svc.HandleWebhook(ctx, payload, provider.Sign(payload)); err == nil {
		t.Fatal("early webhook for an unknown payment intent was acknowledged; Stripe will not retry and the settlement is lost")
	}

	// 2. Checkout finishes: the order now carries the payment intent id.
	cs := "cs_early"
	if err := orderQ.SetOrderPaymentIntent(ctx, orderdb.SetOrderPaymentIntentParams{
		ID: order.ID, StripePaymentIntentID: &pi, ClientSecret: &cs,
	}); err != nil {
		t.Fatalf("set payment intent: %v", err)
	}

	// 3. Stripe re-delivers the same event: it must now settle the order.
	if err := svc.HandleWebhook(ctx, payload, provider.Sign(payload)); err != nil {
		t.Fatalf("webhook retry: %v", err)
	}
	settled, _ := orderQ.GetOrder(ctx, order.ID)
	if settled.Status != "paid" || settled.PaymentStatus != "succeeded" {
		t.Errorf("order = %s / %s, want paid / succeeded (settlement must survive an early webhook)", settled.Status, settled.PaymentStatus)
	}

	// 4. A further duplicate delivery is still an idempotent no-op.
	if err := svc.HandleWebhook(ctx, payload, provider.Sign(payload)); err != nil {
		t.Fatalf("duplicate webhook: %v", err)
	}
	assertOutboxCount(t, orderQ, order.ID, 1)
}

// TestIntegration_Webhook_IgnoresUnrelatedEvents asserts that event types we do
// not settle on (e.g. customer.created mapped to "unknown") are acked without
// requiring a matching order — otherwise Stripe would retry them forever.
func TestIntegration_Webhook_IgnoresUnrelatedEvents(t *testing.T) {
	pool := testutil.StartPostgres(t)
	ctx := context.Background()
	svc := checkout.NewService(pool, inventory.NewService(pool, nil), payment.NewFakeProvider("whsec_test"), nil)
	provider := payment.NewFakeProvider("whsec_test")

	payload := []byte(`{"id":"evt_unrelated","type":"unknown","payment_intent":"pi_does_not_exist"}`)
	if err := svc.HandleWebhook(ctx, payload, provider.Sign(payload)); err != nil {
		t.Errorf("unrelated event err = %v, want nil (acknowledged without a matching order)", err)
	}
}
