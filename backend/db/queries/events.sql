-- 事件基础设施查询(outbox relay 发布 + 消费者幂等去重 + DLQ)。

-- name: ListUnpublishedOutbox :many
-- relay 轮询:按 id 顺序取未发布的 outbox 行(FIFO)。
SELECT id, aggregate_type, aggregate_id, event_type, payload, created_at
FROM outbox
WHERE published_at IS NULL
ORDER BY id
LIMIT $1;

-- name: MarkOutboxPublished :exec
UPDATE outbox SET published_at = now() WHERE id = $1;

-- name: MarkEventConsumed :execrows
-- 幂等消费:首个消费者写 1 行;重复投递写 0 行(已消费,跳过)。
INSERT INTO consumed_events (consumer, event_id) VALUES ($1, $2)
ON CONFLICT (consumer, event_id) DO NOTHING;

-- name: InsertDeadLetter :exec
INSERT INTO dead_letters (consumer, event_id, subject, event_type, payload, error, attempts)
VALUES ($1, $2, $3, $4, $5, $6, $7);

-- name: CountDeadLetters :one
SELECT COUNT(*)::bigint FROM dead_letters;

-- name: ListDeadLetters :many
SELECT id, consumer, event_id, subject, event_type, payload, error, attempts, created_at
FROM dead_letters
ORDER BY created_at DESC
LIMIT $1 OFFSET $2;
