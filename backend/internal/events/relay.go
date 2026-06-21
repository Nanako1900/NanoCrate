package events

import (
	"context"
	"fmt"
	"log/slog"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	eventsdb "github.com/Nanako1900/NanoCrate/backend/internal/events/db"
)

const defaultRelayBatch = 100

// Relay is the transactional-outbox publisher: business code writes an outbox row
// inside its transaction, and the relay polls unpublished rows and publishes them
// to the bus (at-least-once). The bus dedups on Event.ID, so a crash between
// publish and mark only causes a harmless re-publish.
type Relay struct {
	q     *eventsdb.Queries
	bus   Bus
	batch int32
}

// NewRelay builds a relay over the pool and bus.
func NewRelay(pool *pgxpool.Pool, bus Bus) *Relay {
	return &Relay{q: eventsdb.New(pool), bus: bus, batch: defaultRelayBatch}
}

// PublishPending publishes one batch of unpublished outbox rows in id (FIFO) order,
// marking each row published only after its publish succeeds. Returns how many were
// published. It stops the batch at the first publish/mark error so the unmarked row
// is retried on the next cycle (preserving ordering).
func (r *Relay) PublishPending(ctx context.Context) (int, error) {
	rows, err := r.q.ListUnpublishedOutbox(ctx, r.batch)
	if err != nil {
		return 0, fmt.Errorf("list unpublished outbox: %w", err)
	}
	published := 0
	for _, row := range rows {
		e := Event{
			ID:          strconv.FormatInt(row.ID, 10),
			Type:        row.EventType,
			Subject:     SubjectFor(row.EventType),
			Payload:     row.Payload,
			TraceParent: row.TraceParent,
		}
		pubCtx, end := startSpanFn(ctx, e.TraceParent, "relay.publish "+e.Subject)
		err := r.bus.Publish(pubCtx, e)
		end(err)
		if err != nil {
			return published, fmt.Errorf("publish outbox %d: %w", row.ID, err)
		}
		if err := r.q.MarkOutboxPublished(ctx, row.ID); err != nil {
			return published, fmt.Errorf("mark outbox %d published: %w", row.ID, err)
		}
		published++
	}
	return published, nil
}

// Run polls PublishPending on a ticker until ctx is cancelled. A failed cycle is
// logged and retried next tick (rows stay unpublished).
func (r *Relay) Run(ctx context.Context, interval time.Duration) error {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
			if n, err := r.PublishPending(ctx); err != nil {
				slog.ErrorContext(ctx, "outbox relay cycle failed", "error", err, "published", n)
			}
		}
	}
}
