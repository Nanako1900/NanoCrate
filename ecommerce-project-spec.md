# NanoCrate — 开源云原生电商平台 · 技术方案与开发交接文档

> 用途:作为 Claude Code 的初始上下文与团队交接文档。可直接粘贴进 Claude Code,或保存为仓库里的 `SPEC.md`(`CLAUDE.md` 可引用本文件)。

---

## 1. 项目目标

- 从零搭建一个**通用、可二次开发的开源全栈电商平台**(open-source, fork-friendly e-commerce platform)
- **定位**:不绑死某个品类,而是提供一套干净的核心 + 清晰的扩展接口,让别人能 fork 后适配不同场景(机械键盘、咖啡豆、模型周边……)
- **参考店(Demo)**:随仓库附带一个 seed 好的**机械键盘店铺**,作为开箱即用的示例 + 可点击的 Live Demo
- 目的:个人学习 + 充实 GitHub 作品集,**主要用于求职**(云原生方向、海外为主)
- 许可证:**Apache-2.0**(带专利授权,平台型项目企业更敢用)
- 技术取向:现代云原生栈、贴近大厂工程实践、可部署上线

> 差异化逻辑:电商是 GitHub 上最泛滥的作品集类型。本项目的区分点**不是品类**,而是**"可二次开发的平台架构 + 一个最高标准的并发库存系统 + 语义搜索"**——这三样才是工程含金量所在。

---

## 2. 技术栈一览(快速参考)

| 层 | 选型 | 状态 |
|---|---|---|
| 定位 | 开源通用电商平台(Apache-2.0)+ 机械键盘参考店 | ✅ 已定 |
| 前端 | React + Tailwind CSS(Vite,SPA) | ✅ 已定 |
| 后端 | Go + Gin(备选 Chi) | ✅ 已定 |
| API 风格 | RESTful | ✅ 已定 |
| 数据库 | PostgreSQL + **pgvector** | ✅ 已定 |
| 数据访问 | **sqlc**(从 SQL 生成类型安全 Go 代码,编译期查错) | ✅ 已定 |
| 鉴权 | Keycloak(OIDC + OAuth2 + JWT) | ✅ 已定 |
| 支付 | Stripe(官方 Go SDK,`PaymentProvider` 接口默认实现) | ✅ 已定 |
| 搜索 / AI 亮点 | **语义 + 关键词混合搜索**(pgvector,`SearchProvider` 接口) | ✅ 已定 |
| 消息队列 | **NATS JetStream**(`EventBus` 接口默认实现) | ✅ 已定 |
| 异步可靠性 | **Outbox 模式 + 幂等消费者 + DLQ** | ✅ 已定 |
| 可观测性 | `log/slog` + Prometheus/Grafana + OpenTelemetry/Jaeger | ✅ 已定 |
| 本地开发 | **docker-compose**(全家桶) | ✅ 已定 |
| 部署 | Kubernetes(Docker + Helm/manifests + GitHub Actions) | ⏸️ 推迟到开发完成后 |
| 整体架构 | 模块化单体(modular monolith)+ 清晰扩展接口 | ✅ 已定 |

---

## 3. 架构概览(数据流)

```
                       浏览器 (React + Tailwind + Vite SPA)
                                │  REST / JSON
                                ▼
      ┌──────────────────────────────────────────────────────────┐
      │             Go + Gin API(模块化单体, cmd/api)            │
      │   catalog · cart · checkout · order · inventory · search   │
      │   ── 横切: auth(JWT) · slog · OTel trace · Prometheus ──   │
      └──┬───────────┬────────────┬───────────┬───────────────────┘
         │           │            │           │
 JWT 校验 │   sqlc    │  接口抽象  │  接口抽象  │ Outbox(同事务写出)
         ▼           ▼            ▼           ▼
     Keycloak   PostgreSQL    Stripe      NATS JetStream
    (OIDC IdP)  + pgvector  (Payment-     (EventBus)
                            Provider)          │  OrderPlaced / PaymentSucceeded ...
                                               ▼
                              Worker (cmd/worker)
                              ├─ 事件消费者:确认邮件(Notifier)/写分析/扣减提交
                              ├─ 预留 sweeper:释放超时未支付的库存
                              └─ DLQ:反复失败的事件隔离

  全部容器化。本地:docker-compose 一把拉起。上线:K8s(开发完成后)。
```

