-- 库存预留引擎(SPEC §7 招牌)。一律参数化;原子条件更新用 :execrows 检查受影响行数。

-- name: TryReserveStock :execrows
-- 防超卖核心:available>=qty 才扣减(隐式行锁,READ COMMITTED 下正确)。
-- 返回受影响行数:==1 成功,==0 库存不足。
UPDATE inventory
SET available = available - $2,
    reserved  = reserved + $2,
    updated_at = now()
WHERE variant_id = $1 AND available >= $2;

-- name: CommitReservedStock :execrows
-- 提交(支付成功):reserved--(available 已在预留时扣减)。
UPDATE inventory
SET reserved = reserved - $2, updated_at = now()
WHERE variant_id = $1 AND reserved >= $2;

-- name: ReleaseReservedStock :execrows
-- 释放(取消/超时):available++, reserved--。
UPDATE inventory
SET available = available + $2,
    reserved  = reserved - $2,
    updated_at = now()
WHERE variant_id = $1 AND reserved >= $2;

-- name: GetInventory :one
SELECT variant_id, available, reserved, updated_at
FROM inventory WHERE variant_id = $1;

-- name: SetInventory :exec
-- 测试夹具/初始化:直接设定库存计数。
UPDATE inventory SET available = $2, reserved = $3, updated_at = now()
WHERE variant_id = $1;

-- name: CreateReservation :one
INSERT INTO reservations (order_id, variant_id, qty, status, expires_at)
VALUES ($1, $2, $3, 'held', $4)
RETURNING id, order_id, variant_id, qty, status, expires_at, created_at, updated_at;

-- name: GetReservation :one
SELECT id, order_id, variant_id, qty, status, expires_at, created_at, updated_at
FROM reservations WHERE id = $1;

-- name: MarkReservation :execrows
-- 状态机迁移仅当当前为 held(防 sweeper/webhook 竞争,先到者赢)。返回受影响行数。
UPDATE reservations
SET status = $2, updated_at = now()
WHERE id = $1 AND status = 'held';

-- name: ListReservationsByOrder :many
SELECT id, order_id, variant_id, qty, status, expires_at, created_at, updated_at
FROM reservations WHERE order_id = $1 ORDER BY created_at;

-- name: ListExpiredHeldReservations :many
SELECT id, order_id, variant_id, qty, status, expires_at, created_at, updated_at
FROM reservations
WHERE status = 'held' AND expires_at < now()
ORDER BY expires_at
LIMIT $1;

-- name: InsertLedger :exec
INSERT INTO stock_ledger (variant_id, delta_available, delta_reserved, kind, reservation_id)
VALUES ($1, $2, $3, $4, $5);

-- name: ReconcileLedger :one
-- 台账对账:每个 variant 的 delta 累计应等于库存净变化(SPEC §7 验证)。
SELECT
    COALESCE(SUM(delta_available), 0)::bigint AS sum_available,
    COALESCE(SUM(delta_reserved), 0)::bigint  AS sum_reserved,
    COUNT(*)::bigint                          AS entries
FROM stock_ledger WHERE variant_id = $1;

-- name: CountLedgerByKind :one
SELECT COUNT(*)::bigint FROM stock_ledger WHERE variant_id = $1 AND kind = $2;
