// Command backfill (re)computes embeddings for every active product via the
// configured SearchProvider — used to populate the semantic index for seed data
// or after changing the embedding provider. The keyword tsvector is a DB-generated
// column and needs no backfill.
package main

import (
	"context"
	"log/slog"
	"os"

	"github.com/joho/godotenv"

	admindb "github.com/Nanako1900/NanoCrate/backend/internal/admin/db"
	"github.com/Nanako1900/NanoCrate/backend/internal/platform/config"
	"github.com/Nanako1900/NanoCrate/backend/internal/platform/db"
	"github.com/Nanako1900/NanoCrate/backend/internal/platform/logging"
	"github.com/Nanako1900/NanoCrate/backend/internal/search"
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
	ctx := context.Background()
	pool, err := db.NewPool(ctx, cfg.DatabaseURL)
	if err != nil {
		logger.Error("db pool init failed", "error", err)
		os.Exit(1)
	}
	defer pool.Close()

	sp := search.NewPgVector(pool, search.NewEmbedder(cfg.EmbeddingProvider, cfg.OpenAIAPIKey, logger))
	rows, err := admindb.New(pool).ListProductsForIndex(ctx)
	if err != nil {
		logger.Error("list products for index failed", "error", err)
		os.Exit(1)
	}

	indexed := 0
	for _, r := range rows {
		text := search.BuildText(r.Name, r.Description, r.Attributes)
		if err := sp.Index(ctx, search.Document{ProductID: r.ID, Text: text}); err != nil {
			logger.Error("index failed", "product_id", r.ID.String(), "error", err)
			continue
		}
		indexed++
	}
	logger.Info("embedding backfill complete", "indexed", indexed, "total", len(rows))
	if indexed < len(rows) {
		os.Exit(1)
	}
}