---

## 4. 详细选型与决策

### 前端
- **React + Tailwind CSS,用 Vite 构建(SPA)**;不用 Next.js
- 理由:SEO 主要是真实运营电商才在意;纯 SPA 让整个栈以 Go 后端为中心、更干净,也少一个服务进程
- 备注:Next.js/SSR 的权衡已了解(面试可阐述);因为后端是**干净的 REST**,日后想展示 SSR 可直接换前端层而不动后端

### 后端
- **Go + Gin**(备选 Chi),**RESTful**
- **架构:模块化单体** —— 一个 Go 服务,内部按**领域**分模块(catalog / cart / checkout / order / inventory / search ...),每模块内部 `handler → service → repository → domain`
- ⚠️ 原则:**先做模块化单体,不要一上来拆微服务**。一个做完、上线、文档齐全的项目 > 拆十个服务最后烂尾。跑通上线后如想练微服务,再把 order/inventory 拆 2–3 个服务(模块边界已经划好,拆起来不痛)。

### 数据库
- **PostgreSQL + pgvector 扩展**
- 数据访问:**sqlc**(从 SQL 生成类型安全 Go 代码,编译期查错)。理由:类型安全 + 编译期保证 + 对查询完全掌控;不用 GORM 是想显式展示对 SQL/索引/并发的理解(这正是本项目招牌)。

### 鉴权(Auth)
- **Keycloak**(自托管 IdP),协议 **OAuth 2.0 + OIDC**,token 用 **JWT**
- 模式:Keycloak 负责登录、签发 JWT;**Go/Gin 后端作为 OAuth2 Resource Server**,只验证签名 JWT + 角色映射(RBAC),后端不存密码、保持无状态
- 版本参考:Keycloak 26.x。本地用 docker-compose 起 Keycloak;别在 realm 主题美化上过度投入。

### 支付
- **Stripe**(官方 Go SDK),封装在 `PaymentProvider` 接口后(见 §6)
- 测试模式即可跑通;**务必实现 webhook 处理 + 幂等**(支付状态以 webhook 为准,不靠前端跳转判断成功)。Stripe 会重复投递 webhook —— 幂等是硬要求(见 §7)。

### 消息队列 → **NATS JetStream**
- 选 NATS 而非 Kafka:配"云原生 + 海外"站得住(CNCF 毕业项目),JetStream 提供持久化,运维负担远小于 Kafka/Strimzi。封装在 `EventBus` 接口后 —— **broker-agnostic,想换 Kafka 是换一个实现**(也服务于"可二次开发"主线)。
- 用途(事件驱动):下单后发 `OrderPlaced` → 消费者各自处理:确认邮件、写分析等
- **必做工业级模式**:Outbox(从 Postgres 事务可靠发事件)、幂等消费者(at-least-once 去重)、DLQ(死信队列)
- 节奏:阶段 1–2 用不到,**先不引入**;核心商城跑通、要做订单异步流程时再加(见 §12 路线图)

### AI 亮点 → **语义 + 关键词混合搜索**(详见 §8)
- 选语义搜索而非导购助手/推荐/文案:demo 里肉眼可见、用已有 Postgres(pgvector)不增加基础设施、与商品目录天然契合、自包含

### 基础设施 / 部署
- 本地开发:**docker-compose** 一把拉起(Postgres+pgvector、Keycloak、NATS、后端、可观测性栈)
- 部署:**推迟到开发完成后**再做 K8s(Deployment/Service/Ingress/ConfigMap/Secret 或 Helm)+ GitHub Actions CI/CD。届时部署一次、截图进 README 即可,日常开发不依赖 K8s。

---

## 5. 数据模型设计

**核心挑战**:通用平台要用一套 schema 装下不同品类完全不同的商品属性。
**方案:固定核心字段 + JSONB 柔性属性 + Product Type 校验 + Variant/SKU 分层**(不用 EAV)。

### 核心表(DDL 草图)

