-- 订单 / 订单项(快照)/ 幂等去重 / outbox 查询。

-- name: CreateOrder :one
INSERT INTO orders (user_id, cart_id, currency, subtotal_cents, total_cents, idempotency_key)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING id, user_id, cart_id, status, currency, subtotal_cents, total_cents,
          idempotency_key, payment_provider, payment_status, stripe_payment_intent_id,
          client_secret, created_at, updated_at;

-- name: GetOrder :one
SELECT id, user_id, cart_id, status, currency, subtotal_cents, total_cents,
       idempotency_key, payment_provider, payment_status, stripe_payment_intent_id,
       client_secret, created_at, updated_at
FROM orders WHERE id = $1;

-- name: GetOrderForUser :one
SELECT id, user_id, cart_id, status, currency, subtotal_cents, total_cents,
       idempotency_key, payment_provider, payment_status, stripe_payment_intent_id,
       client_secret, created_at, updated_at
FROM orders WHERE id = $1 AND user_id = $2;

-- name: GetOrderByIdempotencyKey :one
-- 幂等键按用户作用域,防止跨用户串单。
SELECT id, user_id, cart_id, status, currency, subtotal_cents, total_cents,
       idempotency_key, payment_provider, payment_status, stripe_payment_intent_id,
       client_secret, created_at, updated_at
FROM orders WHERE user_id = $1 AND idempotency_key = $2;

-- name: GetOrderByPaymentIntent :one
SELECT id, user_id, cart_id, status, currency, subtotal_cents, total_cents,
       idempotency_key, payment_provider, payment_status, stripe_payment_intent_id,
       client_secret, created_at, updated_at
FROM orders WHERE stripe_payment_intent_id = $1;

-- name: SetOrderPaymentIntent :exec
UPDATE orders SET stripe_payment_intent_id = $2, client_secret = $3, updated_at = now()
WHERE id = $1;

-- name: MarkOrderPaid :execrows
-- 仅 pending → paid(幂等:重复 webhook 第二次受影响 0 行)。
UPDATE orders SET status = 'paid', payment_status = 'succeeded', updated_at = now()
WHERE id = $1 AND status = 'pending';

-- name: MarkOrderFailed :execrows
UPDATE orders SET status = $2, payment_status = 'failed', updated_at = now()
WHERE id = $1 AND status = 'pending';

-- name: ListOrdersByUser :many
SELECT o.id, o.status, o.total_cents, o.currency, o.created_at,
       COALESCE(SUM(oi.qty), 0)::bigint AS item_count
FROM orders o
LEFT JOIN order_items oi ON oi.order_id = o.id
WHERE o.user_id = $1
GROUP BY o.id
ORDER BY o.created_at DESC
LIMIT $2 OFFSET $3;

-- name: CountOrdersByUser :one
SELECT COUNT(*)::bigint FROM orders WHERE user_id = $1;

-- name: ListAbandonedPendingOrders :many
-- B6: orders stuck 'pending' that never received a payment intent (intent
-- creation failed after the order committed) and are older than the cutoff. With
-- no PI no payment can ever succeed, so a sweeper can safely cancel them and
-- release any stock still held — no late-payment race.
SELECT id FROM orders
WHERE status = 'pending'
  AND stripe_payment_intent_id IS NULL
  AND created_at < sqlc.arg(older_than)
ORDER BY created_at
LIMIT sqlc.arg(max_rows);

-- name: CreateOrderItem :exec
INSERT INTO order_items (order_id, variant_id, sku, name, unit_price_cents, qty, line_total_cents)
VALUES ($1, $2, $3, $4, $5, $6, $7);

-- name: ListOrderItems :many
SELECT id, order_id, variant_id, sku, name, unit_price_cents, qty, line_total_cents, created_at
FROM order_items WHERE order_id = $1 ORDER BY created_at;

-- name: InsertProcessedEvent :execrows
-- webhook 幂等:首次插入 1 行;重复投递 0 行。
INSERT INTO processed_events (event_id) VALUES ($1)
ON CONFLICT (event_id) DO NOTHING;

-- name: InsertOutbox :exec
INSERT INTO outbox (aggregate_type, aggregate_id, event_type, payload)
VALUES ($1, $2, $3, $4);

-- name: CountOutbox :one
SELECT COUNT(*)::bigint FROM outbox WHERE aggregate_id = $1 AND event_type = $2;
