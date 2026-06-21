-- 0002_seed_keyboard_demo — 机械键盘参考店 seed(SPEC §1 “随仓库附带 seed 好的机械键盘店铺”)
-- 固定 UUID + ON CONFLICT DO NOTHING:可重复执行、集成测试可断言。
-- 生产部署如不需要示例数据,可在 down 迁移清除或跳过本迁移。

INSERT INTO product_types (id, key, name, attribute_schema) VALUES
    ('11111111-1111-1111-1111-111111111111', 'keyboard', 'Mechanical Keyboard',
     '{"type":"object","required":["layout"],"properties":{"layout":{"type":"string","enum":["60%","65%","75%","tkl","full"]},"hot_swappable":{"type":"boolean"}}}')
ON CONFLICT (id) DO NOTHING;

INSERT INTO products (id, slug, product_type_id, name, description, status, attributes, image_url) VALUES
    ('22222222-0000-0000-0000-000000000075', 'nano75',
     '11111111-1111-1111-1111-111111111111', 'Nano75',
     '75% 热插拔机械键盘,gasket 结构,适合日常与办公。',
     'active', '{"layout":"75%","hot_swappable":true}', 'https://cdn.nanocrate.dev/img/nano75.webp'),
    ('22222222-0000-0000-0000-000000000065', 'nano65',
     '11111111-1111-1111-1111-111111111111', 'Nano65',
     '65% 紧凑布局,保留方向键,桌面更省空间。',
     'active', '{"layout":"65%","hot_swappable":true}', 'https://cdn.nanocrate.dev/img/nano65.webp'),
    ('22222222-0000-0000-0000-0000000000ff', 'nano-full',
     '11111111-1111-1111-1111-111111111111', 'Nano Full',
     '全尺寸含数字小键盘,安静线性轴,适合财务与办公场景。',
     'active', '{"layout":"full","hot_swappable":true}', 'https://cdn.nanocrate.dev/img/nano-full.webp')
ON CONFLICT (id) DO NOTHING;

INSERT INTO variants (id, product_id, sku, name, price_cents, currency, attributes) VALUES
    ('33333333-0000-0000-0000-0000000075a1', '22222222-0000-0000-0000-000000000075',
     'NANO75-RED-PBTW', '75% / 红轴 / 白 PBT', 12900, 'USD', '{"switch":"red","keycaps":"pbt-white"}'),
    ('33333333-0000-0000-0000-0000000075a2', '22222222-0000-0000-0000-000000000075',
     'NANO75-BRN-ABS',  '75% / 茶轴 / 黑 ABS', 11900, 'USD', '{"switch":"brown","keycaps":"abs-black"}'),
    ('33333333-0000-0000-0000-0000000065a1', '22222222-0000-0000-0000-000000000065',
     'NANO65-RED-PBTW', '65% / 红轴 / 白 PBT',  9900, 'USD', '{"switch":"red","keycaps":"pbt-white"}'),
    ('33333333-0000-0000-0000-0000000ff0a1', '22222222-0000-0000-0000-0000000000ff',
     'NANOFULL-BRN-PBT', 'Full / 茶轴 / 灰 PBT', 14900, 'USD', '{"switch":"brown","keycaps":"pbt-grey"}'),
    ('33333333-0000-0000-0000-0000000ff0a2', '22222222-0000-0000-0000-0000000000ff',
     'NANOFULL-SIL-PBT', 'Full / 静音红轴 / 灰 PBT', 15900, 'USD', '{"switch":"silent-red","keycaps":"pbt-grey"}')
ON CONFLICT (id) DO NOTHING;

INSERT INTO inventory (variant_id, available, reserved) VALUES
    ('33333333-0000-0000-0000-0000000075a1', 12, 0),
    ('33333333-0000-0000-0000-0000000075a2', 30, 0),
    ('33333333-0000-0000-0000-0000000065a1',  8, 0),
    ('33333333-0000-0000-0000-0000000ff0a1',  0, 0),   -- 缺货示例
    ('33333333-0000-0000-0000-0000000ff0a2',  5, 0)
ON CONFLICT (variant_id) DO NOTHING;
