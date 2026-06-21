-- 购物车查询。增删改后由 service 重新读取「最新购物车整体」(契约 §9.4)。

-- name: CreateCart :one
INSERT INTO carts (user_id, currency) VALUES ($1, $2)
RETURNING id, user_id, status, currency, created_at, updated_at;

-- name: GetCart :one
SELECT id, user_id, status, currency, created_at, updated_at
FROM carts WHERE id = $1;

-- name: GetActiveCartByUser :one
SELECT id, user_id, status, currency, created_at, updated_at
FROM carts WHERE user_id = $1 AND status = 'active';

-- name: TouchCart :exec
UPDATE carts SET updated_at = now() WHERE id = $1;

-- name: ClaimAndConvertCart :execrows
-- 结账的提交点(原子):仅当车仍 active 且属于本人或为游客车(NULL owner)时,
-- 同一语句内 claim 给用户并置 converted。返回受影响行数,调用方断言 ==1:
-- ==0 表示车已被并发/先前结账转换或不归本人 → 整个结账事务回滚(防重复结账/IDOR)。
UPDATE carts
SET user_id = sqlc.arg(user_id)::text, status = 'converted', updated_at = now()
WHERE id = sqlc.arg(id)
  AND status = 'active'
  AND (user_id IS NULL OR user_id = sqlc.arg(user_id)::text);

-- name: UpsertCartItem :one
-- 加项:同 variant 已存在则累加数量。
INSERT INTO cart_items (cart_id, variant_id, qty) VALUES ($1, $2, $3)
ON CONFLICT (cart_id, variant_id)
DO UPDATE SET qty = cart_items.qty + EXCLUDED.qty, updated_at = now()
RETURNING id, cart_id, variant_id, qty, created_at, updated_at;

-- name: GetCartItem :one
SELECT id, cart_id, variant_id, qty, created_at, updated_at
FROM cart_items WHERE id = $1;

-- name: UpdateCartItemQty :one
UPDATE cart_items SET qty = $2, updated_at = now() WHERE id = $1
RETURNING id, cart_id, variant_id, qty, created_at, updated_at;

-- name: DeleteCartItem :execrows
DELETE FROM cart_items WHERE id = $1 AND cart_id = $2;

-- name: ListCartItemsDetailed :many
-- 明细 + 商品/规格快照 + 可售量(契约 §9.4 的 cart item 形状)。
SELECT
    ci.id,
    ci.variant_id,
    ci.qty,
    v.sku,
    v.price_cents AS unit_price_cents,
    v.currency,
    (p.name || ' · ' || v.name)::text AS name,
    COALESCE(inv.available, 0)::int AS available
FROM cart_items ci
JOIN variants v ON v.id = ci.variant_id
JOIN products p ON p.id = v.product_id
LEFT JOIN inventory inv ON inv.variant_id = ci.variant_id
WHERE ci.cart_id = $1
ORDER BY ci.created_at;
