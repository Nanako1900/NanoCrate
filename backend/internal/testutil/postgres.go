//go:build integration

// Package testutil provides shared integration-test helpers: a pgvector Postgres
// container with migrations applied, and seed helpers.
package testutil

import (
	"context"
	"os"
	"path/filepath"
	"sort"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
)

// StartPostgres boots a pgvector Postgres container, applies all migrations, and
// returns a ready pool. The container is terminated on test cleanup.
func StartPostgres(t *testing.T) *pgxpool.Pool {
	t.Helper()
	ctx := context.Background()

	container, err := postgres.Run(ctx, "pgvector/pgvector:pg16",
		postgres.WithDatabase("nanocrate"),
		postgres.WithUsername("nano"),
		postgres.WithPassword("nano"),
		testcontainers.WithWaitStrategy(
			wait.ForListeningPort("5432/tcp").WithStartupTimeout(90*time.Second),
		),
	)
	if err != nil {
		t.Fatalf("start postgres container: %v", err)
	}
	t.Cleanup(func() { _ = container.Terminate(context.Background()) })

	dsn, err := container.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		t.Fatalf("connection string: %v", err)
	}
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatalf("new pool: %v", err)
	}
	t.Cleanup(pool.Close)

	waitForDB(t, ctx, pool)
	applyMigrations(t, ctx, pool)
	return pool
}

func waitForDB(t *testing.T, ctx context.Context, pool *pgxpool.Pool) {
	t.Helper()
	for i := 0; i < 40; i++ {
		if err := pool.Ping(ctx); err == nil {
			return
		}
		time.Sleep(250 * time.Millisecond)
	}
	t.Fatal("database never became ready")
}

func applyMigrations(t *testing.T, ctx context.Context, pool *pgxpool.Pool) {
	t.Helper()
	// testutil lives at internal/testutil; migrations are at ../../db/migrations.
	files, err := filepath.Glob(filepath.Join("..", "..", "db", "migrations", "*.up.sql"))
	if err != nil || len(files) == 0 {
		t.Fatalf("glob migrations: %v (found %d)", err, len(files))
	}
	sort.Strings(files)
	for _, f := range files {
		sqlBytes, err := os.ReadFile(f)
		if err != nil {
			t.Fatalf("read %s: %v", f, err)
		}
		if _, err := pool.Exec(ctx, string(sqlBytes)); err != nil {
			t.Fatalf("apply %s: %v", filepath.Base(f), err)
		}
	}
}

var keyboardTypeID = uuid.MustParse("11111111-1111-1111-1111-111111111111")

// SeedVariant inserts a product + variant + inventory row with the given available
// stock and returns the variant id. Each call creates uniquely-keyed rows.
func SeedVariant(t *testing.T, pool *pgxpool.Pool, available int32) uuid.UUID {
	t.Helper()
	ctx := context.Background()
	if _, err := pool.Exec(ctx,
		`INSERT INTO product_types (id, key, name) VALUES ($1, 'keyboard', 'Keyboard') ON CONFLICT (id) DO NOTHING`,
		keyboardTypeID); err != nil {
		t.Fatalf("seed product_type: %v", err)
	}
	suffix := uuid.NewString()[:8]
	var productID uuid.UUID
	if err := pool.QueryRow(ctx,
		`INSERT INTO products (slug, product_type_id, name, status) VALUES ($1, $2, 'Test Product', 'active') RETURNING id`,
		"p-"+suffix, keyboardTypeID).Scan(&productID); err != nil {
		t.Fatalf("seed product: %v", err)
	}
	var variantID uuid.UUID
	if err := pool.QueryRow(ctx,
		`INSERT INTO variants (product_id, sku, name, price_cents) VALUES ($1, $2, 'Test Variant', 12900) RETURNING id`,
		productID, "SKU-"+suffix).Scan(&variantID); err != nil {
		t.Fatalf("seed variant: %v", err)
	}
	if _, err := pool.Exec(ctx,
		`INSERT INTO inventory (variant_id, available, reserved) VALUES ($1, $2, 0)`,
		variantID, available); err != nil {
		t.Fatalf("seed inventory: %v", err)
	}
	return variantID
}
