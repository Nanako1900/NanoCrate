package admin

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	admindb "github.com/Nanako1900/NanoCrate/backend/internal/admin/db"
	eventsdb "github.com/Nanako1900/NanoCrate/backend/internal/events/db"
	"github.com/Nanako1900/NanoCrate/backend/internal/inventory"
	"github.com/Nanako1900/NanoCrate/backend/internal/platform/observability"
)

const (
	defaultLimit        = 20
	maxLimit            = 100
	defaultLowThreshold = 5
)

var (
	productStatuses = map[string]bool{"draft": true, "active": true, "archived": true}
	variantStatuses = map[string]bool{"active": true, "inactive": true}
)

// Service implements the admin backend over admindb + the inventory engine.
type Service struct {
	pool *pgxpool.Pool
	q    *admindb.Queries
	inv  *inventory.Service
}

// NewService builds the admin service.
func NewService(pool *pgxpool.Pool, inv *inventory.Service) *Service {
	return &Service{pool: pool, q: admindb.New(pool), inv: inv}
}

// emitProductUpserted writes a ProductUpserted outbox row in the same tx as the
// product write, so search (re)indexing is driven reliably off the outbox relay.
func emitProductUpserted(ctx context.Context, tx pgx.Tx, productID uuid.UUID) error {
	payload, _ := json.Marshal(map[string]string{"product_id": productID.String()})
	return eventsdb.New(tx).InsertOutbox(ctx, eventsdb.InsertOutboxParams{
		AggregateType: "product",
		AggregateID:   productID,
		EventType:     "ProductUpserted",
		Payload:       payload,
		TraceParent:   observability.TraceParent(ctx),
	})
}

// ListProducts returns one page of products plus the total for the same filters.
func (s *Service) ListProducts(ctx context.Context, q, status *string, page, limit int) ([]ProductListItem, int64, error) {
	lim, off := pageOffset(page, limit)
	rows, err := s.q.AdminListProducts(ctx, admindb.AdminListProductsParams{Q: q, Status: status, Lim: lim, Off: off})
	if err != nil {
		return nil, 0, fmt.Errorf("admin list products: %w", err)
	}
	total, err := s.q.AdminCountProducts(ctx, admindb.AdminCountProductsParams{Q: q, Status: status})
	if err != nil {
		return nil, 0, fmt.Errorf("admin count products: %w", err)
	}
	items := make([]ProductListItem, 0, len(rows))
	for _, r := range rows {
		items = append(items, productListItem(r))
	}
	return items, total, nil
}

// ProductTypeSchema returns a product type's attribute schema (dynamic-form source).
func (s *Service) ProductTypeSchema(ctx context.Context, key string) (ProductTypeSchemaView, error) {
	pt, err := s.q.GetProductTypeByKey(ctx, key)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ProductTypeSchemaView{}, ErrProductTypeNotFound
		}
		return ProductTypeSchemaView{}, fmt.Errorf("get product type: %w", err)
	}
	schema, err := ParseSchema(pt.AttributeSchema)
	if err != nil {
		return ProductTypeSchemaView{}, err
	}
	return ProductTypeSchemaView{Key: pt.Key, Name: pt.Name, AttributeSchema: schema}, nil
}

// CreateProduct validates attributes against the type schema and inserts the product.
func (s *Service) CreateProduct(ctx context.Context, req CreateProductRequest) (ProductView, error) {
	pt, err := s.q.GetProductTypeByKey(ctx, req.Type)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ProductView{}, ErrProductTypeNotFound
		}
		return ProductView{}, fmt.Errorf("get product type: %w", err)
	}
	status := defaultStr(req.Status, "draft")
	if err := validateProductStatus(status); err != nil {
		return ProductView{}, err
	}
	if err := validateAttributes(pt.AttributeSchema, req.Attributes); err != nil {
		return ProductView{}, err
	}
	var row admindb.AdminCreateProductRow
	err = s.inTx(ctx, func(tx pgx.Tx) error {
		var e error
		row, e = s.q.WithTx(tx).AdminCreateProduct(ctx, admindb.AdminCreateProductParams{
			Slug: req.Slug, ProductTypeID: pt.ID, Name: req.Name, Description: req.Description,
			Status: status, Attributes: nonNilObject(req.Attributes), ImageUrl: req.ImageURL,
		})
		if e != nil {
			return e
		}
		return emitProductUpserted(ctx, tx, row.ID)
	})
	if isUniqueViolation(err) {
		return ProductView{}, ErrSlugConflict
	}
	if err != nil {
		return ProductView{}, fmt.Errorf("create product: %w", err)
	}
	return ProductView{
		ID: row.ID.String(), Slug: row.Slug, Name: row.Name, Description: row.Description,
		Type: req.Type, Status: row.Status, Attributes: row.Attributes,
	}, nil
}

