package payment

import (
	"bytes"
	"context"
	"testing"

	"github.com/stripe/stripe-go/v79"
	"github.com/stripe/stripe-go/v79/form"
)

// captureBackend is a stripe.Backend that records the params of the Call it
// receives and returns a canned PaymentIntent, so we can assert what we send to
// Stripe without any network.
type captureBackend struct {
	currency string
}

func (b *captureBackend) Call(method, path, key string, params stripe.ParamsContainer, v stripe.LastResponseSetter) error {
	if p, ok := params.(*stripe.PaymentIntentParams); ok {
		b.currency = stripe.StringValue(p.Currency)
	}
	if pi, ok := v.(*stripe.PaymentIntent); ok {
		pi.ID = "pi_capture"
		pi.ClientSecret = "pi_capture_secret"
	}
	return nil
}

func (b *captureBackend) CallStreaming(method, path, key string, params stripe.ParamsContainer, v stripe.StreamingLastResponseSetter) error {
	return nil
}

func (b *captureBackend) CallRaw(method, path, key string, body *form.Values, params *stripe.Params, v stripe.LastResponseSetter) error {
	return nil
}

func (b *captureBackend) CallMultipart(method, path, key, boundary string, body *bytes.Buffer, params *stripe.Params, v stripe.LastResponseSetter) error {
	return nil
}

func (b *captureBackend) SetMaxNetworkRetries(maxNetworkRetries int64) {}

// B5: Stripe requires a lowercase ISO currency code. Carts/orders carry "USD"
// (uppercase, contract §9.3), so the provider must downcase before calling
// Stripe or every real charge fails with an invalid-currency error. The Fake
// provider ignores currency, which hid this in tests.
func TestStripeProvider_CreatePaymentIntent_SendsLowercaseCurrency(t *testing.T) {
	backend := &captureBackend{}
	orig := stripe.GetBackend(stripe.APIBackend)
	stripe.SetBackend(stripe.APIBackend, backend)
	t.Cleanup(func() { stripe.SetBackend(stripe.APIBackend, orig) })

	p := NewStripeProvider("sk_test_x", "whsec_test")
	intent, err := p.CreatePaymentIntent(context.Background(), CreateIntentInput{
		AmountCents:    12900,
		Currency:       "USD",
		OrderID:        "order-1",
		IdempotencyKey: "key-1",
	})
	if err != nil {
		t.Fatalf("create payment intent: %v", err)
	}
	if backend.currency != "usd" {
		t.Errorf("currency sent to Stripe = %q, want %q", backend.currency, "usd")
	}
	if intent.ID == "" || intent.ClientSecret == "" {
		t.Errorf("intent = %+v, want id and client secret", intent)
	}
}
