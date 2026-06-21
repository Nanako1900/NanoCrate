-- 0003_commerce — 购物车 / 预留库存 / 结账 / 订单(SPEC §5「其余表」+ §7 招牌并发)。
-- inventory.available/reserved 已在 0001 建。金额一律 *_cents bigint;状态用枚举字符串 + CHECK。

-- 购物车:游客(user_id NULL)或登录用户(Keycloak sub)
CREATE TABLE carts (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    text,                                   -- Keycloak sub;NULL = 游客
    status     text NOT NULL DEFAULT 'active'
                   CHECK (status IN ('active', 'converted', 'abandoned')),
    currency   text NOT NULL DEFAULT 'USD',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
-- 一个登录用户至多一个 active 车
CREATE UNIQUE INDEX idx_carts_user_active
    ON carts (user_id) WHERE status = 'active' AND user_id IS NOT NULL;

CREATE TABLE cart_items (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    cart_id    uuid NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
    variant_id uuid NOT NULL REFERENCES variants(id),
    qty        integer NOT NULL CHECK (qty > 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (cart_id, variant_id)
);

-- 订单:快照模式(order_items 定格购买时的价格/名称);idempotency_key 唯一防重复下单
CREATE TABLE orders (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         text NOT NULL,                     -- Keycloak sub
    cart_id         uuid,                              -- 来源车(弱关联,不级联)
    status          text NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'paid', 'failed', 'cancelled', 'fulfilled')),
    currency        text NOT NULL DEFAULT 'USD',
    subtotal_cents  bigint NOT NULL CHECK (subtotal_cents >= 0),
    total_cents     bigint NOT NULL CHECK (total_cents >= 0),
    idempotency_key text NOT NULL,                     -- POST /checkout 幂等(按 user 唯一,见下方索引)
    payment_provider text NOT NULL DEFAULT 'stripe',
    payment_status  text NOT NULL DEFAULT 'requires_payment'
                        CHECK (payment_status IN ('requires_payment', 'succeeded', 'failed')),
    stripe_payment_intent_id text,
    client_secret   text,                              -- 幂等重放时回传给前端
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_orders_user ON orders (user_id, created_at DESC);
CREATE INDEX idx_orders_pi   ON orders (stripe_payment_intent_id);
-- 幂等键按用户唯一(不同用户可用相同 Idempotency-Key,避免跨用户串单)
CREATE UNIQUE INDEX idx_orders_idempotency ON orders (user_id, idempotency_key);

CREATE TABLE order_items (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id         uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    variant_id       uuid NOT NULL,                    -- 快照,不强 FK(价格/名称定格)
    sku              text NOT NULL,
    name             text NOT NULL,
    unit_price_cents bigint NOT NULL CHECK (unit_price_cents >= 0),
    qty              integer NOT NULL CHECK (qty > 0),
    line_total_cents bigint NOT NULL CHECK (line_total_cents >= 0),
    created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_order_items_order ON order_items (order_id);

-- 预留:状态机 held → committed / released / expired(SPEC §7)
CREATE TABLE reservations (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id   uuid REFERENCES orders(id) ON DELETE SET NULL,   -- 独立预留可为空
    variant_id uuid NOT NULL REFERENCES variants(id),
    qty        integer NOT NULL CHECK (qty > 0),
    status     text NOT NULL DEFAULT 'held'
                   CHECK (status IN ('held', 'committed', 'released', 'expired')),
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_reservations_order ON reservations (order_id);
CREATE INDEX idx_reservations_sweep ON reservations (status, expires_at) WHERE status = 'held';

-- append-only 库存台账:每次 reserve/commit/release/expire/restock 一条流水(可对账重算)
CREATE TABLE stock_ledger (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    variant_id      uuid NOT NULL REFERENCES variants(id),
    delta_available integer NOT NULL,
    delta_reserved  integer NOT NULL,
    kind            text NOT NULL CHECK (kind IN ('reserve', 'commit', 'release', 'expire', 'restock')),
    reservation_id  uuid,
    created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_stock_ledger_variant ON stock_ledger (variant_id);

-- webhook / 消费者幂等去重
CREATE TABLE processed_events (
    event_id   text PRIMARY KEY,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Outbox:业务事务内写出,Phase 3 由 worker 轮询发布到 NATS(本阶段仅落库)
CREATE TABLE outbox (
    id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    aggregate_type text NOT NULL,
    aggregate_id   uuid NOT NULL,
    event_type     text NOT NULL,
    payload        jsonb NOT NULL DEFAULT '{}',
    created_at     timestamptz NOT NULL DEFAULT now(),
    published_at   timestamptz
);
CREATE INDEX idx_outbox_unpublished ON outbox (created_at) WHERE published_at IS NULL;
