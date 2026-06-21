-- 0010_seed_keyboard_demo_expansion — grow the reference keyboard store to a
-- credible demo size with English descriptions (so the §8 "fuzzy description →
-- relevant product" search demo is convincing). Fixed UUIDs + ON CONFLICT DO
-- NOTHING → repeatable. Embeddings are populated by `make backfill` (or the
-- worker's ProductUpserted consumer); the keyword tsvector is auto-generated.

INSERT INTO products (id, slug, product_type_id, name, description, status, attributes, image_url) VALUES
    ('44444444-0000-0000-0000-000000000001', 'nano-tkl',
     '11111111-1111-1111-1111-111111111111', 'Nano TKL',
     'Tenkeyless mechanical keyboard with no numpad and an aluminium case, freeing desk space for gamers and minimalists.',
     'active', '{"layout":"tkl","hot_swappable":true}', 'https://cdn.nanocrate.dev/img/nano-tkl.webp'),
    ('44444444-0000-0000-0000-000000000002', 'nano-silent',
     '11111111-1111-1111-1111-111111111111', 'Nano Silent',
     'Full size keyboard with silent linear switches, quiet and calm for shared offices, late-night work and focus.',
     'active', '{"layout":"full","hot_swappable":true}', 'https://cdn.nanocrate.dev/img/nano-silent.webp'),
    ('44444444-0000-0000-0000-000000000003', 'nano-pro',
     '11111111-1111-1111-1111-111111111111', 'Nano Pro',
     'Premium 75% wireless mechanical keyboard, hot-swappable, gasket mounted, with thick PBT keycaps for a deep typing feel.',
     'active', '{"layout":"75%","hot_swappable":true}', 'https://cdn.nanocrate.dev/img/nano-pro.webp'),
    ('44444444-0000-0000-0000-000000000004', 'nano-rgb',
     '11111111-1111-1111-1111-111111111111', 'Nano RGB',
     'Full size gaming keyboard with bright per-key RGB lighting and fast linear switches for competitive play.',
     'active', '{"layout":"full","hot_swappable":false}', 'https://cdn.nanocrate.dev/img/nano-rgb.webp'),
    ('44444444-0000-0000-0000-000000000005', 'nano-budget',
     '11111111-1111-1111-1111-111111111111', 'Nano Budget',
     'Affordable 60% compact keyboard for beginners, with tactile brown switches and a small portable footprint.',
     'active', '{"layout":"60%","hot_swappable":false}', 'https://cdn.nanocrate.dev/img/nano-budget.webp'),
    ('44444444-0000-0000-0000-000000000006', 'nano-65-wireless',
     '11111111-1111-1111-1111-111111111111', 'Nano 65 Wireless',
     'Compact 65% wireless keyboard that keeps the arrow keys, great for travel and a tidy desk.',
     'active', '{"layout":"65%","hot_swappable":true}', 'https://cdn.nanocrate.dev/img/nano-65w.webp')
ON CONFLICT (id) DO NOTHING;

INSERT INTO variants (id, product_id, sku, name, price_cents, currency, attributes) VALUES
    ('55555555-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000001',
     'NANO-TKL-RED', 'TKL / red linear', 13900, 'USD', '{"switch":"red","keycaps":"pbt-black"}'),
    ('55555555-0000-0000-0000-000000000002', '44444444-0000-0000-0000-000000000001',
     'NANO-TKL-BRN', 'TKL / brown tactile', 13900, 'USD', '{"switch":"brown","keycaps":"pbt-black"}'),
    ('55555555-0000-0000-0000-000000000003', '44444444-0000-0000-0000-000000000002',
     'NANO-SIL-FULL', 'Full / silent red', 16900, 'USD', '{"switch":"silent-red","keycaps":"pbt-grey"}'),
    ('55555555-0000-0000-0000-000000000004', '44444444-0000-0000-0000-000000000003',
     'NANO-PRO-75', '75% / wireless / lubed', 18900, 'USD', '{"switch":"linear","keycaps":"pbt-white"}'),
    ('55555555-0000-0000-0000-000000000005', '44444444-0000-0000-0000-000000000004',
     'NANO-RGB-FULL', 'Full / RGB / red', 14900, 'USD', '{"switch":"red","keycaps":"abs-doubleshot"}'),
    ('55555555-0000-0000-0000-000000000006', '44444444-0000-0000-0000-000000000005',
     'NANO-BUD-60', '60% / brown', 6900, 'USD', '{"switch":"brown","keycaps":"abs-black"}'),
    ('55555555-0000-0000-0000-000000000007', '44444444-0000-0000-0000-000000000006',
     'NANO-65W-RED', '65% / wireless / red', 11900, 'USD', '{"switch":"red","keycaps":"pbt-beige"}')
ON CONFLICT (id) DO NOTHING;

INSERT INTO inventory (variant_id, available, reserved) VALUES
    ('55555555-0000-0000-0000-000000000001', 25, 0),
    ('55555555-0000-0000-0000-000000000002', 18, 0),
    ('55555555-0000-0000-0000-000000000003', 14, 0),
    ('55555555-0000-0000-0000-000000000004',  7, 0),
    ('55555555-0000-0000-0000-000000000005', 40, 0),
    ('55555555-0000-0000-0000-000000000006', 60, 0),
    ('55555555-0000-0000-0000-000000000007', 12, 0)
ON CONFLICT (variant_id) DO NOTHING;