```sql
-- 品类模板:声明该类商品允许哪些属性(用于校验 JSONB)
CREATE TABLE product_types (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key              text UNIQUE NOT NULL,           -- 'keyboard', 'coffee', ...
  name             text NOT NULL,
  attribute_schema jsonb NOT NULL DEFAULT '{}',    -- 允许的属性/类型/必填(JSON Schema 风格)
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- 商品(款):共享信息 + 品类特有属性
CREATE TABLE products (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            text UNIQUE NOT NULL,
  product_type_id uuid NOT NULL REFERENCES product_types(id),
  name            text NOT NULL,
  description     text NOT NULL DEFAULT '',
  status          text NOT NULL DEFAULT 'draft',   -- draft | active | archived
  attributes      jsonb NOT NULL DEFAULT '{}',     -- 品类特有: 键盘={layout, hot_swappable, ...}
  embedding       vector(1536),                     -- 语义搜索(pgvector),见 §8
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON products USING gin (attributes);    -- 可按属性过滤

-- 规格(SKU):真正可售、可定价、可计库存的单元
CREATE TABLE variants (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id   uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sku          text UNIQUE NOT NULL,
  name         text NOT NULL,                       -- '75% / 红轴 / 白 PBT'
  price_cents  bigint NOT NULL CHECK (price_cents >= 0),
  currency     text NOT NULL DEFAULT 'USD',
  attributes   jsonb NOT NULL DEFAULT '{}',         -- 区分规格的选项: {switch:'red', keycaps:'pbt-white'}
  status       text NOT NULL DEFAULT 'active',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- 库存:与 variant 1:1(可后续扩展为按仓库多行)。available/reserved 见 §7
CREATE TABLE inventory (
  variant_id  uuid PRIMARY KEY REFERENCES variants(id) ON DELETE CASCADE,
  available   integer NOT NULL DEFAULT 0 CHECK (available >= 0),  -- DB 兜底防超卖
  reserved    integer NOT NULL DEFAULT 0 CHECK (reserved  >= 0),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
```

### 其余表(简述)
- `carts` / `cart_items`:`carts(user_id 可空 → 支持游客车, status)`,`cart_items(cart_id, variant_id, qty)`
- `orders` / `order_items`:订单用**快照模式**——`order_items` 存下单时的 `sku/name/unit_price_cents`,**不**实时 FK 到 variant(价格会变);`orders` 含 `stripe_payment_intent_id`、`idempotency_key`(唯一)
- `reservations`:库存预留(`variant_id, qty, status, expires_at`),见 §7
- `stock_ledger`:**append-only 库存台账**(每次 reserve/release/commit/restock 一条流水),见 §7
- `processed_events`:`event_id PK` —— webhook/消费者幂等去重
- `outbox`:`aggregate_*, event_type, payload jsonb, published_at` —— Outbox 模式

### 设计原则
- **属性校验在 service 层**:写入前用 `product_type.attribute_schema` 校验商品/规格的 JSONB(系统边界做输入验证)
- **金额一律用 `*_cents bigint`**,绝不用浮点
- **状态用显式枚举字符串 + CHECK**(或 Postgres enum)

---

## 6. 扩展接口与架构边界

"可二次开发"体现在**四个清晰接口**上(而非堆功能)。这是开源项目的卖点,也最能体现架构能力。每个接口都自带一个默认实现,fork 的人可替换。

```go
// PaymentProvider —— 支付网关抽象。默认实现:Stripe。
type PaymentProvider interface {
    CreatePaymentIntent(ctx context.Context, in CreatePaymentInput) (*PaymentIntent, error)
    // VerifyWebhook 校验签名并返回归一化事件(屏蔽各网关差异)
    VerifyWebhook(ctx context.Context, payload []byte, sig string) (*PaymentEvent, error)
}

// SearchProvider —— 商品搜索抽象。默认实现:pgvector(语义+关键词混合)。
type SearchProvider interface {
    Index(ctx context.Context, doc ProductDoc) error            // 建/更新索引(写 embedding)
    Search(ctx context.Context, q SearchQuery) ([]SearchHit, error)
}

// Notifier —— 对外通知抽象(邮件 / webhook / 站内信)。
type Notifier interface {
    Notify(ctx context.Context, n Notification) error
}

// EventBus —— 发布/订阅抽象。默认实现:NATS JetStream。
type EventBus interface {
    Publish(ctx context.Context, subject string, event Event) error
    Subscribe(ctx context.Context, subject string, h Handler) (Subscription, error)
}
```

