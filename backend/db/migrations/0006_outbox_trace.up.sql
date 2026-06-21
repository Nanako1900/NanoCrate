-- 0006_outbox_trace — carry the producer's W3C traceparent on the outbox row so
-- the async publish/consume legs join the original (sync) request trace (SPEC §9).
ALTER TABLE outbox ADD COLUMN trace_parent text NOT NULL DEFAULT '';