// UpdateProduct applies the provided fields (PATCH), re-validating attributes.
func (s *Service) UpdateProduct(ctx context.Context, id uuid.UUID, req UpdateProductRequest) (ProductView, error) {
	cur, err := s.q.AdminGetProduct(ctx, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ProductView{}, ErrProductNotFound
		}
		return ProductView{}, fmt.Errorf("get product: %w", err)
	}
	slug := pick(req.Slug, cur.Slug)
	name := pick(req.Name, cur.Name)
	desc := pick(req.Description, cur.Description)
	status := pick(req.Status, cur.Status)
	imageURL := pick(req.ImageURL, cur.ImageUrl)
	attrs := cur.Attributes
	if req.Attributes != nil {
		attrs = req.Attributes
	}
	if err := validateProductStatus(status); err != nil {
		return ProductView{}, err
	}
	pt, err := s.q.GetProductTypeByKey(ctx, cur.Type)
	if err != nil {
		return ProductView{}, fmt.Errorf("get product type: %w", err)
	}
	if err := validateAttributes(pt.AttributeSchema, attrs); err != nil {
		return ProductView{}, err
	}
	var row admindb.AdminUpdateProductRow
	err = s.inTx(ctx, func(tx pgx.Tx) error {
		var e error
		row, e = s.q.WithTx(tx).AdminUpdateProduct(ctx, admindb.AdminUpdateProductParams{
			ID: id, Slug: slug, Name: name, Description: desc, Status: status,
			Attributes: nonNilObject(attrs), ImageUrl: imageURL,
		})
		if e != nil {
			return e
		}
		return emitProductUpserted(ctx, tx, id)
	})
	if isUniqueViolation(err) {
		return ProductView{}, ErrSlugConflict
	}
	if err != nil {
		return ProductView{}, fmt.Errorf("update product: %w", err)
	}
	return ProductView{
		ID: row.ID.String(), Slug: row.Slug, Name: row.Name, Description: row.Description,
		Type: cur.Type, Status: row.Status, Attributes: row.Attributes,
	}, nil
}

// ArchiveProduct soft-deletes a product (status=archived).
func (s *Service) ArchiveProduct(ctx context.Context, id uuid.UUID) (ProductView, error) {
	rows, err := s.q.AdminArchiveProduct(ctx, id)
	if err != nil {
		return ProductView{}, fmt.Errorf("archive product: %w", err)
	}
	if rows == 0 {
		return ProductView{}, ErrProductNotFound
	}
	cur, err := s.q.AdminGetProduct(ctx, id)
	if err != nil {
		return ProductView{}, fmt.Errorf("get archived product: %w", err)
	}
	return ProductView{
		ID: cur.ID.String(), Slug: cur.Slug, Name: cur.Name, Description: cur.Description,
		Type: cur.Type, Status: cur.Status, Attributes: cur.Attributes,
	}, nil
}