- 接口定义在 `internal/<domain>` 或 `internal/ports`,实现在各自子包(`payment/stripe`、`search/pgvector`、`events/nats`)
- **只抽象这四个**,其余别过度设计(避免"接口地狱")
- 配置驱动选实现(如 `PAYMENT_PROVIDER=stripe`),方便 fork 替换

---

## 7. 库存并发与超卖防护(招牌工程 · 最高标准)

> 这是项目的 **signature**,面试最值钱。以最高标准设计,并用**并发测试**证明其正确。

### 核心认知
Stripe 支付是**异步的、要花时间**。既不能在等支付时超卖,也不能因用户没付成功而永久丢库存。真实电商(票务、Amazon)用的是**预留(Reservation)模式**。

### 模型:available / reserved 双量 + 预留状态机 + append-only 台账

```
available(可售)  reserved(已预留)
   下单开始 ──reserve──► available--, reserved++   (预留, 带 TTL)
   支付成功 ──commit ──► reserved--                (确认扣减, 真正卖出)
   超时/失败 ─release──► reserved--, available++   (释放回库)
```

预留状态机:`held → committed`(支付成功)/ `released`(主动取消)/ `expired`(超时,sweeper 释放)。

### 防超卖:单语句原子条件更新(无需手写显式锁)

```sql
UPDATE inventory
SET available = available - $qty,
    reserved  = reserved  + $qty,
    updated_at = now()
WHERE variant_id = $1 AND available >= $qty;
-- 检查 RowsAffected == 1;== 0 即"库存不足"。隐式行锁, READ COMMITTED 下即正确。
```

- 多商品结账:在**一个事务**内对每个 line 执行;任一返回 0 行 → 整单回滚(不留部分预留)
- 同步写 `stock_ledger`(kind=`reserve`, ref=reservation_id)
- `CHECK (available >= 0)` 是**纵深防御兜底**:即便逻辑有 bug,DB 也拒绝超卖

### Stripe 结账 Saga(幂等贯穿全程)

```
1. POST /checkout (带 idempotency_key)
2. 事务: 逐 line 原子预留 → 建 reservation(held, expires_at=now+15m) → 建 order(pending)
3. 调 PaymentProvider.CreatePaymentIntent → 返回 client_secret 给前端
4. 前端完成支付 → Stripe 异步回调 webhook
5. webhook: 校验签名 → INSERT processed_events(event_id) ON CONFLICT DO NOTHING
     ├─ 0 行(重复投递) → 直接 ACK 跳过        ← 幂等
     └─ 1 行(首次) → 事务: 校验 reservation 仍 held → commit(reserved--) →
                       order→paid → 写 outbox(OrderPlaced) → 写 ledger(commit)
6. Worker 读 NATS: 发确认邮件(Notifier) / 写分析 ...(消费者也幂等 + DLQ)
```

支付失败/取消 webhook → 释放预留(`available++, reserved--`,reservation→released,ledger release)。

### 后台 sweeper(预留 TTL)
`cmd/worker` 定时扫 `reservations WHERE status='held' AND expires_at < now()` → 在事务里再次确认仍 held(防与 webhook 竞争)→ 释放回 available。

### 必须处理的竞态(这些才是"最高标准"的体现)
- **sweeper 释放 vs webhook 提交 同时发生** → 都在事务里先校验 reservation 状态,只对 `held` 动手,先到者赢
- **webhook 重复投递** → `processed_events` 去重
- **订单重复创建** → `orders.idempotency_key` 唯一约束
- **事件反复消费失败** → 重试 N 次后进 DLQ,告警

### 怎么证明它对(作品集关键证据)
**并发集成测试**(testcontainers 起真 Postgres):

```
给定 variant available=100
启动 500 个 goroutine,各预留 1 件
断言: 恰好 100 个成功、400 个返回 ErrOutOfStock
断言: 最终 available=0、reserved=100
断言: SUM(stock_ledger.delta) 与 inventory 对账一致(台账可重算库存)
```

这个测试就是 README 的招牌证据;可再加 k6/vegeta 压测图证明高并发下依然不超卖。

---

## 8. 搜索 / AI 亮点(语义 + 关键词混合)

封装在 `SearchProvider` 接口后,默认实现用 **pgvector**。

