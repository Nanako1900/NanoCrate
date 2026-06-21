package payment

import (
	"errors"
	"testing"
)

func TestMapStripeEventType(t *testing.T) {
	cases := map[string]EventType{
		"payment_intent.succeeded":      EventPaymentSucceeded,
		"payment_intent.payment_failed": EventPaymentFailed,
		"payment_intent.canceled":       EventPaymentCanceled,
		"customer.created":              EventUnknown,
	}
	for in, want := range cases {
		if got := mapStripeEventType(in); got != want {
			t.Errorf("mapStripeEventType(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestStripeProvider_VerifyWebhook_RejectsBadSignature(t *testing.T) {
	p := NewStripeProvider("sk_test_x", "whsec_test")
	_, err := p.VerifyWebhook([]byte(`{"id":"evt_1"}`), "t=1,v1=deadbeef")
	if !errors.Is(err, ErrInvalidSignature) {
		t.Errorf("err = %v, want ErrInvalidSignature", err)
	}
}
