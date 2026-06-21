-- 0001_init_catalog (down)
DROP TABLE IF EXISTS inventory;
DROP TABLE IF EXISTS variants;
DROP TABLE IF EXISTS products;
DROP TABLE IF EXISTS product_types;
-- 扩展保留(可能被其他对象依赖),不在回滚里 DROP EXTENSION。
