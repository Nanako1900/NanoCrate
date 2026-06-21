package events

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	eventsdb "github.com/Nanako1900/NanoCrate/backend/internal/events/db"
)

// ProcessFunc is the business handler for a delivered event.
type ProcessFunc func(ctx context.Context, e Event) error

// ConsumerMetrics receives consume signals (wired to Prometheus in the worker).
type ConsumerMetrics interface {
	IncEventConsumed(consumer, eventType string)
	IncEventConsumeFailure(consumer, eventType string)
	IncDeadLetter(consumer, eventType string)
}

// NoopConsumerMetrics is the default no-op metrics sink.
type NoopConsumerMetrics struct{}

func (NoopConsumerMetrics) IncEventConsumed(string, string)       {}
func (NoopConsumerMetrics) IncEventConsumeFailure(string, string) {}
func (NoopConsumerMetrics) IncDeadLetter(string, string)          {}

// Consumer wraps a ProcessFunc with idempotent consumption (consumed_events dedup),
// in-process retry, and a dead-letter queue. Handle is the function handed to
// Bus.Subscribe; it returns an error only for infrastructure failures (so the bus
// redelivers); business failures are retried then dead-lettered and acked.
type Consumer struct {
	name        string
	q           *eventsdb.Queries
	process     ProcessFunc
	maxAttempts int
	backoff     time.Duration
	metrics     ConsumerMetrics
	logger      *slog.Logger
}

// ConsumerOption customizes a Consumer.
type ConsumerOption func(*Consumer)

// WithMaxAttempts sets the number of processing attempts before dead-lettering (>=1).
func WithMaxAttempts(n int) ConsumerOption {
	return func(c *Consumer) {
		if n >= 1 {
			c.maxAttempts = n
		}
	}
}

// WithBackoff sets the base delay between retries (multiplied by attempt number).
func WithBackoff(d time.Duration) ConsumerOption { return func(c *Consumer) { c.backoff = d } }

// WithConsumerMetrics installs a metrics sink.
func WithConsumerMetrics(m ConsumerMetrics) ConsumerOption {
	return func(c *Consumer) {
		if m != nil {
			c.metrics = m
		}
	}
}

// WithConsumerLogger installs a logger.
func WithConsumerLogger(l *slog.Logger) ConsumerOption {
	return func(c *Consumer) {
		if l != nil {
			c.logger = l
		}
	}
}

// NewConsumer builds a named consumer over the pool.
func NewConsumer(name string, pool *pgxpool.Pool, process ProcessFunc, opts ...ConsumerOption) *Consumer {
	c := &Consumer{
		name:        name,
		q:           eventsdb.New(pool),
		process:     process,
		maxAttempts: 3,
		backoff:     0,
		metrics:     NoopConsumerMetrics{},
		logger:      slog.Default(),
	}
	for _, o := range opts {
		o(c)
	}
	return c
}

// Handle processes one event idempotently. Returning nil acks the message;
// returning an error asks the bus to redeliver (used only for infra failures).
func (c *Consumer) Handle(ctx context.Context, e Event) error {
	consumed, err := c.q.IsEventConsumed(ctx, eventsdb.IsEventConsumedParams{Consumer: c.name, EventID: e.ID})
	if err != nil {
		return fmt.Errorf("dedup check %s/%s: %w", c.name, e.ID, err) // infra → redeliver
	}
	if consumed {
		c.logger.DebugContext(ctx, "event already consumed; skipping",
			slog.String("consumer", c.name), slog.String("event_id", e.ID))
		return nil
	}

	var perr error
	for attempt := 1; attempt <= c.maxAttempts; attempt++ {
		if perr = c.process(ctx, e); perr == nil {
			break
		}
		c.logger.WarnContext(ctx, "event processing attempt failed",
			slog.String("consumer", c.name), slog.String("event_id", e.ID),
			slog.Int("attempt", attempt), slog.Any("error", perr))
		if attempt < c.maxAttempts && c.backoff > 0 {
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(c.backoff * time.Duration(attempt)):
			}
		}
	}

	if perr != nil {
		return c.deadLetter(ctx, e, perr)
	}
	if err := c.markConsumed(ctx, e); err != nil {
		return err
	}
	c.metrics.IncEventConsumed(c.name, e.Type)
	return nil
}

// deadLetter records the poison event, marks it consumed (so it isn't retried
// forever), and acks. An infra error here is returned so the bus redelivers.
func (c *Consumer) deadLetter(ctx context.Context, e Event, cause error) error {
	if err := c.q.InsertDeadLetter(ctx, eventsdb.InsertDeadLetterParams{
		Consumer:  c.name,
		EventID:   e.ID,
		Subject:   e.Subject,
		EventType: e.Type,
		Payload:   nonNilJSON(e.Payload),
		Error:     cause.Error(),
		Attempts:  int32(c.maxAttempts),
	}); err != nil {
		return fmt.Errorf("dead-letter %s: %w", e.ID, err)
	}
	c.metrics.IncDeadLetter(c.name, e.Type)
	c.metrics.IncEventConsumeFailure(c.name, e.Type)
	if err := c.markConsumed(ctx, e); err != nil {
		return err
	}
	c.logger.ErrorContext(ctx, "event dead-lettered",
		slog.String("consumer", c.name), slog.String("event_id", e.ID), slog.Any("error", cause))
	return nil
}

func (c *Consumer) markConsumed(ctx context.Context, e Event) error {
	if _, err := c.q.MarkEventConsumed(ctx, eventsdb.MarkEventConsumedParams{Consumer: c.name, EventID: e.ID}); err != nil {
		return fmt.Errorf("mark consumed %s/%s: %w", c.name, e.ID, err)
	}
	return nil
}

func nonNilJSON(p json.RawMessage) json.RawMessage {
	if len(p) == 0 {
		return json.RawMessage("{}")
	}
	return p
}
