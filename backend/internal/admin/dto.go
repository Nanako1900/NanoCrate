package admin

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"

	admindb "github.com/Nanako1900/NanoCrate/backend/internal/admin/db"
)

// --- requests ---

// CreateProductRequest is the POST /admin/products body (§9.5).
type CreateProductRequest struct {
	Type        string          `json:"type"`
	Slug        string          `json:"slug"`
	Name        string          `json:"name"`
	Description string          `json:"description"`
	Status      string          `json:"status"`
	ImageURL    string          `json:"image_url"`
	Attributes  json.RawMessage `json:"attributes"`
}

// UpdateProductRequest is the PATCH /admin/products/:id body — fields are optional.
type UpdateProductRequest struct {
	Slug        *string         `json:"slug"`
	Name        *string         `json:"name"`
	Description *string         `json:"description"`
	Status      *string         `json:"status"`
	ImageURL    *string         `json:"image_url"`
	Attributes  json.RawMessage `json:"attributes"`
}

// CreateVariantRequest is the POST /admin/products/:id/variants body (§9.5).
type CreateVariantRequest struct {
	Sku        string          `json:"sku"`
	Name       string          `json:"name"`
	PriceCents int64           `json:"price_cents"`
	Currency   string          `json:"currency"`
	Status     string          `json:"status"`
	Attributes json.RawMessage `json:"attributes"`
}

// UpdateVariantRequest is the PATCH /admin/variants/:id body — fields are optional.
type UpdateVariantRequest struct {
	Sku        *string         `json:"sku"`
	Name       *string         `json:"name"`
	PriceCents *int64          `json:"price_cents"`
	Currency   *string         `json:"currency"`
	Status     *string         `json:"status"`
	Attributes json.RawMessage `json:"attributes"`
}

// RestockRequest is the POST /admin/inventory/:variant_id/restock body.
type RestockRequest struct {
	Qty int32 `json:"qty"`
}

// --- responses ---

// PriceRange is the min/max variant price for a product (§9.5).
type PriceRange struct {
	Min int64 `json:"min"`
	Max int64 `json:"max"`
}

// ProductListItem is a row of GET /admin/products (§9.5).
type ProductListItem struct {
	ID              string     `json:"id"`
	Slug            string     `json:"slug"`
	Name            string     `json:"name"`
	Type            string     `json:"type"`
	Status          string     `json:"status"`
	VariantCount    int64      `json:"variant_count"`
	PriceRangeCents PriceRange `json:"price_range_cents"`
	TotalAvailable  int64      `json:"total_available"`
}

// ProductView is the create/update/get product response (§9.5).
type ProductView struct {
	ID          string          `json:"id"`
	Slug        string          `json:"slug"`
	Name        string          `json:"name"`
	Description string          `json:"description"`
	Type        string          `json:"type"`
	Status      string          `json:"status"`
	Attributes  json.RawMessage `json:"attributes"`
}

// ProductTypeSchemaView is GET /admin/product-types/:key (§9.5).
type ProductTypeSchemaView struct {
	Key             string          `json:"key"`
	Name            string          `json:"name"`
	AttributeSchema AttributeSchema `json:"attribute_schema"`
}

// VariantView is the create/update variant response (§9.5).
type VariantView struct {
	ID         string          `json:"id"`
	ProductID  string          `json:"product_id"`
	Sku        string          `json:"sku"`
	Name       string          `json:"name"`
	PriceCents int64           `json:"price_cents"`
	Currency   string          `json:"currency"`
	Status     string          `json:"status"`
	Attributes json.RawMessage `json:"attributes"`
	Available  int32           `json:"available"`
}

// InventoryView is the restock response (§9.5).
type InventoryView struct {
	VariantID string `json:"variant_id"`
	Available int32  `json:"available"`
	Reserved  int32  `json:"reserved"`
}

// InventoryListItem is a row of GET /admin/inventory (§9.5).
type InventoryListItem struct {
	VariantID   string `json:"variant_id"`
	Sku         string `json:"sku"`
	ProductName string `json:"product_name"`
	Available   int32  `json:"available"`
	Reserved    int32  `json:"reserved"`
}

// LedgerEntry is a row of GET /admin/inventory/:variant_id/ledger (§9.5).
type LedgerEntry struct {
	ID             int64     `json:"id"`
	Kind           string    `json:"kind"`
	DeltaAvailable int32     `json:"delta_available"`
	DeltaReserved  int32     `json:"delta_reserved"`
	ReservationID  *string   `json:"reservation_id"`
	CreatedAt      time.Time `json:"created_at"`
}

// OrderListItem is a row of GET /admin/orders (§9.5).
type OrderListItem struct {
	ID         string    `json:"id"`
	UserID     string    `json:"user_id"`
	Status     string    `json:"status"`
	TotalCents int64     `json:"total_cents"`
	Currency   string    `json:"currency"`
	ItemCount  int64     `json:"item_count"`
	CreatedAt  time.Time `json:"created_at"`
}

// --- builders ---

func productListItem(r admindb.AdminListProductsRow) ProductListItem {
	return ProductListItem{
		ID: r.ID.String(), Slug: r.Slug, Name: r.Name, Type: r.Type, Status: r.Status,
		VariantCount:    r.VariantCount,
		PriceRangeCents: PriceRange{Min: r.PriceMinCents, Max: r.PriceMaxCents},
		TotalAvailable:  r.TotalAvailable,
	}
}

func inventoryListItem(r admindb.AdminListInventoryRow) InventoryListItem {
	return InventoryListItem{
		VariantID: r.VariantID.String(), Sku: r.Sku, ProductName: r.ProductName,
		Available: r.Available, Reserved: r.Reserved,
	}
}

func ledgerEntry(r admindb.StockLedger) LedgerEntry {
	return LedgerEntry{
		ID: r.ID, Kind: r.Kind, DeltaAvailable: r.DeltaAvailable, DeltaReserved: r.DeltaReserved,
		ReservationID: uuidPtr(r.ReservationID), CreatedAt: r.CreatedAt,
	}
}

func orderListItem(r admindb.AdminListOrdersRow) OrderListItem {
	return OrderListItem{
		ID: r.ID.String(), UserID: r.UserID, Status: r.Status, TotalCents: r.TotalCents,
		Currency: r.Currency, ItemCount: r.ItemCount, CreatedAt: r.CreatedAt,
	}
}

func uuidPtr(u pgtype.UUID) *string {
	if !u.Valid {
		return nil
	}
	s := uuid.UUID(u.Bytes).String()
	return &s
}
