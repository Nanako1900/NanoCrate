-- Revert 0009_product_search_tsv.
DROP INDEX IF EXISTS idx_products_search_tsv;
ALTER TABLE products DROP COLUMN IF EXISTS search_tsv;
