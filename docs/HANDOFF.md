# NanoCrate · 交接文档(START HERE)

> 换电脑 / 新会话 / 新协作者**第一份读这个**。深度内容指向其它文档,这里只给状态、上手、结构、规矩、待办。
> 最后更新:2026-06-21 · 仓库:https://github.com/Nanako1900/NanoCrate(public,Apache-2.0)

---

## 0. 这是什么

NanoCrate 是一个**开源、云原生、可二次开发的全栈电商平台**,带一个**机械键盘参考店**作为示例 + Live Demo。定位:个人学习 + 海外/云原生方向求职作品集。前后端分开开发,经一份**稳定的 REST 契约**解耦。

**文档地图(按需读):**
| 文档 | 作用 | 何时读 |
|---|---|---|
| `ecommerce-project-spec.md` | 总体方案、数据模型、库存并发(招牌)设计、ADR 决策记录 | 想懂"为什么这么设计" |
| `docs/backend.md` | 后端开发指南 + **REST API 契约 §9/§9.4(神圣,真源)** | 写后端 / 对接口 |
| `docs/frontend.md` | 前端开发指南 + mock-first 工作流 | 写前端 |
| `docs/design-brief.md` | UI/UX 设计要求(店面 + 管理后台,工业精密方向) | 做设计 / 管理后台 |
| `docs/HANDOFF.md` | 本文件,入口与现状 | 最先读 |

---

## 1. 当前状态(一览)

**阶段:**
| 阶段 | 内容 | 状态 |
|---|---|---|
| P1 | 骨架 + 商品目录(双端) | ✅ 完成 |
| P2 | 购物车 / 预留库存(招牌)/ Stripe 结账 / 订单 / outbox(双端) | ✅ 完成并已核验 |
| **P3** | 事件(NATS)+ 可观测 + 管理后台 | ⏳ 下一步(见 §6) |
| P4 | AI 语义搜索(pgvector) | 未开始 |
| P5 | 收尾(seed/README/Demo/CI) | 未开始 |
| P6(可选) | K8s 部署 + 拆微服务 | 未开始 |

**PR(全部 OPEN,堆叠):**
| PR | 分支 | 目标 | 内容 |
|---|---|---|---|
| #1 | `feat/backend-skeleton` | `main` | 后端 P1 |
| #3 | `feat/backend-checkout-inventory` | `feat/backend-skeleton` | 后端 P2 |
| #2 | `feat/frontend-skeleton` | `main` | 前端 P1 |
| #4 | `feat/frontend-checkout` | `feat/frontend-skeleton` | 前端 P2 |

**质量:** P1/P2 经多-agent 审查发现 25 个问题 → 全部修复 → 对抗式核验 **32/34 verified、0 回归**,两个丢钱的 CRITICAL(webhook 结算竞态、已转换车重结)已用 TDD 测试坐实。详见 [`p1p2 记忆`] 与 §6 的 2 个遗留 partial。

---

## 2. 在新机器上接手

**前置:** `gh` 已登录 **Nanako1900**(`gh auth status`)、git 身份已配;Go ≥1.23、Node ≥20 + pnpm、Docker。

**⚠️ 前后端用各自独立克隆目录**(别共用一个工作目录,两条分支会互相打架):

```bash
# 后端
git clone https://github.com/Nanako1900/NanoCrate.git NanoCrate
cd NanoCrate && git fetch --all && git checkout feat/backend-checkout-inventory
cd backend && cp .env.example .env && docker compose up -d && make migrate-up && make sqlc && make run
curl localhost:8080/healthz                      # 期望成功信封
# 测试:make test(含 testcontainers 集成)

# 前端(另一个目录)
git clone https://github.com/Nanako1900/NanoCrate.git NanoCrate-fe
cd NanoCrate-fe && git fetch --all && git checkout feat/frontend-checkout
cd frontend && pnpm install && cp .env.example .env.local && pnpm dev   # 默认 mock 模式,零后端依赖
# 测试:pnpm test / pnpm test:e2e ;构建:pnpm build
```

