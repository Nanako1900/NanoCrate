# NanoCrate · 后端开发文档

> 总体技术方案见 [`../ecommerce-project-spec.md`](../ecommerce-project-spec.md)。
> 本文聚焦**后端如何开发、运行、测试**,并定义对前端公开的 **REST API 契约**——这是前后端**分开开发**时的唯一接口约定,改契约前必须知会前端。

---

## 1. 这是什么

NanoCrate 的后端:一个 **Go + Gin 模块化单体**,对外暴露 RESTful JSON API,内部按领域分模块。负责商品目录、购物车、结账、订单、库存(招牌并发)、搜索,经接口抽象对接 Keycloak / Stripe / NATS / pgvector。

---

## 2. 技术栈与版本

| 项 | 选型 | 版本参考 |
|---|---|---|
| 语言 | Go | 1.23+ |
| Web 框架 | Gin(备选 Chi) | v1.10+ |
| 数据库 | PostgreSQL + pgvector | PG 16,pgvector 0.7+ |
| 数据访问 | sqlc(生成类型安全代码) | v1.27+ |
| 迁移 | golang-migrate | v4 |
| 鉴权 | Keycloak(OIDC/JWT 校验) | 26.x |
| 支付 | Stripe Go SDK | v79+ |
| 消息 | NATS JetStream | 2.10+ |
| 日志 | 标准库 `log/slog` | — |
| 指标 | prometheus/client_golang | — |
| 追踪 | OpenTelemetry-Go | — |
| 测试 | 标准库 testing + testcontainers-go | — |

---

## 3. 前置工具

```bash
go version          # >= 1.23
docker --version    # docker compose v2
# 一次性安装开发工具
go install github.com/sqlc-dev/sqlc/cmd/sqlc@latest
go install -tags 'postgres' github.com/golang-migrate/migrate/v4/cmd/migrate@latest
go install github.com/air-verse/air@latest   # 可选:热重载
```

---

## 4. 快速开始

```bash
cd backend
cp .env.example .env            # 填本地默认值即可(见 §6)
docker compose up -d            # 起依赖: postgres+pgvector / keycloak / nats
make migrate-up                 # 建表
make sqlc                       # 生成数据访问代码
make run                        # 启动 API (默认 :8080)

curl localhost:8080/healthz     # → {"success":true,"data":{"status":"ok"}}
```

> docker-compose 是**日常开发的唯一依赖**;K8s 推迟到开发完成后(见 SPEC §12)。

---

## 5. 目录结构

```
backend/
  cmd/
    api/                # HTTP 服务入口
    worker/             # 事件消费者 + 预留 sweeper + DLQ(后期)
  internal/
    domain/             # 实体与领域逻辑(纯, 无 IO 依赖)
    catalog/            # 商品目录: handler/service/repo + JSONB 属性校验
    cart/
    checkout/           # 结账编排 + Stripe Saga
    order/
    inventory/          # 库存与预留(招牌并发, 见 SPEC §7)
    search/             # SearchProvider 接口 + pgvector 实现
    payment/            # PaymentProvider 接口 + stripe 实现
    notify/             # Notifier 接口 + 实现
    events/             # EventBus 接口 + nats 实现 + outbox 轮询
    auth/               # Keycloak JWT 中间件 + RBAC
    platform/           # 横切: config / logging / observability / db 连接池
  db/
    migrations/         # NNNN_name.up.sql / .down.sql
    queries/            # sqlc 查询(*.sql)
  sqlc.yaml
  docker-compose.yml
  Makefile
  .env.example
```

每个领域模块内部分层:`handler(HTTP)→ service(业务)→ repository(数据)→ domain(实体)`。依赖只能**从外向内**,`domain` 不依赖任何上层。

---

## 6. 配置 / 环境变量

启动时校验必填项缺失即 fail-fast(SPEC 编码原则)。绝不硬编码密钥。