// CreateVariant adds a variant to a product and ensures a zeroed inventory row.
func (s *Service) CreateVariant(ctx context.Context, productID uuid.UUID, req CreateVariantRequest) (VariantView, error) {
	if _, err := s.q.AdminGetProduct(ctx, productID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return VariantView{}, ErrProductNotFound
		}
		return VariantView{}, fmt.Errorf("get product: %w", err)
	}
	status := defaultStr(req.Status, "active")
	if err := validateVariantStatus(status); err != nil {
		return VariantView{}, err
	}
	if err := validateObject(req.Attributes); err != nil {
		return VariantView{}, err
	}
	row, err := s.q.AdminCreateVariant(ctx, admindb.AdminCreateVariantParams{
		ProductID: productID, Sku: req.Sku, Name: req.Name, PriceCents: req.PriceCents,
		Currency: defaultStr(req.Currency, "USD"), Attributes: nonNilObject(req.Attributes), Status: status,
	})
	if isUniqueViolation(err) {
		return VariantView{}, ErrSlugConflict
	}
	if err != nil {
		return VariantView{}, fmt.Errorf("create variant: %w", err)
	}
	if err := s.inv.EnsureInventoryRow(ctx, row.ID); err != nil {
		return VariantView{}, fmt.Errorf("ensure inventory row: %w", err)
	}
	return VariantView{
		ID: row.ID.String(), ProductID: row.ProductID.String(), Sku: row.Sku, Name: row.Name,
		PriceCents: row.PriceCents, Currency: row.Currency, Status: row.Status,
		Attributes: row.Attributes, Available: 0,
	}, nil
}

// UpdateVariant applies the provided fields (PATCH).
func (s *Service) UpdateVariant(ctx context.Context, id uuid.UUID, req UpdateVariantRequest) (VariantView, error) {
	cur, err := s.q.AdminGetVariant(ctx, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return VariantView{}, ErrVariantNotFound
		}
		return VariantView{}, fmt.Errorf("get variant: %w", err)
	}
	status := pick(req.Status, cur.Status)
	if err := validateVariantStatus(status); err != nil {
		return VariantView{}, err
	}
	attrs := cur.Attributes
	if req.Attributes != nil {
		attrs = req.Attributes
	}
	if err := validateObject(attrs); err != nil {
		return VariantView{}, err
	}
	price := cur.PriceCents
	if req.PriceCents != nil {
		price = *req.PriceCents
	}
	row, err := s.q.AdminUpdateVariant(ctx, admindb.AdminUpdateVariantParams{
		ID: id, Sku: pick(req.Sku, cur.Sku), Name: pick(req.Name, cur.Name), PriceCents: price,
		Currency: pick(req.Currency, cur.Currency), Attributes: nonNilObject(attrs), Status: status,
	})
	if isUniqueViolation(err) {
		return VariantView{}, ErrSlugConflict
	}
	if err != nil {
		return VariantView{}, fmt.Errorf("update variant: %w", err)
	}
	available := int32(0)
	if iv, e := s.inv.GetInventory(ctx, id); e == nil {
		available = iv.Available
	}
	return VariantView{
		ID: row.ID.String(), ProductID: row.ProductID.String(), Sku: row.Sku, Name: row.Name,
		PriceCents: row.PriceCents, Currency: row.Currency, Status: row.Status,
		Attributes: row.Attributes, Available: available,
	}, nil
}

// Restock adds stock to a variant (atomic + ledger) and returns the new counts.
func (s *Service) Restock(ctx context.Context, variantID uuid.UUID, qty int32) (InventoryView, error) {
	if qty <= 0 {
		return InventoryView{}, &ValidationError{Details: []FieldError{{Field: "qty", Message: "must be a positive integer"}}}
	}
	if _, err := s.q.AdminGetVariant(ctx, variantID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return InventoryView{}, ErrVariantNotFound
		}
		return InventoryView{}, fmt.Errorf("get variant: %w", err)
	}
	inv, err := s.inv.Restock(ctx, variantID, qty)
	if err != nil {
		return InventoryView{}, fmt.Errorf("restock: %w", err)
	}
	return InventoryView{VariantID: variantID.String(), Available: inv.Available, Reserved: inv.Reserved}, nil
}

