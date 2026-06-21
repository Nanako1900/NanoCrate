package payment

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/stripe/stripe-go/v79"
	"github.com/stripe/stripe-go/v79/paymentintent"
	"github.com/stripe/stripe-go/v79/webhook"
)

// StripeProvider is the default PaymentProvider backed by the Stripe Go SDK.
// CreatePaymentIntent talks to Stripe (test mode in dev); VerifyWebhook validates
// the signature offline with the webhook signing secret.
type StripeProvider struct {
	webhookSecret string
}

// NewStripeProvider configures the Stripe SDK with the secret key and returns a
// provider that verifies webhooks with the given signing secret.
func NewStripeProvider(secretKey, webhookSecret string) *StripeProvider {
	stripe.Key = secretKey
	return &StripeProvider{webhookSecret: webhookSecret}
}

// CreatePaymentIntent creates a Stripe PaymentIntent (idempotent via the key).
func (s *StripeProvider) CreatePaymentIntent(ctx context.Context, in CreateIntentInput) (Intent, error) {
	params := &stripe.PaymentIntentParams{
		Amount: stripe.Int64(in.AmountCents),
		// Stripe requires a lowercase ISO currency code; carts/orders carry it
		// uppercase (e.g. "USD", contract §9.3), so downcase before the call.
		Currency: stripe.String(strings.ToLower(in.Currency)),
	}
	params.Context = ctx
	params.AddMetadata("order_id", in.OrderID)
	if in.IdempotencyKey != "" {
		params.SetIdempotencyKey(in.IdempotencyKey)
	}
	pi, err := paymentintent.New(params)
	if err != nil {
		return Intent{}, fmt.Errorf("stripe create payment intent: %w", err)
	}
	return Intent{ID: pi.ID, ClientSecret: pi.ClientSecret}, nil
}

// VerifyWebhook validates the Stripe-Signature header and normalizes the event.
func (s *StripeProvider) VerifyWebhook(payload []byte, signatureHeader string) (Event, error) {
	event, err := webhook.ConstructEvent(payload, signatureHeader, s.webhookSecret)
	if err != nil {
		return Event{}, ErrInvalidSignature
	}
	var object struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(event.Data.Raw, &object); err != nil {
		return Event{}, fmt.Errorf("decode stripe event object: %w", err)
	}
	return Event{
		ID:              event.ID,
		Type:            mapStripeEventType(string(event.Type)),
		PaymentIntentID: object.ID,
	}, nil
}

func mapStripeEventType(t string) EventType {
	switch t {
	case "payment_intent.succeeded":
		return EventPaymentSucceeded
	case "payment_intent.payment_failed":
		return EventPaymentFailed
	case "payment_intent.canceled":
		return EventPaymentCanceled
	default:
		return EventUnknown
	}
}
