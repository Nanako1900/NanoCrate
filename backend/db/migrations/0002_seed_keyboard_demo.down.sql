-- 0002_seed_keyboard_demo (down) — 清除示例数据(inventory/variants 经 FK 级联)
DELETE FROM products      WHERE product_type_id = '11111111-1111-1111-1111-111111111111';
DELETE FROM product_types WHERE id = '11111111-1111-1111-1111-111111111111';