// ListInventory returns one page of inventory rows (optionally only low stock).
func (s *Service) ListInventory(ctx context.Context, low bool, threshold, page, limit int) ([]InventoryListItem, int64, error) {
	if threshold <= 0 {
		threshold = defaultLowThreshold
	}
	lim, off := pageOffset(page, limit)
	params := admindb.AdminListInventoryParams{Low: low, Threshold: int32(threshold), Lim: lim, Off: off}
	rows, err := s.q.AdminListInventory(ctx, params)
	if err != nil {
		return nil, 0, fmt.Errorf("admin list inventory: %w", err)
	}
	total, err := s.q.AdminCountInventory(ctx, admindb.AdminCountInventoryParams{Low: low, Threshold: int32(threshold)})
	if err != nil {
		return nil, 0, fmt.Errorf("admin count inventory: %w", err)
	}
	items := make([]InventoryListItem, 0, len(rows))
	for _, r := range rows {
		items = append(items, inventoryListItem(r))
	}
	return items, total, nil
}

// ListLedger returns one page of a variant's stock ledger.
func (s *Service) ListLedger(ctx context.Context, variantID uuid.UUID, page, limit int) ([]LedgerEntry, int64, error) {
	lim, off := pageOffset(page, limit)
	rows, err := s.q.AdminListStockLedger(ctx, admindb.AdminListStockLedgerParams{VariantID: variantID, Lim: lim, Off: off})
	if err != nil {
		return nil, 0, fmt.Errorf("admin list ledger: %w", err)
	}
	total, err := s.q.AdminCountStockLedger(ctx, variantID)
	if err != nil {
		return nil, 0, fmt.Errorf("admin count ledger: %w", err)
	}
	entries := make([]LedgerEntry, 0, len(rows))
	for _, r := range rows {
		entries = append(entries, ledgerEntry(r))
	}
	return entries, total, nil
}

// ListOrders returns one page of all orders, optionally filtered by status.
func (s *Service) ListOrders(ctx context.Context, status *string, page, limit int) ([]OrderListItem, int64, error) {
	lim, off := pageOffset(page, limit)
	rows, err := s.q.AdminListOrders(ctx, admindb.AdminListOrdersParams{Status: status, Lim: lim, Off: off})
	if err != nil {
		return nil, 0, fmt.Errorf("admin list orders: %w", err)
	}
	total, err := s.q.AdminCountOrders(ctx, status)
	if err != nil {
		return nil, 0, fmt.Errorf("admin count orders: %w", err)
	}
	items := make([]OrderListItem, 0, len(rows))
	for _, r := range rows {
		items = append(items, orderListItem(r))
	}
	return items, total, nil
}

// --- helpers ---

func (s *Service) inTx(ctx context.Context, fn func(pgx.Tx) error) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if err := fn(tx); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func pageOffset(page, limit int) (int32, int32) {
	if page < 1 {
		page = 1
	}
	if limit <= 0 {
		limit = defaultLimit
	}
	if limit > maxLimit {
		limit = maxLimit
	}
	return int32(limit), int32((page - 1) * limit)
}

func validateAttributes(schemaRaw json.RawMessage, attrs json.RawMessage) error {
	schema, err := ParseSchema(schemaRaw)
	if err != nil {
		return err
	}
	if errs := schema.Validate(attrs); len(errs) > 0 {
		return &ValidationError{Details: errs}
	}
	return nil
}

// validateObject ensures attrs is a JSON object (variants have no per-type schema).
func validateObject(attrs json.RawMessage) error {
	if len(attrs) == 0 {
		return nil
	}
	var m map[string]any
	if err := json.Unmarshal(attrs, &m); err != nil {
		return &ValidationError{Details: []FieldError{{Field: "attributes", Message: "must be a JSON object"}}}
	}
	return nil
}

func validateProductStatus(s string) error {
	if !productStatuses[s] {
		return &ValidationError{Details: []FieldError{{Field: "status", Message: "must be one of draft, active, archived"}}}
	}
	return nil
}

func validateVariantStatus(s string) error {
	if !variantStatuses[s] {
		return &ValidationError{Details: []FieldError{{Field: "status", Message: "must be one of active, inactive"}}}
	}
	return nil
}

func nonNilObject(p json.RawMessage) json.RawMessage {
	if len(p) == 0 {
		return json.RawMessage("{}")
	}
	return p
}

func defaultStr(v, fallback string) string {
	if v == "" {
		return fallback
	}
	return v
}

func pick(v *string, fallback string) string {
	if v != nil {
		return *v
	}
	return fallback
}

func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}
