-- Revert 0008.
ALTER TABLE dead_letters DROP CONSTRAINT IF EXISTS dead_letters_consumer_event_uniq;
