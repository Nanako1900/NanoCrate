//go:build integration

package events_test

import (
	"context"
	"testing"
	"time"

	tcnats "github.com/testcontainers/testcontainers-go/modules/nats"

	"github.com/Nanako1900/NanoCrate/backend/internal/events"
)

func startNATS(t *testing.T) string {
	t.Helper()
	ctx := context.Background()
	c, err := tcnats.Run(ctx, "nats:2.10")
	if err != nil {
		t.Fatalf("start nats: %v", err)
	}
	t.Cleanup(func() { _ = c.Terminate(context.Background()) })
	url, err := c.ConnectionString(ctx)
	if err != nil {
		t.Fatalf("nats connection string: %v", err)
	}
	return url
}

// Round-trips an event through real NATS JetStream and verifies server-side dedup:
// two publishes with the same Event.ID (Nats-Msg-Id) deliver to the consumer once.
func TestIntegration_NATSBus_RoundTripAndDedup(t *testing.T) {
	url := startNATS(t)
	ctx := context.Background()
	bus, err := events.NewNATSBus(ctx, events.NATSConfig{URL: url, Dedupe: 2 * time.Minute})
	if err != nil {
		t.Fatalf("new nats bus: %v", err)
	}
	t.Cleanup(func() { _ = bus.Close() })

	received := make(chan events.Event, 8)
	sub, err := bus.Subscribe(ctx, events.SubjectOrderPlaced, "test-consumer",
		func(_ context.Context, e events.Event) error { received <- e; return nil })
	if err != nil {
		t.Fatalf("subscribe: %v", err)
	}
	t.Cleanup(func() { _ = sub.Unsubscribe() })

	e := events.Event{ID: "evt-1", Type: "OrderPlaced", Subject: events.SubjectOrderPlaced, Payload: []byte(`{"order_id":"o1"}`)}
	if err := bus.Publish(ctx, e); err != nil {
		t.Fatalf("publish: %v", err)
	}
	if err := bus.Publish(ctx, e); err != nil { // duplicate publish, same msg id
		t.Fatalf("publish dup: %v", err)
	}

	select {
	case got := <-received:
		if got.ID != "evt-1" || got.Type != "OrderPlaced" || string(got.Payload) != `{"order_id":"o1"}` {
			t.Errorf("received = %+v", got)
		}
	case <-time.After(15 * time.Second):
		t.Fatal("did not receive event within 15s")
	}

	select {
	case got := <-received:
		t.Errorf("received a duplicate delivery: %+v (JetStream dedup failed)", got)
	case <-time.After(2 * time.Second):
		// no duplicate — expected
	}
}