- **向量列**:`products.embedding vector(1536)`,建 **HNSW 索引**(`vector_cosine_ops`)
- **embedding 生成**:由商品 `name + description + 关键属性` 拼接后过 embedding 模型生成;在后台异步生成(`SearchProvider.Index`),模型来源可配置(OpenAI `text-embedding-3-small` / 本地 embedding 服务)
- **混合搜索(highest standard)**:语义(pgvector 余弦)+ 关键词(Postgres `tsvector` 全文)融合排序(如 RRF / 加权),弥补纯向量在精确词匹配上的不足
- **Demo 体验**:"模糊描述找键盘"(如 _"安静、适合办公的全尺寸热插拔"_)→ 返回语义相关商品,直观展示 AI 价值

---

## 9. 可观测性(高性价比加分项)

对"云原生 + 海外",可观测性回报高。**增量做**,别一上来搭全套。

1. **结构化日志(Day 1,零成本)**:Go 标准库 `log/slog`(JSON handler),日志带 `request_id` / `trace_id`
2. **指标(早期,便宜)**:`prometheus/client_golang`,暴露 `/metrics`,中间件采 RED(请求量/错误率/延迟)+ **业务指标**:下单数、结账失败数、**库存冲突次数**
3. **链路追踪(做事件流时上,回报最大)**:OpenTelemetry(`otel` + OTLP),串 `handler→service→repository→DB` 与**异步链路** `producer→NATS→consumer`

- **可视化用标准栈**(docker-compose):Prometheus + Grafana(指标)+ Jaeger 或 Tempo(trace),README 截图
- **点睛**:把埋点重点放在 §7 的并发/超卖链路上——库存冲突有指标、锁竞争/重试有 trace、关联 ID 串日志,让**可观测性与招牌功能互相加分**

---

## 10. 差异化(让项目不"泛滥")

电商是 GitHub 上最常见的作品集类型,本项目的区分点是:
- **可二次开发的平台架构**(§6 四接口 + §5 柔性数据模型),而非又一个写死品类的店
- **最高标准的并发库存系统**(§7),带并发测试证明——这是真工程深度
- **语义+关键词混合搜索**(§8)——一个做深做透的 AI 亮点
- 附 **机械键盘参考店**:既证明可扩展性,又给一个点开就能用、可信的 Live Demo

---

## 11. 求职加分项(比技术栈更重要,务必做到)

- **真正部署上线**,README 顶部放可点击的 Live Demo 链接
- **认真的 README**:截图/GIF、技术栈、架构图、本地运行步骤、关键工程决策及理由
- **写测试**:核心结账/库存逻辑 + **§7 并发超卖测试**(招牌)+ GitHub Actions CI(绿 ✓)
- **干净的语义化 commit 历史**(别一个 "update" 塞几千行)
- **单独记录关键工程难点**:如何防超卖/并发下单、Stripe webhook 幂等、Outbox 可靠投递(见 §14 决策记录)
- 可观测性截图(Grafana 看板 + Jaeger trace)进 README

---

## 12. 开发路线图(约 6–10 周,分阶段;每阶段都 docker-compose 可跑)

1. **第 1–2 周 · 骨架**:Go+Gin + Postgres schema(product_type/product/variant/inventory)+ sqlc + `slog` + Keycloak JWT 跑通;商品列表/详情(React+Tailwind+Vite);**docker-compose 全家桶可起**
2. **第 3–4 周 · 核心电商 + 招牌**:购物车 → 结账 → Stripe(webhook 幂等)→ 订单;**§7 预留库存系统 + 并发测试**;Outbox 落库
3. **第 5–6 周 · 异步 + 可观测 + 后台**:引入 NATS,事件消费者(确认邮件/分析)+ DLQ + 预留 sweeper;Prometheus/Grafana + OTel/Jaeger;后台管理(商品 CRUD、订单管理)
4. **第 7–8 周 · AI 亮点**:pgvector 语义+关键词混合搜索(embedding 生成 + 搜索 UI)
5. **收尾**:机械键盘 seed 数据;README/截图/Demo GIF;补测试;CI 绿
6. **之后(可选)**:K8s(Helm/manifests)部署上线;按需把 order/inventory 拆 2–3 个微服务

