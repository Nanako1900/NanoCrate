//go:build integration

package events_test

import (
	"context"
	"errors"
	"testing"

	"github.com/Nanako1900/NanoCrate/backend/internal/events"
	eventsdb "github.com/Nanako1900/NanoCrate/backend/internal/events/db"
	"github.com/Nanako1900/NanoCrate/backend/internal/testutil"
)

type recordMetrics struct{ consumed, failed, dlq int }

func (m *recordMetrics) IncEventConsumed(string, string)       { m.consumed++ }
func (m *recordMetrics) IncEventConsumeFailure(string, string) { m.failed++ }
func (m *recordMetrics) IncDeadLetter(string, string)          { m.dlq++ }

func orderEvent(id string) events.Event {
	return events.Event{ID: id, Type: "OrderPlaced", Subject: events.SubjectOrderPlaced, Payload: []byte(`{"order_id":"o1"}`)}
}

// Idempotent consume: a duplicate delivery of the same event id is skipped (the
// business handler runs exactly once), and the event is recorded as consumed.
func TestIntegration_Consumer_SkipsDuplicateDelivery(t *testing.T) {
	pool := testutil.StartPostgres(t)
	ctx := context.Background()
	calls := 0
	m := &recordMetrics{}
	c := events.NewConsumer("emailer", pool,
		func(context.Context, events.Event) error { calls++; return nil },
		events.WithConsumerMetrics(m))

	e := orderEvent("evt-1")
	if err := c.Handle(ctx, e); err != nil {
		t.Fatalf("first handle: %v", err)
	}
	if err := c.Handle(ctx, e); err != nil { // duplicate delivery
		t.Fatalf("duplicate handle: %v", err)
	}
	if calls != 1 {
		t.Errorf("process calls = %d, want 1 (duplicate deduped)", calls)
	}
	if m.consumed != 1 {
		t.Errorf("consumed metric = %d, want 1", m.consumed)
	}
	got, _ := eventsdb.New(pool).IsEventConsumed(ctx, eventsdb.IsEventConsumedParams{Consumer: "emailer", EventID: "evt-1"})
	if !got {
		t.Error("event not recorded as consumed")
	}
}

// After maxAttempts failures the event is dead-lettered, metrics fire, and a later
// duplicate delivery of the poison event is skipped (not retried forever).
func TestIntegration_Consumer_DeadLettersAfterRetries(t *testing.T) {
	pool := testutil.StartPostgres(t)
	ctx := context.Background()
	calls := 0
	m := &recordMetrics{}
	c := events.NewConsumer("emailer", pool,
		func(context.Context, events.Event) error { calls++; return errors.New("downstream down") },
		events.WithMaxAttempts(3), events.WithConsumerMetrics(m))

	e := orderEvent("evt-fail")
	if err := c.Handle(ctx, e); err != nil {
		t.Fatalf("handle should ack (nil) after dead-lettering, got %v", err)
	}
	if calls != 3 {
		t.Errorf("process attempts = %d, want 3", calls)
	}
	if m.dlq != 1 || m.failed != 1 {
		t.Errorf("metrics dlq=%d failed=%d, want 1/1", m.dlq, m.failed)
	}
	if n, _ := eventsdb.New(pool).CountDeadLetters(ctx); n != 1 {
		t.Errorf("dead_letters = %d, want 1", n)
	}

	// Poison event redelivered: skipped, not reprocessed.
	if err := c.Handle(ctx, e); err != nil {
		t.Fatalf("redelivered poison handle: %v", err)
	}
	if calls != 3 {
		t.Errorf("attempts after redelivery = %d, want 3 (skipped)", calls)
	}
}

// A transient failure that recovers within maxAttempts succeeds without DLQ.
func TestIntegration_Consumer_RetriesThenSucceeds(t *testing.T) {
	pool := testutil.StartPostgres(t)
	ctx := context.Background()
	calls := 0
	m := &recordMetrics{}
	c := events.NewConsumer("emailer", pool,
		func(context.Context, events.Event) error {
			calls++
			if calls < 2 {
				return errors.New("transient")
			}
			return nil
		},
		events.WithMaxAttempts(3), events.WithConsumerMetrics(m))

	if err := c.Handle(ctx, orderEvent("evt-retry")); err != nil {
		t.Fatalf("handle: %v", err)
	}
	if calls != 2 {
		t.Errorf("attempts = %d, want 2 (succeeded on retry)", calls)
	}
	if m.consumed != 1 || m.dlq != 0 {
		t.Errorf("metrics consumed=%d dlq=%d, want 1/0", m.consumed, m.dlq)
	}
}
