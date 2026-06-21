-- 0008 — make dead-lettering idempotent: a crash between InsertDeadLetter and
-- MarkEventConsumed must not produce a duplicate DLQ row on redelivery.
ALTER TABLE dead_letters
    ADD CONSTRAINT dead_letters_consumer_event_uniq UNIQUE (consumer, event_id);
