-- 0009_product_search_tsv — keyword half of hybrid search (SPEC §8). The semantic
-- half (embedding vector(1536) + HNSW) already exists from 0001. Add a generated
-- tsvector over name + description + attribute values, with a GIN index.
-- Uses the 2-arg to_tsvector(regconfig, text) form (IMMUTABLE) so it can be a
-- STORED generated column that auto-maintains on every insert/update.
ALTER TABLE products
    ADD COLUMN search_tsv tsvector
    GENERATED ALWAYS AS (
        to_tsvector('english',
            coalesce(name, '') || ' ' ||
            coalesce(description, '') || ' ' ||
            coalesce(attributes::text, ''))
    ) STORED;

CREATE INDEX idx_products_search_tsv ON products USING gin (search_tsv);
