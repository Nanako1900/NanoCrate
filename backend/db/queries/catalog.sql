-- 商品目录查询(sqlc)。一律参数化;不在查询中 SELECT embedding(避免 pgx 需注册 vector 类型)。

-- name: ListProductTypes :many
SELECT id, key, name, attribute_schema, created_at
FROM product_types
ORDER BY name;

-- name: CountProducts :one
SELECT COUNT(DISTINCT p.id)::bigint AS total
FROM products p
JOIN product_types pt ON pt.id = p.product_type_id
WHERE p.status = 'active'
  AND (sqlc.narg('type_key')::text IS NULL OR pt.key = sqlc.narg('type_key'))
  AND (sqlc.narg('q')::text IS NULL OR p.name ILIKE '%' || sqlc.narg('q') || '%');

-- name: ListProducts :many
-- 列表 + 过滤 + 分页 + 多种排序(单查询经 CASE 驱动 ORDER BY)。
-- price_from_cents = 该款 active 规格的最低价;currency 取对应币种。
SELECT
    p.slug,
    p.name,
    pt.key AS type,
    p.attributes,
    p.image_url,
    COALESCE(MIN(v.price_cents), 0)::bigint AS price_from_cents,
    COALESCE(MIN(v.currency), 'USD')::text  AS currency
FROM products p
JOIN product_types pt ON pt.id = p.product_type_id
LEFT JOIN variants v ON v.product_id = p.id AND v.status = 'active'
WHERE p.status = 'active'
  AND (sqlc.narg('type_key')::text IS NULL OR pt.key = sqlc.narg('type_key'))
  AND (sqlc.narg('q')::text IS NULL OR p.name ILIKE '%' || sqlc.narg('q') || '%')
GROUP BY p.id, pt.key
ORDER BY
    CASE WHEN sqlc.arg('sort')::text = 'price_asc'  THEN MIN(v.price_cents) END ASC,
    CASE WHEN sqlc.arg('sort')::text = 'price_desc' THEN MIN(v.price_cents) END DESC,
    CASE WHEN sqlc.arg('sort')::text = 'name'       THEN p.name END ASC,
    p.created_at DESC
LIMIT $1 OFFSET $2;

-- name: GetProductBySlug :one
SELECT
    p.id,
    p.slug,
    p.name,
    p.description,
    pt.key AS type,
    p.attributes
FROM products p
JOIN product_types pt ON pt.id = p.product_type_id
WHERE p.slug = $1 AND p.status = 'active';

-- name: ListVariantsByProductID :many
-- available = inventory.available(可售量,契约 §9.3);无库存行视为 0。
SELECT
    v.id,
    v.sku,
    v.name,
    v.price_cents,
    v.currency,
    v.attributes,
    COALESCE(inv.available, 0)::int AS available
FROM variants v
LEFT JOIN inventory inv ON inv.variant_id = v.id
WHERE v.product_id = $1 AND v.status = 'active'
ORDER BY v.price_cents;
