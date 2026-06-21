//go:build integration

package events_test

import (
	"context"
	"errors"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/Nanako1900/NanoCrate/backend/internal/events"
	"github.com/Nanako1900/NanoCrate/backend/internal/testutil"
)

func insertOutbox(t *testing.T, pool *pgxpool.Pool, eventType, payload string) int64 {
	t.Helper()
	var id int64
	err := pool.QueryRow(context.Background(),
		`INSERT INTO outbox (aggregate_type, aggregate_id, event_type, payload)
		 VALUES ('order', gen_random_uuid(), $1, $2::jsonb) RETURNING id`,
		eventType, payload).Scan(&id)
	if err != nil {
		t.Fatalf("insert outbox: %v", err)
	}
	return id
}

func countUnpublished(t *testing.T, pool *pgxpool.Pool) int {
	t.Helper()
	var n int
	if err := pool.QueryRow(context.Background(), `SELECT count(*) FROM outbox WHERE published_at IS NULL`).Scan(&n); err != nil {
		t.Fatalf("count unpublished: %v", err)
	}
	return n
}

func TestIntegration_Relay_PublishesAndMarksOutbox(t *testing.T) {
	pool := testutil.StartPostgres(t)
	ctx := context.Background()
	id1 := insertOutbox(t, pool, "OrderPlaced", `{"order_id":"o1"}`)
	id2 := insertOutbox(t, pool, "PaymentSucceeded", `{"order_id":"o2"}`)

	bus := events.NewMemoryBus()
	relay := events.NewRelay(pool, bus)

	n, err := relay.PublishPending(ctx)
	if err != nil {
		t.Fatalf("publish pending: %v", err)
	}
	if n != 2 {
		t.Fatalf("published %d, want 2", n)
	}
	// Published in FIFO order, with subjects mapped from event type.
	pub := bus.Published()
	if len(pub) != 2 || pub[0].Type != "OrderPlaced" || pub[1].Type != "PaymentSucceeded" {
		t.Fatalf("published = %+v", pub)
	}
	if pub[0].Subject != events.SubjectOrderPlaced || pub[1].Subject != events.SubjectPaymentSucceed {
		t.Errorf("subjects = %q,%q", pub[0].Subject, pub[1].Subject)
	}
	// Event id is the stable outbox row id (used for at-least-once dedup).
	if pub[0].ID == "" || pub[0].ID == pub[1].ID {
		t.Errorf("event ids = %q,%q (want distinct, non-empty)", pub[0].ID, pub[1].ID)
	}
	_ = id1
	_ = id2

	// All rows are marked published; a second cycle publishes nothing (no dupes).
	if countUnpublished(t, pool) != 0 {
		t.Errorf("unpublished after relay = %d, want 0", countUnpublished(t, pool))
	}
	if n2, _ := relay.PublishPending(ctx); n2 != 0 {
		t.Errorf("second cycle published %d, want 0", n2)
	}
}

// failingBus fails publish for the first n calls, then succeeds.
type failingBus struct {
	fails int
	inner *events.MemoryBus
}

func (b *failingBus) Publish(ctx context.Context, e events.Event) error {
	if b.fails > 0 {
		b.fails--
		return errors.New("bus down")
	}
	return b.inner.Publish(ctx, e)
}
func (b *failingBus) Subscribe(ctx context.Context, s, d string, h events.Handler) (events.Subscription, error) {
	return b.inner.Subscribe(ctx, s, d, h)
}
func (b *failingBus) Close() error { return b.inner.Close() }

func TestIntegration_Relay_LeavesRowUnpublishedOnPublishError(t *testing.T) {
	pool := testutil.StartPostgres(t)
	ctx := context.Background()
	insertOutbox(t, pool, "OrderPlaced", `{"order_id":"o1"}`)

	bus := &failingBus{fails: 1, inner: events.NewMemoryBus()}
	relay := events.NewRelay(pool, bus)

	// First cycle: publish fails, row stays unpublished.
	if _, err := relay.PublishPending(ctx); err == nil {
		t.Fatal("expected publish error")
	}
	if countUnpublished(t, pool) != 1 {
		t.Fatalf("unpublished after failed cycle = %d, want 1 (must retry)", countUnpublished(t, pool))
	}
	// Next cycle: bus recovered, row is published and marked.
	if n, err := relay.PublishPending(ctx); err != nil || n != 1 {
		t.Fatalf("retry cycle = %d (err %v), want 1", n, err)
	}
	if countUnpublished(t, pool) != 0 {
		t.Errorf("unpublished after retry = %d, want 0", countUnpublished(t, pool))
	}
}
