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