| 变量 | 说明 | 本地示例 |
|---|---|---|
| `APP_ENV` | 环境 | `development` |
| `HTTP_PORT` | 监听端口 | `8080` |
| `DATABASE_URL` | Postgres DSN | `postgres://nano:nano@localhost:5432/nanocrate?sslmode=disable` |
| `KEYCLOAK_ISSUER` | OIDC issuer URL | `http://localhost:8081/realms/nanocrate` |
| `KEYCLOAK_JWKS_URL` | JWKS 端点 | `${ISSUER}/protocol/openid-connect/certs` |
| `KEYCLOAK_AUDIENCE` | 期望的 audience | `nanocrate-api` |
| `STRIPE_SECRET_KEY` | Stripe 私钥(test) | `sk_test_...` |
| `STRIPE_WEBHOOK_SECRET` | webhook 签名密钥 | `whsec_...` |
| `NATS_URL` | NATS 连接 | `nats://localhost:4222` |
| `EMBEDDING_PROVIDER` | embedding 来源(后期) | `openai` / `local` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | trace 导出(后期) | `http://localhost:4317` |

---

## 7. 数据库工作流

```bash
make migrate-new name=add_reservations   # 生成 NNNN_add_reservations.up/down.sql
make migrate-up                          # 应用
make migrate-down                        # 回滚一步
make sqlc                                # db/queries/*.sql → 生成 Go 代码
```

- **schema 定义**写在 `db/migrations/*.up.sql`(权威来源,见 SPEC §5 DDL)
- **查询**写在 `db/queries/*.sql`,用 sqlc 注解(`-- name: GetProductBySlug :one`)
- sqlc 生成的代码**不手改**;repository 层在其上做封装
- 金额一律 `bigint`(分);状态用枚举字符串 + CHECK

---

## 8. 编码约定

- **不可变优先**:返回新对象而非就地修改(SPEC / 全局编码规范)
- **小文件**:200–400 行常态,800 上限;按领域而非类型组织
- **错误处理**:每层显式处理;UI 向错误友好、服务端日志带上下文;绝不静默吞错
- **输入校验在边界**:handler 解析 + 校验,service 校验业务不变量(如 JSONB 属性按 `product_type.attribute_schema` 校验)
- **context 贯穿**:所有 IO 接口首参 `ctx context.Context`,用于超时/取消/trace 传播
- **函数 < 50 行,嵌套 ≤ 4 层**(早返回)

---

## 9. REST API 契约(v1)⭐

> **前后端解耦的唯一约定。** 前端基于本节用 MSW 写 mock 先行开发(见 frontend.md §Mock-first)。任何破坏性改动必须同步前端 + 升版本。

### 9.1 通用约定

- Base path:`/api/v1`
- 内容类型:`application/json; charset=utf-8`
- 鉴权:`Authorization: Bearer <JWT>`(Keycloak 签发)
- 统一响应信封(全局 patterns 规范):

```jsonc
// 成功
{ "success": true,  "data": <payload>, "error": null, "meta": <可选> }
// 失败
{ "success": false, "data": null, "error": { "code": "out_of_stock", "message": "..." } }
// 分页 meta
{ "total": 128, "page": 1, "limit": 20 }
```

- 错误码(节选):`unauthorized` `forbidden` `not_found` `validation_failed` `out_of_stock` `payment_failed` `conflict` `internal`
- 幂等:`POST /checkout` 需带 `Idempotency-Key` 头

### 9.2 端点清单

