-- 管理后台查询(契约 §9.5)。一律参数化;金额 *_cents bigint;状态枚举 + CHECK。

-- name: GetProductTypeByKey :one
SELECT id, key, name, attribute_schema FROM product_types WHERE key = $1;

-- name: ListProductsForIndex :many
-- 搜索 backfill:取所有 active 商品的可索引文本来源。
SELECT id, name, description, attributes FROM products WHERE status = 'active' ORDER BY created_at;

-- name: AdminListProducts :many
SELECT
    p.id, p.slug, p.name, pt.key AS type, p.status,
    COUNT(DISTINCT v.id)::bigint              AS variant_count,
    COALESCE(MIN(v.price_cents), 0)::bigint   AS price_min_cents,
    COALESCE(MAX(v.price_cents), 0)::bigint   AS price_max_cents,
    COALESCE(SUM(inv.available), 0)::bigint   AS total_available
FROM products p
JOIN product_types pt ON pt.id = p.product_type_id
LEFT JOIN variants v  ON v.product_id = p.id
LEFT JOIN inventory inv ON inv.variant_id = v.id
WHERE (sqlc.narg('q')::text IS NULL OR p.name ILIKE '%' || sqlc.narg('q') || '%')
  AND (sqlc.narg('status')::text IS NULL OR p.status = sqlc.narg('status'))
GROUP BY p.id, pt.key
ORDER BY p.created_at DESC
LIMIT sqlc.arg('lim') OFFSET sqlc.arg('off');

-- name: AdminCountProducts :one
SELECT COUNT(*)::bigint FROM products p
WHERE (sqlc.narg('q')::text IS NULL OR p.name ILIKE '%' || sqlc.narg('q') || '%')
  AND (sqlc.narg('status')::text IS NULL OR p.status = sqlc.narg('status'));

-- name: AdminGetProduct :one
SELECT p.id, p.slug, p.name, p.description, pt.key AS type, p.status, p.attributes, p.image_url
FROM products p JOIN product_types pt ON pt.id = p.product_type_id
WHERE p.id = $1;

-- name: AdminCreateProduct :one
INSERT INTO products (slug, product_type_id, name, description, status, attributes, image_url)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING id, slug, name, description, status, attributes, image_url;

-- name: AdminUpdateProduct :one
UPDATE products
SET slug = $2, name = $3, description = $4, status = $5, attributes = $6, image_url = $7, updated_at = now()
WHERE id = $1
RETURNING id, slug, name, description, status, attributes, image_url;

-- name: AdminArchiveProduct :execrows
UPDATE products SET status = 'archived', updated_at = now() WHERE id = $1;

-- name: AdminCreateVariant :one
INSERT INTO variants (product_id, sku, name, price_cents, currency, attributes, status)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING id, product_id, sku, name, price_cents, currency, attributes, status;

-- name: AdminGetVariant :one
SELECT id, product_id, sku, name, price_cents, currency, attributes, status
FROM variants WHERE id = $1;

-- name: AdminUpdateVariant :one
UPDATE variants
SET sku = $2, name = $3, price_cents = $4, currency = $5, attributes = $6, status = $7, updated_at = now()
WHERE id = $1
RETURNING id, product_id, sku, name, price_cents, currency, attributes, status;

-- name: AdminListInventory :many
SELECT
    v.id AS variant_id, v.sku, p.name AS product_name,
    COALESCE(inv.available, 0)::int AS available,
    COALESCE(inv.reserved, 0)::int  AS reserved
FROM variants v
JOIN products p ON p.id = v.product_id
LEFT JOIN inventory inv ON inv.variant_id = v.id
WHERE (sqlc.arg('low')::bool = false OR COALESCE(inv.available, 0) <= sqlc.arg('threshold')::int)
ORDER BY COALESCE(inv.available, 0) ASC, v.sku
LIMIT sqlc.arg('lim') OFFSET sqlc.arg('off');

-- name: AdminCountInventory :one
SELECT COUNT(*)::bigint
FROM variants v
LEFT JOIN inventory inv ON inv.variant_id = v.id
WHERE (sqlc.arg('low')::bool = false OR COALESCE(inv.available, 0) <= sqlc.arg('threshold')::int);

-- name: AdminListStockLedger :many
SELECT id, variant_id, delta_available, delta_reserved, kind, reservation_id, created_at
FROM stock_ledger WHERE variant_id = $1
ORDER BY id DESC
LIMIT sqlc.arg('lim') OFFSET sqlc.arg('off');

-- name: AdminCountStockLedger :one
SELECT COUNT(*)::bigint FROM stock_ledger WHERE variant_id = $1;

-- name: AdminListOrders :many
SELECT o.id, o.user_id, o.status, o.total_cents, o.currency, o.created_at,
       COALESCE(SUM(oi.qty), 0)::bigint AS item_count
FROM orders o
LEFT JOIN order_items oi ON oi.order_id = o.id
WHERE (sqlc.narg('status')::text IS NULL OR o.status = sqlc.narg('status'))
GROUP BY o.id
ORDER BY o.created_at DESC
LIMIT sqlc.arg('lim') OFFSET sqlc.arg('off');

-- name: AdminCountOrders :one
SELECT COUNT(*)::bigint FROM orders
WHERE (sqlc.narg('status')::text IS NULL OR status = sqlc.narg('status'));
