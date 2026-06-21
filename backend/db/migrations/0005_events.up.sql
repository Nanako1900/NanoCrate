-- 0005_events — async event infrastructure (SPEC §6/§7): idempotent consumption
-- + dead-letter queue. The outbox table itself was created in 0003.

-- Consumer-scoped idempotency: each (consumer, event_id) is processed at most
-- once. Separate from processed_events (webhook dedup) so consumers and the
-- webhook never collide and multiple consumers dedup independently.
CREATE TABLE consumed_events (
    consumer   text NOT NULL,
    event_id   text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (consumer, event_id)
);

-- Dead-letter queue: events a consumer failed to process after N retries.
CREATE TABLE dead_letters (
    id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    consumer   text NOT NULL,
    event_id   text NOT NULL,
    subject    text NOT NULL,
    event_type text NOT NULL,
    payload    jsonb NOT NULL DEFAULT '{}',
    error      text NOT NULL,
    attempts   integer NOT NULL CHECK (attempts >= 0),
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_dead_letters_created ON dead_letters (created_at DESC);
