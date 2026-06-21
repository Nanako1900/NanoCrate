package events

import (
	"context"
	"errors"
	"testing"
)

func TestSubjectFor(t *testing.T) {
	cases := map[string]string{
		"OrderPlaced":      SubjectOrderPlaced,
		"PaymentSucceeded": SubjectPaymentSucceed,
		"PaymentFailed":    SubjectPaymentFailed,
		"SomethingNew":     "nanocrate.event.somethingnew",
	}
	for in, want := range cases {
		if got := SubjectFor(in); got != want {
			t.Errorf("SubjectFor(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestSubjectMatches(t *testing.T) {
	cases := []struct {
		filter, subject string
		want            bool
	}{
		{"nanocrate.order.placed", "nanocrate.order.placed", true},
		{"nanocrate.order.>", "nanocrate.order.placed", true},
		{"nanocrate.order.>", "nanocrate.order.placed.extra", true},
		{"nanocrate.*.placed", "nanocrate.order.placed", true},
		{"nanocrate.order.>", "nanocrate.payment.succeeded", false},
		{"nanocrate.order.placed", "nanocrate.order.cancelled", false},
		{"nanocrate.order.>", "nanocrate.order", false}, // ">" needs >=1 trailing token
	}
	for _, c := range cases {
		if got := subjectMatches(c.filter, c.subject); got != c.want {
			t.Errorf("subjectMatches(%q,%q) = %v, want %v", c.filter, c.subject, got, c.want)
		}
	}
}

func TestMemoryBus_PublishDeliversToMatchingSubscribers(t *testing.T) {
	bus := NewMemoryBus()
	ctx := context.Background()
	var got []string
	if _, err := bus.Subscribe(ctx, SubjectAllOrders, "d1", func(_ context.Context, e Event) error {
		got = append(got, e.ID)
		return nil
	}); err != nil {
		t.Fatalf("subscribe: %v", err)
	}
	// Non-matching subscriber must not receive it.
	if _, err := bus.Subscribe(ctx, SubjectPaymentSucceed, "d2", func(_ context.Context, e Event) error {
		t.Errorf("payment subscriber received order event %s", e.ID)
		return nil
	}); err != nil {
		t.Fatalf("subscribe: %v", err)
	}

	if err := bus.Publish(ctx, Event{ID: "1", Type: "OrderPlaced", Subject: SubjectOrderPlaced}); err != nil {
		t.Fatalf("publish: %v", err)
	}
	if len(got) != 1 || got[0] != "1" {
		t.Errorf("delivered = %v, want [1]", got)
	}
	if n := len(bus.Published()); n != 1 {
		t.Errorf("published count = %d, want 1", n)
	}
}

func TestMemoryBus_PublishPropagatesHandlerError(t *testing.T) {
	bus := NewMemoryBus()
	ctx := context.Background()
	sentinel := errors.New("boom")
	_, _ = bus.Subscribe(ctx, SubjectOrderPlaced, "d", func(context.Context, Event) error { return sentinel })
	if err := bus.Publish(ctx, Event{ID: "1", Subject: SubjectOrderPlaced}); !errors.Is(err, sentinel) {
		t.Errorf("publish err = %v, want sentinel", err)
	}
}

func TestMemoryBus_ClosedRejects(t *testing.T) {
	bus := NewMemoryBus()
	_ = bus.Close()
	if err := bus.Publish(context.Background(), Event{ID: "1"}); !errors.Is(err, ErrBusClosed) {
		t.Errorf("publish on closed = %v, want ErrBusClosed", err)
	}
}
