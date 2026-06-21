-- Revert 0006_outbox_trace.
ALTER TABLE outbox DROP COLUMN IF EXISTS trace_parent;
