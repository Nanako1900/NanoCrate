# NanoCrate · 前端开发文档

> 总体方案见 [`../ecommerce-project-spec.md`](../ecommerce-project-spec.md);**API 契约以** [`backend.md` §9](./backend.md#9-rest-api-契约v1) **为唯一来源**。
> 前后端**分开开发**:前端基于契约用 **MSW mock 先行**,不阻塞等后端(见 §9)。

---

## 1. 这是什么

NanoCrate 的前端:一个 **React + TypeScript + Vite SPA**,通过 REST 消费后端 API,经 Keycloak 登录、Stripe 结账。设计上**反模板**——参考店(机械键盘)要有明确视觉方向,不能是默认 Tailwind 模板感。

---

## 2. 技术栈

| 关注点 | 选型 |
|---|---|
| 框架 / 构建 | React 18 + TypeScript + Vite |
| 样式 | Tailwind CSS + CSS 自定义属性(design tokens) |
| 服务端状态 | TanStack Query(缓存 / SWR / 失效) |
| 客户端状态 | 极简(Context / Zustand),能派生就不存 |
| URL 状态 | search params(过滤/排序/分页/搜索词/tab) |
| 表单 | React Hook Form + Zod |
| 鉴权 | keycloak-js(OIDC + PKCE) |
| 支付 | @stripe/stripe-js + @stripe/react-stripe-js |
| Mock | MSW(Mock Service Worker) |
| 测试 | Vitest(单元)+ Playwright(e2e / 视觉回归) |

---

## 3. 前置工具

```bash
node -v     # >= 20
corepack enable && corepack prepare pnpm@latest --activate
```

---

## 4. 快速开始

```bash
cd frontend
pnpm install
cp .env.example .env.local
pnpm dev                 # Vite dev server, 默认 :5173
# 默认 mock 模式(VITE_API_MODE=mock):不依赖后端即可开发全部页面
```

切到真后端:`.env.local` 设 `VITE_API_MODE=live` 且 `VITE_API_BASE_URL=http://localhost:8080/api/v1`。

---

## 5. 目录结构(按 feature/surface 组织,非按类型)

```
frontend/src/
  components/
    catalog/        # ProductCard / ProductGrid / ...
    product/        # ProductDetail / VariantPicker / ...
    search/         # SemanticSearchBar / ...
    cart/           # CartDrawer / CartLine / ...
    checkout/       # CheckoutForm / StripePayment / ...
    ui/             # Button / SurfaceCard / AnimatedText(基础件)
  hooks/            # useReducedMotion / useCart / useProducts ...
  lib/              # animation.ts / color.ts / format.ts
  services/
    api.ts          # 类型化 API 客户端(对接 backend §9 契约)
    types.ts        # 与契约对应的 TS 类型
  mocks/            # MSW handlers + fixtures(镜像契约样例)
  routes/           # 路由与页面装配
  styles/
    tokens.css      # 设计 token(颜色/字号/间距/动效)
    typography.css
    global.css
```

命名:组件 PascalCase;hook `use` 前缀;CSS 类 kebab-case;动效时间线 camelCase(`heroRevealTl`)。

---

## 6. 设计系统与样式

- **design token 用 CSS 自定义属性**,Tailwind theme 映射到 token,**不重复硬编码**调色板/字号/间距:

```css
:root {
  --color-surface: oklch(98% 0 0);
  --color-text:    oklch(18% 0 0);
  --color-accent:  oklch(68% 0.21 250);
  --text-hero:     clamp(3rem, 1rem + 7vw, 8rem);
  --space-section: clamp(4rem, 3rem + 5vw, 10rem);
  --ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);
}
```

- **反模板**(全局 design-quality 规范):机械键盘店先定一个具体方向(如工业/编辑感),有层次、有节奏、hover/focus/active 是设计过的,而非默认卡片网格。不默认深色模式。
- **语义化 HTML 优先**:`header/nav/main/section/footer`,别堆 `div`。
- **只动合成器友好属性**:`transform`/`opacity`/`clip-path`;避免动 `width/height/top/left/margin/font-size`。

---

## 7. 状态管理

| 关注点 | 工具 | 备注 |
|---|---|---|
| 服务端状态 | TanStack Query | 不要把它复制进客户端 store |
| 客户端状态 | Context / Zustand | 极简;能派生不存冗余 |
| URL 状态 | search params | 过滤/排序/分页/搜索词/tab 全放 URL,可分享 |
| 表单 | RHF + Zod | 校验 schema 与后端契约对齐 |

---

## 8. API 客户端层

- `services/api.ts`:**唯一**与后端通信处。统一拆信封(`{success,data,error,meta}`)、错误归一化抛出、附 `Authorization: Bearer`、`POST /checkout` 带 `Idempotency-Key`。
- `services/types.ts`:与 [backend.md §9.3 样例](./backend.md) 一一对应的 TS 类型(后续可由后端 OpenAPI 自动生成)。
- 组件**不直接 fetch**,经 TanStack Query hooks(`useProducts`/`useProduct`/`useSearch`/`useCart`/`useCheckout`)。

---

## 9. Mock-first 工作流(MSW)⭐ — 前后端解耦关键

前端**不等后端**:`src/mocks/handlers.ts` 按 [backend.md §9 契约](./backend.md#9-rest-api-契约v1)实现各端点,fixtures 镜像 §9.3 样例。

```
VITE_API_MODE=mock  → 启动 MSW worker, 拦截 /api/v1/*, 全页面可独立开发/测试
VITE_API_MODE=live  → 关闭 mock, 打真后端
```

- 后端契约更新时,**同步更新 handlers**(契约是双方的合同)
- e2e / 视觉回归默认跑在 mock 上,稳定、无后端依赖

---

## 10. 鉴权流程(Keycloak OIDC)

- `keycloak-js` 公共客户端 + **PKCE**;首屏 `init({ onLoad: 'check-sso' })`
- 登录走重定向到 Keycloak;回跳后拿 token,存内存(避免 XSS 取 token);静默刷新
- 受保护路由用 guard 组件;每次请求由 `api.ts` 注入 Bearer
- token 过期自动刷新失败 → 引导重新登录

---

## 11. 路由与关键页面

| 路由 | 页面 | 要点 |
|---|---|---|
| `/` `/c/:type` | 商品列表 | 过滤/排序/分页走 URL;骨架屏 |
| `/p/:slug` | 商品详情 | 规格选择器 → 价格/可售量随 variant 变 |
| `/search?q=` | 语义搜索 | 自然语言查询;展示混合搜索结果 |
| `/cart` | 购物车 | 乐观更新数量,失败回滚 + 可见报错 |
| `/checkout` | 结账 | 见 §12 |
| `/orders` `/orders/:id` | 订单 | 需登录 |
| `/admin/*` | 后台 | 需 admin 角色;商品 CRUD / 订单管理 |

---

## 12. Stripe 前端集成

1. `POST /checkout`(带 `Idempotency-Key`)→ 拿 `{ order_id, client_secret }`
2. `<Elements>` 注入 `client_secret`,用 **Payment Element**
3. `confirmPayment({ return_url })` → 跳回结果页
4. **支付成功以后端 webhook 为准**(SPEC §7):结果页轮询/查询订单状态,**不**靠前端跳转就判定成功
5. 缺货错误(`out_of_stock`)在结账前/中要有清晰提示

---

## 13. 可访问性(全局 web/testing 规范)

- 语义化结构 + 正确 ARIA;键盘可完整操作(焦点可见、可达)
- 尊重 `prefers-reduced-motion`(`useReducedMotion`)
- 颜色对比达标;表单有 label 与错误关联

---

## 14. 性能(全局 web/performance 规范)

| 指标 | 目标 |  | 预算 | 目标 |
|---|---|---|---|---|
| LCP | < 2.5s |  | JS(着陆,gzip) | < 150kb |
| INP | < 200ms |  | CSS | < 30kb |
| CLS | < 0.1 |  | App 页 JS | < 300kb |

- 图片显式 `width/height`;hero `fetchpriority=high`,其余 `loading=lazy`;优先 AVIF/WebP
- 动态 `import()` 重库(Stripe.js / 图表);非关键 CSS/JS 延迟
- 字体 ≤ 2 套,`font-display: swap`,只 preload 关键字重
- 动画只用合成器友好属性;`will-change` 窄用即弃

---

## 15. 安全(全局 web/security 规范)

- 生产配 CSP(优先 nonce,避免 `unsafe-inline` script)
- 绝不注入未净化 HTML;避免 `dangerouslySetInnerHTML`
- token 不落 `localStorage`(防 XSS 窃取);表单客户端+服务端双校验

---

## 16. 测试

```bash
pnpm test          # Vitest 单元(工具/hook/数据变换)
pnpm test:e2e      # Playwright e2e + 视觉回归
```

- **单元**:`lib/` 工具、自定义 hook、数据变换
- **视觉回归**:关键断点 **320 / 768 / 1024 / 1440**,hero/列表/详情/结账;两主题(若有)都测
- **e2e**:落地页加载、加购→结账关键流;默认跑 mock,避免 flaky 超时,用确定性等待

---

## 17. 提交 & CI

- Conventional Commits;CI:`lint → typecheck(tsc --noEmit) → test → build → 视觉回归`
- 推荐 PostToolUse 钩子顺序:format → lint → typecheck

---

## 18. Definition of Done(每个前端特性)

- [ ] 按 feature 组织,组件 < 800 行、职责单一
- [ ] 调用经 `api.ts` + TanStack Query;MSW handler 与契约同步
- [ ] design token 化、反模板、hover/focus/active 设计到位
- [ ] a11y(键盘/对比/reduced-motion)与响应式(320–1440 无溢出)达标
- [ ] 关键断点视觉回归 + 必要单元测试通过
- [ ] CWV/包体在预算内;commit 语义化
