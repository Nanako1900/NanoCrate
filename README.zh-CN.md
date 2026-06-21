<h1 align="center">NanoCrate</h1>

<p align="center">
  <strong>一个为「被 fork」而生的开源云原生电商平台。</strong><br/>
  干净的 Go 内核、可插拔的架构,以及一套<em>可被证明</em>永不超卖的工业级库存引擎 —— 并附带一个机械键盘参考店让它落地可见。
</p>

<p align="center">
  <img src="https://img.shields.io/badge/license-Apache--2.0-blue.svg" alt="License: Apache-2.0"/>
  <img src="https://img.shields.io/badge/status-WIP-orange.svg" alt="Status: WIP"/>
  <img src="https://img.shields.io/badge/Go-1.23+-00ADD8?logo=go&logoColor=white" alt="Go 1.23+"/>
  <img src="https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black" alt="React 18"/>
  <img src="https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white" alt="PostgreSQL 16"/>
</p>

<p align="center">
  <a href="./README.md">English</a> ·
  <b>简体中文</b>
</p>

---

NanoCrate 是一个全栈、**模块化单体(modular monolith)**电商平台,你可以 fork 后适配到任何细分品类。它刻意**不是**「又一个商城」—— 价值在架构本身:柔性商品模型、四个清晰的扩展接口、一套**永不超卖**的预留式库存系统,以及语义搜索。仓库自带一个已 seed 的**机械键盘店**,作为可运行的参考实现与 Live Demo。

> **状态:** 早期开发中,目前**文档先行(docs-first)**。架构与 REST API 契约已定义,实现进行中。见[路线图](#-路线图)。

## ✨ 亮点

- **永不超卖 —— 并且能证明。** 预留式库存(`available`/`reserved` 双量 + append-only 台账 + 原子条件更新 + 幂等 Stripe webhook),由并发测试坐实:**500 个并发结账抢 100 件库存 → 恰好 100 个成功、0 超卖。** → [设计文档](ecommerce-project-spec.md)
- **为 fork 而生。** 四个可替换接口 —— `PaymentProvider`(Stripe)、`SearchProvider`(pgvector)、`Notifier`、`EventBus`(NATS)—— 适配新供应商或新品类是改配置,而不是重写。
- **柔性商品模型。** 核心字段 + JSONB 属性 + 按品类的属性 schema:一套 schema 装得下键盘、咖啡或任何东西 —— 还避开了 EAV 的痛。
- **语义 + 关键词搜索。** 基于 pgvector 的混合搜索 —— 用一句模糊的自然语言描述就能找到商品。
- **云原生、可观测。** 事件驱动 + outbox 模式 + 幂等消费者 + DLQ;结构化日志(`slog`)+ Prometheus 指标 + OpenTelemetry 链路追踪。

## 🏗 架构

```
     React + Vite SPA  ──REST / JSON──►  Go + Gin API (modular monolith)
                                           │   catalog · cart · checkout
                                           │   order · inventory · search
           ┌───────────────┬──────────────┼───────────────┐
       JWT │          sqlc │     interface │        outbox │
           ▼               ▼               ▼               ▼
       Keycloak       PostgreSQL        Stripe        NATS JetStream
       (OIDC)         + pgvector   (PaymentProvider)   (EventBus) ──► Worker
                                                       email · analytics ·
                                                       reservation sweeper · DLQ
```

| 层 | 选型 |
|---|---|
| 前端 | React + TypeScript + Vite + Tailwind(SPA) |
| 后端 | Go + Gin(模块化单体) |
| 数据库 | PostgreSQL + pgvector |
| 数据访问 | sqlc(编译期类型安全 SQL) |
| 鉴权 | Keycloak(OIDC / OAuth2 / JWT) |
| 支付 | Stripe |
| 消息 | NATS JetStream(outbox + 幂等消费者 + DLQ) |
| 可观测性 | slog + Prometheus + OpenTelemetry |
| 本地开发 | docker-compose |

## 📚 文档

- **[项目方案与架构](ecommerce-project-spec.md)** —— 完整设计、数据模型、并发、决策记录(ADR)
- **[后端指南 + REST API 契约](docs/backend.md)** —— API 的唯一真源
- **[前端指南](docs/frontend.md)** —— React/Vite 应用 + mock-first 工作流

> 文档目前以英文为主。

## 🚀 快速开始

> 一条命令的快速启动会随后端骨架一起到位。预期流程:

```bash
# 后端 —— 全程 docker-compose,开发期无需 K8s
cd backend && cp .env.example .env && docker compose up -d && make migrate-up && make run

# 前端 —— mock-first,无需后端即可运行
cd frontend && pnpm install && pnpm dev
```

在此之前,请看[开发指南](#-文档)。

## 🗂 项目结构

```
NanoCrate/
├── backend/                    # Go + Gin API(模块化单体)
├── frontend/                   # React + Vite SPA
├── docs/                       # 开发指南
├── ecommerce-project-spec.md   # 技术方案与决策
└── LICENSE                     # Apache-2.0
```

## 🛣 路线图

模块化单体优先,**始终可交付/可运行**。详见 [spec §12](ecommerce-project-spec.md)。

1. 骨架 —— Go + Postgres + sqlc + Keycloak JWT + 商品目录
2. 核心电商 —— 购物车 → Stripe 结账(幂等 webhook)→ 订单 → **预留库存 + 并发测试**
3. 异步 + 可观测 + 后台 —— NATS 消费者、DLQ、sweeper、Prometheus/Grafana、OTel
4. AI —— pgvector 语义 + 关键词搜索
5. 收尾 —— 键盘 seed 数据、README 截图、Live Demo、CI 绿
6. *(可选)* Kubernetes 部署;拆 2–3 个微服务

## 🤝 贡献

欢迎 Issue 与 PR。那四个扩展接口的设计初衷,正是让你能插入自己的支付网关、搜索后端、通知器或消息总线。

## 📄 许可证

[Apache-2.0](LICENSE) © 2026 Nanako1900
