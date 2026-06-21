-- 0007 — normalize product_type.attribute_schema to the contract §9.5 {fields:[...]}
-- shape (the dynamic-form source of truth). 0002 seeded a JSON-Schema shape.
UPDATE product_types
SET attribute_schema = '{"fields":[
  {"name":"layout","type":"select","required":true,"options":["60%","65%","75%","tkl","full"]},
  {"name":"hot_swappable","type":"bool","required":false}
]}'::jsonb
WHERE key = 'keyboard';
