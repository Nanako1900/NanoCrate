package payment

import (
	"context"
	"errors"
	"testing"
)

func TestFakeProvider_CreateIntent(t *testing.T) {
	p := NewFakeProvider("whsec_test")
	intent, err := p.CreatePaymentIntent(context.Background(), CreateIntentInput{
		OrderID: "o1", AmountCents: 1000, Currency: "usd",
	})
	if err != nil {
		t.Fatalf("create intent: %v", err)
	}
	if intent.ID != "pi_fake_o1" || intent.ClientSecret == "" {
		t.Errorf("intent = %+v", intent)
	}
}

func TestFakeProvider_VerifyWebhook(t *testing.T) {
	p := NewFakeProvider("whsec_test")
	payload := []byte(`{"id":"evt_1","type":"payment_succeeded","payment_intent":"pi_fake_o1"}`)

	ev, err := p.VerifyWebhook(payload, p.Sign(payload))
	if err != nil {
		t.Fatalf("verify: %v", err)
	}
	if ev.ID != "evt_1" || ev.Type != EventPaymentSucceeded || ev.PaymentIntentID != "pi_fake_o1" {
		t.Errorf("event = %+v", ev)
	}

	if _, err := p.VerifyWebhook(payload, "deadbeef"); !errors.Is(err, ErrInvalidSignature) {
		t.Errorf("bad signature err = %v, want ErrInvalidSignature", err)
	}
}