| Method | Path | 鉴权 | 说明 |
|---|---|---|---|
| GET | `/healthz` `/readyz` | — | 存活 / 就绪探针 |
| GET | `/metrics` | — | Prometheus 指标 |
| GET | `/product-types` | 公开 | 品类模板列表 |
| GET | `/products` | 公开 | 列表/过滤:`?type=&q=&page=&limit=&sort=` |
| GET | `/products/:slug` | 公开 | 商品详情 + 规格 + 可售量 |
| POST | `/search` | 公开 | 语义+关键词混合搜索 |
| GET | `/cart` | 会话 | 当前购物车(游客凭 cart cookie / 登录凭 JWT) |
| POST | `/cart/items` | 会话 | 加项 `{variant_id, qty}` |
| PATCH | `/cart/items/:id` | 会话 | 改数量 `{qty}` |
| DELETE | `/cart/items/:id` | 会话 | 删项 |
| POST | `/checkout` | 用户 | 预留库存+建订单 → `{order_id, client_secret}` |
| GET | `/orders` | 用户 | 自己的订单列表 |
| GET | `/orders/:id` | 用户 | 订单详情 |
| POST | `/webhooks/stripe` | 签名 | Stripe 回调(幂等, 见 SPEC §7) |
| GET | `/admin/orders` | admin | 全部订单 |
| POST | `/admin/products` | admin | 建商品 |
| PATCH | `/admin/products/:id` | admin | 改商品 |
| DELETE | `/admin/products/:id` | admin | 归档商品 |
| POST | `/admin/products/:id/variants` | admin | 加规格 |
| PATCH | `/admin/variants/:id` | admin | 改规格 |
| POST | `/admin/inventory/:variant_id/restock` | admin | 补货 `{qty}` |

### 9.3 关键端点样例(mock 以此为准)

```jsonc
// GET /api/v1/products?type=keyboard&page=1&limit=2
{ "success": true, "meta": { "total": 37, "page": 1, "limit": 2 },
  "data": [
    { "slug": "nano75", "name": "Nano75", "type": "keyboard",
      "price_from_cents": 12900, "currency": "USD",
      "attributes": { "layout": "75%", "hot_swappable": true },
      "image": "https://.../nano75.webp" }
  ] }

// GET /api/v1/products/nano75
{ "success": true, "data": {
    "slug": "nano75", "name": "Nano75", "description": "...",
    "type": "keyboard", "attributes": { "layout": "75%", "hot_swappable": true },
    "variants": [
      { "id": "v_01", "sku": "NANO75-RED-PBTW", "name": "75% / 红轴 / 白 PBT",
        "price_cents": 12900, "currency": "USD",
        "attributes": { "switch": "red", "keycaps": "pbt-white" },
        "available": 12 }
    ] } }

// POST /api/v1/search   body: { "query": "安静 适合办公的全尺寸热插拔", "limit": 10 }
{ "success": true, "data": { "hits": [ { "slug": "nano-full", "score": 0.82, "name": "..." } ] } }

// POST /api/v1/checkout   header: Idempotency-Key: <uuid>   body: { "cart_id": "..." }
{ "success": true, "data": { "order_id": "o_01", "client_secret": "pi_..._secret_..." } }
// 缺货:
{ "success": false, "data": null, "error": { "code": "out_of_stock", "message": "NANO75-RED-PBTW 库存不足" } }
```

### 9.4 购物车与订单形状(Phase 2,mock 以此为准)

```jsonc
// GET /cart  ——  POST/PATCH/DELETE /cart/items 均返回同形状的「最新购物车」
{ "success": true, "data": {
    "id": "cart_01", "currency": "USD", "item_count": 2, "subtotal_cents": 25800,
    "items": [
      { "id": "ci_01", "variant_id": "v_01", "sku": "NANO75-RED-PBTW",
        "name": "Nano75 · 75% / 红轴 / 白 PBT",
        "unit_price_cents": 12900, "qty": 2, "line_total_cents": 25800, "available": 12 }
    ] } }

// GET /orders
{ "success": true, "meta": { "total": 3, "page": 1, "limit": 20 },
  "data": [ { "id": "o_01", "status": "paid", "total_cents": 25800, "currency": "USD",
              "item_count": 2, "created_at": "2026-06-20T10:00:00Z" } ] }

// GET /orders/:id  ——  order_items 为下单快照(价格/名称定格在购买时)
{ "success": true, "data": {
    "id": "o_01", "status": "paid", "currency": "USD",
    "subtotal_cents": 25800, "total_cents": 25800,
    "payment": { "provider": "stripe", "status": "succeeded" },
    "items": [ { "sku": "NANO75-RED-PBTW", "name": "Nano75 · 75% / 红轴 / 白 PBT",
                 "unit_price_cents": 12900, "qty": 2, "line_total_cents": 25800 } ],
    "created_at": "2026-06-20T10:00:00Z" } }
```

