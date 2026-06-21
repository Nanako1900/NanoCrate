//go:build integration

package search_test

import (
	"context"
	"encoding/json"
	"errors"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/Nanako1900/NanoCrate/backend/internal/admin"
	admindb "github.com/Nanako1900/NanoCrate/backend/internal/admin/db"
	"github.com/Nanako1900/NanoCrate/backend/internal/events"
	"github.com/Nanako1900/NanoCrate/backend/internal/inventory"
	"github.com/Nanako1900/NanoCrate/backend/internal/search"
	"github.com/Nanako1900/NanoCrate/backend/internal/testutil"
)

type testLoader struct{ q *admindb.Queries }

func (l testLoader) LoadProductForIndex(ctx context.Context, id uuid.UUID) (string, string, json.RawMessage, bool, error) {
	p, err := l.q.AdminGetProduct(ctx, id)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", "", nil, false, nil
	}
	if err != nil {
		return "", "", nil, false, err
	}
	return p.Name, p.Description, p.Attributes, true, nil
}

// Full async path: admin product create emits a ProductUpserted outbox row (in the
// same tx as the write); feeding that event to the index handler embeds the product
// and makes it findable by semantic search.
func TestIntegration_ProductUpsert_EmitsEventAndIndexes(t *testing.T) {
	pool := testutil.StartPostgres(t)
	ctx := context.Background()
	adminSvc := admin.NewService(pool, inventory.NewService(pool, nil))

	pv, err := adminSvc.CreateProduct(ctx, admin.CreateProductRequest{
		Type: "keyboard", Slug: "async-kb", Name: "Async Board",
		Description: "silent full size office keyboard for quiet work",
		Status:      "active",
		Attributes:  json.RawMessage(`{"layout":"full","hot_swappable":true}`),
	})
	if err != nil {
		t.Fatalf("create product: %v", err)
	}

	// The create wrote a ProductUpserted outbox row carrying the product id.
	var eventType string
	var payload []byte
	if err := pool.QueryRow(ctx,
		`SELECT event_type, payload FROM outbox WHERE event_type='ProductUpserted' ORDER BY id DESC LIMIT 1`,
	).Scan(&eventType, &payload); err != nil {
		t.Fatalf("read outbox: %v", err)
	}
	if eventType != "ProductUpserted" {
		t.Fatalf("event_type = %q, want ProductUpserted", eventType)
	}

	// Not yet indexed → no embedding.
	var indexed int
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM products WHERE slug='async-kb' AND embedding IS NOT NULL`).Scan(&indexed)
	if indexed != 0 {
		t.Fatalf("embedding present before indexing")
	}

	// Run the index handler on the event.
	sp := search.NewPgVector(pool, search.NewStubEmbedder())
	handler := search.IndexEventHandler(sp, testLoader{q: admindb.New(pool)}, nil)
	if err := handler(ctx, events.Event{ID: "1", Type: "ProductUpserted", Subject: events.SubjectProductUpserted, Payload: payload}); err != nil {
		t.Fatalf("index handler: %v", err)
	}

	_ = pool.QueryRow(ctx, `SELECT count(*) FROM products WHERE slug='async-kb' AND embedding IS NOT NULL`).Scan(&indexed)
	if indexed != 1 {
		t.Fatalf("embedding not written by index handler (id %s)", pv.ID)
	}

	// Now semantically findable.
	hits, err := sp.Search(ctx, "a quiet full size keyboard for the office", 5)
	if err != nil {
		t.Fatalf("search: %v", err)
	}
	found := false
	for _, h := range hits {
		if h.Slug == "async-kb" {
			found = true
		}
	}
	if !found {
		t.Errorf("indexed product not found in search results")
	}
}
