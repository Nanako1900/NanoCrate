-- 0004_commerce_hardening — post-review hardening of the commerce slice.

-- B10: a single order owns a Stripe PaymentIntent, so GetOrderByPaymentIntent
-- (a sqlc :one) must match at most one row. The 0003 index was non-unique, which
-- let the query silently pick one of several rows. Replace it with a PARTIAL
-- UNIQUE index so duplicates are rejected while the many NULLs (orders that have
-- no PI yet) remain exempt.
DROP INDEX IF EXISTS idx_orders_pi;
CREATE UNIQUE INDEX idx_orders_pi
    ON orders (stripe_payment_intent_id)
    WHERE stripe_payment_intent_id IS NOT NULL;

-- B9: bound a cart line's quantity so repeated accumulating upserts cannot
-- overflow int32 (or lock a whole SKU). The cap (999) must match
-- cart.MaxLineQty in the Go code. Handlers reject over-cap requests at the
-- boundary; this CHECK is the backstop for the upsert's running total.
ALTER TABLE cart_items ADD CONSTRAINT cart_items_qty_max CHECK (qty <= 999);
