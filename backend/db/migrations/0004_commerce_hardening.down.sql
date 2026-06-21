-- Revert 0004_commerce_hardening.

-- B9: drop the cart line quantity cap.
ALTER TABLE cart_items DROP CONSTRAINT IF EXISTS cart_items_qty_max;

-- B10: restore the original non-unique index on the payment intent id.
DROP INDEX IF EXISTS idx_orders_pi;
CREATE INDEX idx_orders_pi ON orders (stripe_payment_intent_id);
