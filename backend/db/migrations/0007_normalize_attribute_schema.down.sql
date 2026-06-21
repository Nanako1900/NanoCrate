-- Revert 0007 — restore the original JSON-Schema-shaped keyboard attribute_schema.
UPDATE product_types
SET attribute_schema = '{"type":"object","required":["layout"],"properties":{"layout":{"type":"string","enum":["60%","65%","75%","tkl","full"]},"hot_swappable":{"type":"boolean"}}}'::jsonb
WHERE key = 'keyboard';
