// Command worker runs the async side of NanoCrate (SPEC §7/§9): the transactional
// outbox relay (publishes to NATS), the idempotent event consumer (order-
// confirmation email + analytics, with retry → DLQ), the reservation sweeper, the
// abandoned-pending-order sweeper, and a DLQ-depth gauge updater.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/joho/godotenv"

	admindb "github.com/Nanako1900/NanoCrate/backend/internal/admin/db"
	"github.com/Nanako1900/NanoCrate/backend/internal/checkout"
	"github.com/Nanako1900/NanoCrate/backend/internal/events"
	eventsdb "github.com/Nanako1900/NanoCrate/backend/internal/events/db"
	"github.com/Nanako1900/NanoCrate/backend/internal/inventory"
	"github.com/Nanako1900/NanoCrate/backend/internal/notify"
	"github.com/Nanako1900/NanoCrate/backend/internal/payment"
	"github.com/Nanako1900/NanoCrate/backend/internal/platform/config"
	"github.com/Nanako1900/NanoCrate/backend/internal/platform/db"
	"github.com/Nanako1900/NanoCrate/backend/internal/platform/logging"
	"github.com/Nanako1900/NanoCrate/backend/internal/platform/metrics"
	"github.com/Nanako1900/NanoCrate/backend/internal/platform/observability"
	"github.com/Nanako1900/NanoCrate/backend/internal/search"
)

const (
	relayInterval    = time.Second
	reservationSweep = 30 * time.Second
	orderSweep       = time.Minute
	dlqGaugeInterval = 15 * time.Second
	reservationTTL   = 15 * time.Minute
	consumerName     = "order-emailer"
	consumerMaxRetry = 5
	consumerBackoff  = 200 * time.Millisecond
	sweepBatch       = 100
)