- 订单 `status`:`pending | paid | failed | cancelled | fulfilled`
- 支付 `payment.status`:`requires_payment | succeeded | failed`
- 购物车增删改一律返回**最新购物车整体**(前端可直接替换缓存)
- `POST /checkout` 成功返回 `{ order_id, client_secret }`(见 §9.3);**支付成败以 Stripe webhook 为准**(SPEC §7),前端结果页查订单状态判定

---

## 10. 鉴权(Keycloak)

- 后端是 **OAuth2 Resource Server**:只**验证** Keycloak 签发的 JWT(JWKS 验签 + `iss`/`aud`/`exp` 校验),不存密码、保持无状态
- 中间件 `auth.RequireUser()` / `auth.RequireRole("admin")`,把 claims 注入 ctx → RBAC
- 本地拿 dev token:用 Keycloak 的 password grant 或前端登录后从 devtools 复制 Bearer

---

## 11. 招牌:库存并发与超卖防护

**完整设计见 SPEC §7**(预留模式 + 台账 + 原子条件更新 + 幂等 webhook + outbox)。开发要求:

- **TDD**:先写并发集成测试(500 goroutine 抢 100 库存,断言恰好 100 成功、最终 `available=0/reserved=100`、台账可对账),再写实现
- 预留扣减用单语句原子更新 + 检查 `RowsAffected==1`;`inventory.available >= 0` CHECK 兜底
- webhook 用 `processed_events(event_id)` 去重;订单用 `idempotency_key` 唯一约束

---

## 12. 事件 & Outbox(后期)

- 业务事务内写 `outbox` 表 → 轮询发布到 NATS(`internal/events`)
- 消费者(`cmd/worker`)幂等 + 失败进 DLQ;预留 sweeper 定时释放超时未支付库存
- 阶段 1–2 不引入(SPEC §4)

---

## 13. 可观测性

- **日志**:`slog` JSON,带 `request_id`/`trace_id`
- **指标**:`/metrics`,中间件采 RED + 业务指标(下单数 / 结账失败 / **库存冲突**)
- **追踪**:OTel 串 `handler→service→repo→DB` 与异步链路;埋点重点压在并发链路(SPEC §9)

---

## 14. 测试

```bash
make test           # 全部(go test ./...)
make test-int       # 集成(testcontainers 起真 Postgres)
make cover          # 覆盖率,目标 ≥ 80%(核心结账/库存必覆盖)
```

- **单元**:domain / service(mock repo 与四接口)
- **集成**:repository + DB(testcontainers)
- **并发**:§11 的超卖测试是必跑招牌
- 修复实现而非改测试(除非测试本身错)

---

## 15. Makefile 速查

`make run | air | migrate-up | migrate-down | migrate-new | sqlc | test | test-int | cover | lint | build`

---

## 16. 提交 & CI

- Conventional Commits:`feat|fix|refactor|docs|test|chore|perf|ci: ...`,语义化、原子提交
- CI(GitHub Actions):`lint → vet → test(含集成) → build`,绿 ✓ 才合并
- 安全自查:无硬编码密钥、输入已校验、SQL 用 sqlc 参数化、错误不泄敏

---

## 17. Definition of Done(每个后端特性)

- [ ] 迁移 + sqlc 查询就位,schema 与 SPEC §5 一致
- [ ] handler→service→repo 分层,输入在边界校验
- [ ] 测试覆盖(含必要的集成/并发),覆盖率达标
- [ ] API 与 §9 契约一致;改契约已知会前端并升版本
- [ ] 错误处理完整、日志/指标埋点到位
- [ ] docker-compose 下可端到端跑通,commit 语义化