切真后端:前端 `.env.local` 设 `VITE_API_MODE=live` + `VITE_API_BASE_URL`。

---

## 3. 结构与技术栈

**Monorepo:** `backend/`(Go+Gin 模块化单体)· `frontend/`(React+Vite SPA)· `docs/` · `ecommerce-project-spec.md` · `LICENSE`(Apache-2.0)。

**后端:** Go + Gin + **sqlc** + PostgreSQL + pgvector;Keycloak(OIDC/JWT);Stripe(`PaymentProvider` 接口);NATS JetStream(P3,`EventBus` 接口);`slog` + Prometheus(+ OTel P3)。分层 `handler→service→repository→domain`。
**前端:** React18 + TS + Vite + Tailwind v4(CSS-first,token 真源 `frontend/src/styles/tokens.css`)+ TanStack Query + MSW(mock-first)+ Stripe.js + keycloak-js。
**本地:** docker-compose;K8s 推迟到开发完成后。

**招牌:库存预留防超卖** —— `available/reserved` 双量 + append-only `stock_ledger` + 原子条件更新 + 幂等 Stripe webhook + outbox,由"500 并发抢 100 → 恰好 100、0 超卖"集成测试坐实(SPEC §7)。
**可二次开发四接口:** `PaymentProvider`(Stripe)· `SearchProvider`(pgvector)· `Notifier` · `EventBus`(NATS)。

---

## 4. 规矩 / 红线(务必遵守)

- **API 契约 §9/§9.4 是神圣的**:后端实现、前端 mock 都以它为准;要改先同步双方 + 升版本,**不许单方擅改**。
- **不自合 PR**(don't self-merge);合并由人拍板。
- **前后端各自独立克隆/worktree**(共用会冲突)。
- **前端 mock-first**:基于契约用 MSW,`VITE_API_MODE` 切 mock/live。
- **库存/并发改动走 TDD**:先写能复现的测试再改。
- **Conventional Commits**,原子提交;commit 引用 issue 编号(如 Bxx/Fxx)。
- **开发由 goal-mode 提示词驱动**;审查/核验用多-agent workflow(各端问题分开路由给对应修复会话)。

---

## 5. 命令速查

**后端(`backend/`)**:`make run | migrate-up | migrate-new name=… | sqlc | test | test-int | cover | lint | build`
**前端(`frontend/`)**:`pnpm dev | build | preview | typecheck | test | test:e2e | lint`
**Git/GH**:`git fetch --all` · `gh pr list --state all` · `gh pr view <n>`

---

## 6. 待办 / 下一步

**A. 2 个遗留 partial(非阻塞,小):**
- **F11 · CORS 文档**:`frontend/src/services/api.ts` 加了 CORS 注释,但 `docs/backend.md §9.2` **未真正写入**凭证式跨源 CORS 约定。live 跨源在后端实现匹配响应头 + 契约写明前用不了(mock 不受影响)。→ 把 CORS 约定补进 §9.2 + 后端实现。
- **TEST-responsive**:`frontend/e2e/responsive.spec.ts` 覆盖 `/`、`/p/:slug`、`/cart`(320/768/1024/1440),漏了 `/checkout`、`/orders/:id`。→ 补这两页。

**B. 上 P3 前先拍平 PR 栈**(地基已核验扎实):
按依赖序合入 `main` —— 先 #1、#2,再把 #3、#4 retarget 到 `main` 后合。让 P3 从干净 main 起步。(不自合,人来拍板。)

**C. P3 建议拆两段:**
- **P3a · 事件 + 可观测(后端为主)**:NATS + 消费者(确认邮件/分析)+ DLQ + 预留 sweeper 完整调度 + Grafana/OTel/Jaeger(P2 已埋 Prometheus 指标 + 取消 pending 的 sweeper,顺势接上)。
- **P3b · 管理后台(双端)**:直接用 `docs/design-brief.md`(动态属性表单 + Stock Ledger 视图 + ⌘K 等)。

---

## 7. 联系/账户

GitHub:`Nanako1900` · git 身份:`nanako <nanako@nnkglobal.uk>`(仓库本地配置)。
