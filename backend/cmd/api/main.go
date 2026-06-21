// Command api is the NanoCrate HTTP service entrypoint (modular monolith).
package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/joho/godotenv"

	"github.com/Nanako1900/NanoCrate/backend/internal/auth"
	"github.com/Nanako1900/NanoCrate/backend/internal/catalog"
	"github.com/Nanako1900/NanoCrate/backend/internal/platform/config"
	"github.com/Nanako1900/NanoCrate/backend/internal/platform/db"
	"github.com/Nanako1900/NanoCrate/backend/internal/platform/logging"
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

	repo := catalog.NewRepository(pool)
	service := catalog.NewService(repo)
	handler := catalog.NewHandler(service)

	router := newRouter(cfg, logger, pool, handler, verifier)

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