> 核心节奏:**每完成一个阶段就 commit + 写文档,保持"始终能跑"**。竖切优先:先打通 `商品 → 购物车 → Stripe 结账 → 订单`,再逐层加事件/可观测/AI。

---

## 13. 给 Claude Code 的起步建议(项目结构)

```
cmd/
  api/                # HTTP 服务入口
  worker/             # 事件消费者 + 预留 sweeper + DLQ 处理
internal/
  domain/             # 实体与领域逻辑(Product, ProductType, Variant, Inventory, Cart, Order, Reservation)
  catalog/            # 商品目录模块(handler/service/repo)+ JSONB 属性校验
  inventory/          # 库存与预留(§7 招牌并发逻辑)
  cart/
  checkout/           # 结账编排 + Stripe Saga
  order/
  search/             # SearchProvider 接口 + pgvector 实现
  payment/            # PaymentProvider 接口 + stripe 实现
  notify/             # Notifier 接口 + 实现
  events/             # EventBus 接口 + nats 实现 + outbox 轮询发布
  auth/               # Keycloak JWT 中间件 + RBAC
  platform/           # 横切: config / logging(slog) / observability(otel,prometheus) / db
db/
  migrations/         # SQL 迁移
  queries/            # sqlc 查询
deploy/
  docker-compose.yml  # 本地全家桶
  k8s/                # 后期: Helm / manifests
```

起步顺序:
1. **先打通最小链路**:`商品列表/详情` + `Keycloak 登录与 JWT 校验`,确认本地 docker-compose 能起、能调通
2. **数据模型优先**:product_type / product / variant / inventory(§5);用户身份在 Keycloak,业务侧只存映射/资料
3. 鉴权接 Keycloak OIDC + JWT 校验中间件 + RBAC
4. 支付**重点做 Stripe webhook + 幂等**(§7),不靠前端跳转判断成功
5. 库存按 §7 预留模式实现,**先写并发测试(TDD)再写实现**

---

## 14. 决策记录(ADR-lite)

| # | 决策 | 选择 | 理由 |
|---|---|---|---|
| 1 | 项目定位 | 开源通用平台 + 机械键盘参考店 | 用平台架构差异化,而非品类;参考店保证 demo 可信 |
| 2 | 许可证 | Apache-2.0 | 带专利授权,平台型项目企业更敢用 |
| 3 | 前端 | Vite SPA(非 Next.js) | 作品集不需 SSR/SEO;以 Go 后端为中心更干净 |
| 4 | 后端架构 | 模块化单体 | 先做完上线 > 过早拆微服务;模块边界为后续拆分留路 |
| 5 | 数据访问 | sqlc | 类型安全 + 编译期查错 + 对 SQL 完全掌控 |
| 6 | 数据模型 | 核心字段 + JSONB + Product Type + Variant/SKU | 装下不同品类属性,避开 EAV 复杂度 |
| 7 | 扩展接口 | Payment/Search/Notifier/EventBus 四接口 | 服务可二次开发;体现架构能力;不过度抽象 |
| 8 | 消息队列 | NATS JetStream(接口抽象,可换 Kafka) | 云原生轻量;模式(outbox/幂等/DLQ)比 broker 更重要 |
| 9 | 库存并发 | 预留模式 + 台账 + 原子更新 + 幂等 webhook + outbox | 应对异步支付,杜绝超卖;招牌工程,有并发测试佐证 |
| 10 | AI 亮点 | 语义+关键词混合搜索(pgvector) | demo 可见、不增基础设施、与目录契合 |
| 11 | 可观测性 | slog + Prometheus/Grafana + OTel/Jaeger | 高性价比;与并发链路咬合 |
| 12 | 本地开发 | docker-compose(K8s 推迟) | 日常开发体验;K8s 完成后做部署展示 |

### 后续待定(不阻塞开发)
- [ ] embedding 模型来源:OpenAI API vs 本地 embedding 服务(`SearchProvider` 已抽象,延后定)
- [ ] Notifier 默认实现的邮件通道(SMTP / 第三方)
- [ ] Grafana 可视化栈精简程度(Jaeger vs Tempo+Loki 全套)
- [ ] K8s 阶段:Helm vs 原生 manifests
- [ ] 是否真拆微服务(order/inventory),作为最后可选练手
