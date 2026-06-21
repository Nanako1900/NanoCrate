-- 事件基础设施查询(outbox relay 发布 + 消费者幂等去重 + DLQ)。

-- name: ListUnpublishedOutbox :many
-- relay 轮询:按 id 顺序取未发布的 outbox 行(FIFO)。
SELECT id, aggregate_type, aggregate_id, event_type, payload, trace_parent, created_at
FROM outbox
WHERE published_at IS NULL
ORDER BY id
LIMIT $1;

-- name: MarkOutboxPublished :exec
UPDATE outbox SET published_at = now() WHERE id = $1;

-- name: IsEventConsumed :one
-- 去重门:该 (consumer,event_id) 是否已消费。处理前查,已消费则跳过。
SELECT EXISTS(
    SELECT 1 FROM consumed_events WHERE consumer = $1 AND event_id = $2
)::bool;

-- name: MarkEventConsumed :execrows
-- 处理成功/进 DLQ 后落标(幂等):首次写 1 行;重复写 0 行。
INSERT INTO consumed_events (consumer, event_id) VALUES ($1, $2)
ON CONFLICT (consumer, event_id) DO NOTHING;

-- name: InsertDeadLetter :exec
-- 幂等:崩溃重投后重复写入同一 (consumer,event_id) 不产生重复 DLQ 行。
INSERT INTO dead_letters (consumer, event_id, subject, event_type, payload, error, attempts)
VALUES ($1, $2, $3, $4, $5, $6, $7)
ON CONFLICT (consumer, event_id) DO NOTHING;

-- name: CountDeadLetters :one
SELECT COUNT(*)::bigint FROM dead_letters;

-- name: ListDeadLetters :many
SELECT id, consumer, event_id, subject, event_type, payload, error, attempts, created_at
FROM dead_letters
ORDER BY created_at DESC
LIMIT $1 OFFSET $2;