func main() {
	_ = godotenv.Load()
	logger := logging.New(os.Getenv("APP_ENV"))
	slog.SetDefault(logger)

	cfg, err := config.Load()
	if err != nil {
		logger.Error("configuration error", "error", err)
		os.Exit(1)
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	shutdownTracer, err := observability.InitTracer(ctx, "nanocrate-worker", cfg.OTLPEndpoint)
	if err != nil {
		logger.Error("tracer init failed", "error", err)
		os.Exit(1)
	}
	defer func() {
		sctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = shutdownTracer(sctx)
	}()

	pool, err := db.NewPool(ctx, cfg.DatabaseURL)
	if err != nil {
		logger.Error("db pool init failed", "error", err)
		os.Exit(1)
	}
	defer pool.Close()

	reg := metrics.New()
	// Expose worker metrics (DLQ depth, consume failures, …) for Prometheus.
	go serveMetrics(getEnvDefault("WORKER_METRICS_ADDR", ":9091"), reg, logger)

	notifier := notify.New(notify.SMTPConfig{
		Host: cfg.SMTP.Host, Port: cfg.SMTP.Port, Username: cfg.SMTP.Username,
		Password: cfg.SMTP.Password, From: cfg.SMTP.From,
	}, logger)
	inv := inventory.NewService(pool, reg)
	// The checkout service is used only for its abandoned-order sweeper here; the
	// payment provider is never called on that path.
	checkoutSvc := checkout.NewService(pool, inv, payment.NewFakeProvider("worker-unused"), reg)

	bus, err := events.NewNATSBus(ctx, events.NATSConfig{URL: cfg.NATSURL})
	if err != nil {
		logger.Error("nats connect failed", "error", err, "url", cfg.NATSURL)
		os.Exit(1)
	}
	defer func() { _ = bus.Close() }()

	// Outbox relay → NATS.
	relay := events.NewRelay(pool, bus)
	go func() { _ = relay.Run(ctx, relayInterval) }()

	// Consumer: order-confirmation email + analytics, idempotent with retry → DLQ.
	consumer := events.NewConsumer(consumerName, pool, orderPlacedHandler(notifier, logger),
		events.WithMaxAttempts(consumerMaxRetry),
		events.WithBackoff(consumerBackoff),
		events.WithConsumerMetrics(reg),
		events.WithConsumerLogger(logger),
	)
	sub, err := bus.Subscribe(ctx, events.SubjectOrderPlaced, consumerName, consumer.Handle)
	if err != nil {
		logger.Error("subscribe failed", "error", err)
		os.Exit(1)
	}
	defer func() { _ = sub.Unsubscribe() }()

	// Consumer: (re)index a product into the search engine on ProductUpserted.
	searchProvider := search.NewPgVector(pool, search.NewEmbedder(cfg.EmbeddingProvider, cfg.OpenAIAPIKey, logger))
	indexer := events.NewConsumer("search-indexer", pool, search.IndexEventHandler(searchProvider, adminLoader{q: admindb.New(pool)}, logger),
		events.WithMaxAttempts(consumerMaxRetry),
		events.WithBackoff(consumerBackoff),
		events.WithConsumerMetrics(reg),
		events.WithConsumerLogger(logger),
	)
	idxSub, err := bus.Subscribe(ctx, events.SubjectProductUpserted, "search-indexer", indexer.Handle)
	if err != nil {
		logger.Error("subscribe search-indexer failed", "error", err)
		os.Exit(1)
	}
	defer func() { _ = idxSub.Unsubscribe() }()

	// Reservation sweeper: release expired held reservations (SPEC §7).
	go runTicker(ctx, reservationSweep, func() {
		n, err := inv.ReleaseExpired(ctx, sweepBatch)
		if err != nil {
			logger.ErrorContext(ctx, "reservation sweep failed", "error", err)
		} else if n > 0 {
			logger.InfoContext(ctx, "reservation sweep released expired holds", "count", n)
		}
	})

	// Abandoned-order sweeper: cancel PI-less pending orders past the reservation TTL.
	go runTicker(ctx, orderSweep, func() {
		n, err := checkoutSvc.SweepAbandonedPendingOrders(ctx, time.Now().Add(-reservationTTL), sweepBatch)
		if err != nil {
			logger.ErrorContext(ctx, "order sweep failed", "error", err)
		} else if n > 0 {
			logger.InfoContext(ctx, "order sweep cancelled abandoned orders", "count", n)
		}
	})

	// DLQ-depth gauge.
	eq := eventsdb.New(pool)
	go runTicker(ctx, dlqGaugeInterval, func() {
		if n, err := eq.CountDeadLetters(ctx); err == nil {
			reg.SetDLQDepth(float64(n))
		}
	})

	logger.Info("worker started", "nats", cfg.NATSURL)
	<-ctx.Done()
	logger.Info("worker shutting down")
}

// orderPlacedHandler builds the OrderPlaced consumer: a confirmation email plus an
// analytics record. Returning an error triggers the consumer's retry/DLQ logic.
func orderPlacedHandler(notifier notify.Notifier, logger *slog.Logger) events.ProcessFunc {
	return func(ctx context.Context, e events.Event) error {
		var p struct {
			OrderID    string `json:"order_id"`
			TotalCents int64  `json:"total_cents"`
			Currency   string `json:"currency"`
		}
		if err := json.Unmarshal(e.Payload, &p); err != nil {
			return fmt.Errorf("decode OrderPlaced payload: %w", err)
		}
		logger.InfoContext(ctx, "analytics_order_placed",
			slog.String("order_id", p.OrderID), slog.Int64("total_cents", p.TotalCents))
		return notifier.Notify(ctx, notify.Notification{
			To:      "customer+" + p.OrderID + "@nanocrate.local",
			Subject: "Your NanoCrate order " + p.OrderID + " is confirmed",
			Body:    fmt.Sprintf("Thanks! Order %s for %d %s is confirmed.", p.OrderID, p.TotalCents, p.Currency),
			Kind:    "order_confirmation",
		})
	}
}

// serveMetrics serves the worker's Prometheus registry on addr.
func serveMetrics(addr string, reg *metrics.Registry, logger *slog.Logger) {
	mux := http.NewServeMux()
	mux.Handle("/metrics", reg.HTTPHandler())
	srv := &http.Server{Addr: addr, Handler: mux, ReadHeaderTimeout: 5 * time.Second}
	logger.Info("worker metrics server listening", "addr", addr)
	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		logger.Error("worker metrics server failed", "error", err)
	}
}

func getEnvDefault(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// adminLoader adapts admindb to search.ProductLoader for the index consumer.
type adminLoader struct{ q *admindb.Queries }

func (l adminLoader) LoadProductForIndex(ctx context.Context, id uuid.UUID) (string, string, json.RawMessage, bool, error) {
	p, err := l.q.AdminGetProduct(ctx, id)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", "", nil, false, nil
	}
	if err != nil {
		return "", "", nil, false, err
	}
	return p.Name, p.Description, p.Attributes, true, nil
}

// runTicker calls fn every interval until ctx is cancelled.
func runTicker(ctx context.Context, interval time.Duration, fn func()) {
	t := time.NewTicker(interval)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			fn()
		}
	}
}
