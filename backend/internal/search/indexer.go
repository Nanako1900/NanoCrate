package search

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"

	"github.com/google/uuid"

	"github.com/Nanako1900/NanoCrate/backend/internal/events"
)

// ProductLoader fetches the fields a product is indexed from. found=false means
// the product no longer exists (deleted between event and consume).
type ProductLoader interface {
	LoadProductForIndex(ctx context.Context, id uuid.UUID) (name, description string, attributes json.RawMessage, found bool, err error)
}

// IndexEventHandler builds the ProductUpserted consumer handler: decode the
// product id, load its text, and (re)index it. A vanished product is a no-op
// success; transient failures bubble up for the consumer's retry/DLQ.
func IndexEventHandler(sp Provider, loader ProductLoader, logger *slog.Logger) events.ProcessFunc {
	return func(ctx context.Context, e events.Event) error {
		var p struct {
			ProductID string `json:"product_id"`
		}
		if err := json.Unmarshal(e.Payload, &p); err != nil {
			return fmt.Errorf("decode ProductUpserted: %w", err)
		}
		id, err := uuid.Parse(p.ProductID)
		if err != nil {
			return fmt.Errorf("bad product id %q: %w", p.ProductID, err)
		}
		name, desc, attrs, found, err := loader.LoadProductForIndex(ctx, id)
		if err != nil {
			return fmt.Errorf("load product %s: %w", p.ProductID, err)
		}
		if !found {
			if logger != nil {
				logger.WarnContext(ctx, "product gone before indexing; skipping", slog.String("product_id", p.ProductID))
			}
			return nil
		}
		if err := sp.Index(ctx, Document{ProductID: id, Text: BuildText(name, desc, attrs)}); err != nil {
			return fmt.Errorf("index product %s: %w", p.ProductID, err)
		}
		if logger != nil {
			logger.InfoContext(ctx, "product indexed", slog.String("product_id", p.ProductID))
		}
		return nil
	}
}
