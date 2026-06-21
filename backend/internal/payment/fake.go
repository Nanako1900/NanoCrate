package payment

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
)

// FakeProvider is an offline PaymentProvider for tests and local demos. It mints
// deterministic intents and verifies webhook payloads with an HMAC-SHA256
// signature (mirroring how a real gateway signs), so the idempotency and
// signature-verification paths are exercised without any network.
type FakeProvider struct {
	secret string
}

// NewFakeProvider builds a FakeProvider with the given webhook signing secret.
func NewFakeProvider(secret string) *FakeProvider {
	return &FakeProvider{secret: secret}
}

// CreatePaymentIntent returns a deterministic intent derived from the order id.
func (f *FakeProvider) CreatePaymentIntent(_ context.Context, in CreateIntentInput) (Intent, error) {
	id := "pi_fake_" + in.OrderID
	return Intent{ID: id, ClientSecret: id + "_secret_test"}, nil
}

// fakeEvent is the JSON body shape a Fake webhook payload carries.
type fakeEvent struct {
	ID            string `json:"id"`
	Type          string `json:"type"`
	PaymentIntent string `json:"payment_intent"`
}

// VerifyWebhook checks the HMAC signature, then parses the normalized event.
func (f *FakeProvider) VerifyWebhook(payload []byte, signatureHeader string) (Event, error) {
	if !hmac.Equal([]byte(signatureHeader), []byte(f.Sign(payload))) {
		return Event{}, ErrInvalidSignature
	}
	var raw fakeEvent
	if err := json.Unmarshal(payload, &raw); err != nil {
		return Event{}, fmt.Errorf("decode fake event: %w", err)
	}
	return Event{
		ID:              raw.ID,
		Type:            EventType(raw.Type),
		PaymentIntentID: raw.PaymentIntent,
	}, nil
}

// Sign computes the signature for a payload. Tests use it to forge valid webhooks.
func (f *FakeProvider) Sign(payload []byte) string {
	mac := hmac.New(sha256.New, []byte(f.secret))
	mac.Write(payload)
	return hex.EncodeToString(mac.Sum(nil))
}
