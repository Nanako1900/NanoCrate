// Package payment abstracts the payment gateway behind the PaymentProvider
// interface (SPEC §6). The default implementation is Stripe; a Fake provider
// drives offline tests. Payment success is authoritative only via webhook.
package payment

import (
	"context"
	"errors"
)

// EventType is the normalized payment event type (gateway differences hidden).
type EventType string

const (
	EventPaymentSucceeded EventType = "payment_succeeded"
	EventPaymentFailed    EventType = "payment_failed"
	EventPaymentCanceled  EventType = "payment_canceled"
	EventUnknown          EventType = "unknown"
)

// ErrInvalidSignature is returned when a webhook payload fails signature checks.
var ErrInvalidSignature = errors.New("invalid webhook signature")

// CreateIntentInput is the request to create a payment intent for an order.
type CreateIntentInput struct {
	AmountCents    int64
	Currency       string
	OrderID        string
	IdempotencyKey string
}

// Intent is the created payment intent: an id plus the client secret the browser
// uses to confirm payment.
type Intent struct {
	ID           string
	ClientSecret string
}

// Event is a normalized, signature-verified webhook event.
type Event struct {
	ID              string
	Type            EventType
	PaymentIntentID string
}

// Provider is the payment gateway abstraction. Implementations: Stripe (default),
// Fake (tests).
type Provider interface {
	// CreatePaymentIntent creates an intent; IdempotencyKey makes retries safe.
	CreatePaymentIntent(ctx context.Context, in CreateIntentInput) (Intent, error)
	// VerifyWebhook validates the signature and returns a normalized event.
	VerifyWebhook(payload []byte, signatureHeader string) (Event, error)
}
