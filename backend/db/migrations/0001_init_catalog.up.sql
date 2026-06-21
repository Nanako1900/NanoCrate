-- 0001_init_catalog — 商品目录核心 schema(SPEC §5)
-- 金额一律 *_cents bigint;状态用枚举字符串 + CHECK;JSONB 柔性属性;pgvector 语义列。

CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()(PG16 核心亦有,显式声明更稳)
CREATE EXTENSION IF NOT EXISTS vector;     -- pgvector 语义搜索(SPEC §8)

-- 品类模板:声明该类商品允许哪些属性(用于 service 层校验 JSONB)
CREATE TABLE product_types (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    key              text UNIQUE NOT NULL,            -- 'keyboard', 'coffee', ...
    name             text NOT NULL,
    attribute_schema jsonb NOT NULL DEFAULT '{}',     -- JSON Schema 风格
    created_at       timestamptz NOT NULL DEFAULT now()
);

-- 商品(款):共享信息 + 品类特有属性
CREATE TABLE products (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    slug            text UNIQUE NOT NULL,
    product_type_id uuid NOT NULL REFERENCES product_types(id),
    name            text NOT NULL,
    description     text NOT NULL DEFAULT '',
    status          text NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft', 'active', 'archived')),
    attributes      jsonb NOT NULL DEFAULT '{}',      -- 品类特有: {layout, hot_swappable, ...}
    image_url       text NOT NULL DEFAULT '',          -- 列表/详情主图(契约 §9.3 的 image 字段来源)
    embedding       vector(1536),                      -- 语义搜索(SPEC §8),Phase 4 填充
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_products_attributes ON products USING gin (attributes);   -- 按属性过滤(SPEC §5)
CREATE INDEX idx_products_type       ON products (product_type_id);
CREATE INDEX idx_products_status     ON products (status);
CREATE INDEX idx_products_embedding  ON products USING hnsw (embedding vector_cosine_ops);

-- 规格(SKU):真正可售、可定价、可计库存的单元
CREATE TABLE variants (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id   uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    sku          text UNIQUE NOT NULL,
    name         text NOT NULL,                        -- '75% / 红轴 / 白 PBT'
    price_cents  bigint NOT NULL CHECK (price_cents >= 0),
    currency     text NOT NULL DEFAULT 'USD',
    attributes   jsonb NOT NULL DEFAULT '{}',          -- {switch:'red', keycaps:'pbt-white'}
    status       text NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active', 'inactive')),
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_variants_product ON variants (product_id);

-- 库存:与 variant 1:1。available/reserved 双量见 SPEC §7(Phase 2 招牌并发)
CREATE TABLE inventory (
    variant_id  uuid PRIMARY KEY REFERENCES variants(id) ON DELETE CASCADE,
    available   integer NOT NULL DEFAULT 0 CHECK (available >= 0),   -- DB 兜底防超卖
    reserved    integer NOT NULL DEFAULT 0 CHECK (reserved  >= 0),
    updated_at  timestamptz NOT NULL DEFAULT now()
);
