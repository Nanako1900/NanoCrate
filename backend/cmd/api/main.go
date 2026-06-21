// Command api is the NanoCrate HTTP service entrypoint (modular monolith).
package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/joho/godotenv"

	"github.com/Nanako1900/NanoCrate/backend/internal/admin"
	"github.com/Nanako1900/NanoCrate/backend/internal/auth"
	"github.com/Nanako1900/NanoCrate/backend/internal/cart"
	"github.com/Nanako1900/NanoCrate/backend/internal/catalog"
	"github.com/Nanako1900/NanoCrate/backend/internal/checkout"
	"github.com/Nanako1900/NanoCrate/backend/internal/inventory"
	"github.com/Nanako1900/NanoCrate/backend/internal/order"
	"github.com/Nanako1900/NanoCrate/backend/internal/payment"
	"github.com/Nanako1900/NanoCrate/backend/internal/platform/config"
	"github.com/Nanako1900/NanoCrate/backend/internal/platform/db"
	"github.com/Nanako1900/NanoCrate/backend/internal/platform/logging"
	"github.com/Nanako1900/NanoCrate/backend/internal/platform/metrics"
	"github.com/Nanako1900/NanoCrate/backend/internal/platform/observability"
)

func main() {
	// Best-effort load of a local .env for development; real env always wins.
	_ = godotenv.Load()

	logger := logging.New(os.Getenv("APP_ENV"))
	slog.SetDefault(logger)

	cfg, err := config.Load()
	if err != nil {
		logger.Error("configuration error", "error", err)
		os.Exit(1)
	}

	rootCtx := context.Background()

	shutdownTracer, err := observability.InitTracer(rootCtx, "nanocrate-api", cfg.OTLPEndpoint)
	if err != nil {
		logger.Error("tracer initialization failed", "error", err)
		os.Exit(1)
	}
	defer func() {
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = shutdownTracer(shutdownCtx)
	}()

	pool, err := db.NewPool(rootCtx, cfg.DatabaseURL)
	if err != nil {
		logger.Error("database pool initialization failed", "error", err)
		os.Exit(1)
	}
	defer pool.Close()

	verifier, err := auth.NewVerifier(rootCtx, cfg.Keycloak)
	if err != nil {
		logger.Error("auth verifier initialization failed", "error", err)
		os.Exit(1)
	}

	metricsRegistry := metrics.New()

	catalogHandler := catalog.NewHandler(catalog.NewService(catalog.NewRepository(pool)))
	inventoryService := inventory.NewService(pool, metricsRegistry)
	cartHandler := cart.NewHandler(cart.NewService(pool), cfg.AppEnv != "development")
	orderHandler := order.NewHandler(order.NewService(pool))
	checkoutHandler := checkout.NewHandler(checkout.NewService(pool, inventoryService, selectPaymentProvider(cfg, logger), metricsRegistry))
	adminHandler := admin.NewHandler(admin.NewService(pool, inventoryService))

	router := newRouter(apiDeps{
		cfg:      cfg,
		logger:   logger,
		pool:     pool,
		verifier: verifier,
		metrics:  metricsRegistry,
		catalog:  catalogHandler,
		cart:     cartHandler,
		order:    orderHandler,
		checkout: checkoutHandler,
		admin:    adminHandler,
	})

	srv := &http.Server{
		Addr:              ":" + cfg.HTTPPort,
		Handler:           router,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      15 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	go func() {
		logger.Info("api server starting", "port", cfg.HTTPPort, "env", cfg.AppEnv)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			logger.Error("server listen failed", "error", err)
			os.Exit(1)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	logger.Info("api server shutting down")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		logger.Error("graceful shutdown failed", "error", err)
	}
}

// selectPaymentProvider returns the Stripe provider when a secret key is
// configured. Outside development it refuses to fall back to the Fake provider,
// so a misconfigured production deployment cannot accept forgeable webhooks.
func selectPaymentProvider(cfg config.Config, logger *slog.Logger) payment.Provider {
	if cfg.StripeSecretKey != "" {
		return payment.NewStripeProvider(cfg.StripeSecretKey, cfg.StripeWebhookSecret)
	}
	if cfg.AppEnv != "development" {
		logger.Error("STRIPE_SECRET_KEY is required outside development")
		os.Exit(1)
	}
	// Development only: a random per-process HMAC key for the Fake provider's
	// offline webhooks — never a known constant, so events cannot be forged.
	logger.Warn("STRIPE_SECRET_KEY not set; using FakeProvider for payments (development only)")
	return payment.NewFakeProvider(randomDevSecret())
}

func randomDevSecret() string {
	buf := make([]byte, 24)
	_, _ = rand.Read(buf) // development only; crypto/rand does not fail on supported platforms
	return "whsec_dev_" + hex.EncodeToString(buf)
}
