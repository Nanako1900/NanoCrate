# NanoCrate · UI/UX 设计要求(Design Brief)

> 配套:总体方案 [`../ecommerce-project-spec.md`](../ecommerce-project-spec.md)、前端工程规范 [`./frontend.md`](./frontend.md)。
> 本文是**店面(storefront)+ 管理后台(admin)两端共用的视觉/交互标准**,交给设计师或设计 Agent 时以此为准。
> **设计令牌的唯一来源是 `frontend/src/styles/tokens.css`**——所有界面只引用 token,绝不硬编码色值/字号/间距。

**方向已定:工业精密 / Technical Editorial(industrial spec-sheet)。** 骨架已落地光色系统;本文把它**固化为规范**,并补齐三块缺口:① 深色主题、② 完整组件库、③ 管理后台(全新界面)。

---

## 0. 怎么用这份文档

- 它是两端的**设计宪法**:配色、字体、间距、动效、组件、页面、可访问性、性能的统一约束。
- 现状:店面的 token + 商品目录页已实现(`feat/frontend-*`);本文标注 ✅已实现 / 🅖待补缺口 / ★招牌要求。
- 给设计 Agent 的交付物清单见 §15,验收清单见 §16。

---

## 1. 定位与设计目标

- **产品**:开源、可二次开发的电商平台 + 机械键盘**参考店**;面向**海外 / 云原生**求职作品集。
- **设计基调**:看起来是**精心设计、有工程感**的产品,而非模板。核心隐喻——**spec-sheet(精密仪器数据表)**:商品页读起来像一份严谨的规格单(等宽字体承载 SKU、轴体、配列、库存等技术数据)。
- **两端一套系统**:
  - **店面**:情绪化、转化导向、产品展示。
  - **后台**:数据密集、效率优先、工具属性。
  - 二者**共用 token 与组件**,只在**密度与布局**上区分(后台更紧凑)。这比"后台另做一套"更显系统化,也更好维护。

---

## 2. 设计原则(把全局规范落到本项目)

**反模板(硬性)。** 禁止:默认 Tailwind 卡片网格、居中标题+渐变球的通用 hero、未改造的库存组件、处处等距 padding、灰底白卡 + 一个装饰色、千篇一律的圆角/阴影。

**每个有意义的界面至少命中 4 项(本项目目标更高):**
1. 尺度对比建立层级(hero 巨大、mono 标签极小)
2. 有意的节奏(留白疏密有别,非均匀 padding)
3. 深度/层次(`surface`/`surface-sunken` 分层、warm 阴影、blueprint 网格)
4. 有性格的排版搭配(Space Grotesk × IBM Plex Mono)
5. 语义化用色(amber=品牌/触感,steel-blue=交互,stock 三态)
6. 设计过的 hover/focus/active 状态
7. 在合适处打破网格(编辑式/bento 构图)
8. 氛围质感(blueprint 网格、纸感、tactile 阴影)
9. 动效服务于流程而非炫技
10. 数据可视化是设计系统的一部分(后台图表)

**spec-sheet 语气**:技术元数据一律用 `.label-mono`(等宽、大写、加字距、`--ink-faint`)——SKU、轴体、配列、库存计数、订单号。

---

## 3. 视觉方向(Technical Editorial — 规范)

精密仪器 + 瑞士网格 + 暖纸基底。要点:
- **暖纸光色基底**(不是默认深色),warm 近黑墨色;**amber** 强调色传递"机械/触感/敲击"的温度;**steel-blue** 承载一切交互(链接/焦点/选区)。
- **hairline keylines**(发丝分割线)、**blueprint 网格**做氛围、**warm-tinted 阴影**做触感深度。
- **等宽字体专供技术数据**,强化 spec-sheet 性格。
- 构图:Swiss 网格为骨,关键处(hero、商品详情规格区)做编辑式打破。

---

## 4. 设计令牌(Design Tokens)

✅ 已在 `tokens.css` 定义(光色)。**引用方式**:Tailwind v4 `@theme inline` 已把 token 映射成工具类(如 `bg-surface text-ink border-line text-accent`),组件用工具类即可,token 仍是真源。

### 4.1 颜色 · 语义角色(光色,已实现)

| 角色 | token | 用途 |
|---|---|---|
| 页面底 | `--paper` | 页面背景(暖骨白) |
| 升起面 | `--surface` | 卡片/面板 |
| 凹陷面 | `--surface-sunken` | 凹槽、滑轨、表头底 |
| 反相面 | `--surface-invert` | 深色对比块 |
| 主文字 | `--ink` / `--ink-soft` / `--ink-faint` | 正文 / 次要 / 标签占位(AA) |
| 反相文字 | `--ink-invert` | 深块上的文字 |
| 结构线 | `--line` / `--line-strong` | 发丝线 / 强调分割 |
| 品牌强调(amber) | `--accent` `--accent-strong` `--accent-soft` `--accent-ink` | 主 CTA、品牌、触感强调 |
| 交互(steel-blue) | `--interactive` `--interactive-strong` `--interactive-soft` | 链接、焦点环、选区 |
| 库存三态 | `--stock-in/-bg/-ink`、`--stock-low/...`、`--stock-out/...` | 库存徽章(bg + 可访问 ink) |

### 4.2 🅖 深色主题(缺口 — 必须补)

`tokens.css` 目前只有 `:root`(`color-scheme: light`),但方向是"完整深色变体"。需新增 `[data-theme="dark"]`(并尊重 `prefers-color-scheme`,提供手动切换),**镜像每一个角色**。起步建议值(待校验 AA,深色用**暖炭**而非纯黑,保留 amber 性格):

```css
[data-theme="dark"] {
  color-scheme: dark;
  --paper: oklch(20% 0.012 62);          /* 暖炭,非纯黑 */
  --surface: oklch(24% 0.014 62);
  --surface-sunken: oklch(16.5% 0.012 62);
  --surface-invert: oklch(95% 0.008 85);
  --ink: oklch(93% 0.010 85);
  --ink-soft: oklch(77% 0.014 80);
  --ink-faint: oklch(66% 0.014 76);      /* 保持 ≥4.5:1 */
  --ink-invert: oklch(23% 0.018 62);
  --line: oklch(33% 0.014 70);
  --line-strong: oklch(42% 0.016 72);
  --accent: oklch(78% 0.150 66);         /* 深色下略提亮 */
  --accent-strong: oklch(72% 0.160 60);
  --accent-soft: oklch(32% 0.06 66);
  --accent-ink: oklch(16% 0.03 60);
  --interactive: oklch(70% 0.12 246);    /* 深色下提亮链接 */
  --interactive-strong: oklch(78% 0.11 246);
  --interactive-soft: oklch(30% 0.05 246);
  /* stock 三态:bg 调暗、ink 调亮,维持 AA */
}
```
要求:两主题**都要刻意设计**(全局规则);切换有持久化;blueprint 网格、阴影在深色下重新调透明度。

### 4.3 其他令牌(已实现,沿用)

- **字号**:`--text-2xs … --text-hero`(流体 clamp)
- **字重/字距**:regular→bold;`--tracking-tight`(标题)、`--tracking-label`(mono 标签)
- **间距**:`--space-gutter`、`--space-section`、`--max-content: 80rem`
- **圆角**:`--radius-xs(3px) … --radius-pill`
- **阴影**:`--shadow-sm/md/lift/inset`(warm-tinted)
- **动效**:`--duration-fast/normal/slow` + `--ease-standard/out-expo/out-back`
- **层级**:`--z-header(50)`、`--z-overlay(100)`
- **断点**:320 / 375 / 768 / 1024 / 1440 / 1920

---

## 5. 排版系统

- **Space Grotesk Variable** → 标题与 UI;**IBM Plex Mono** → 技术数据。仅此两族(全局规范)。
- **何时用 mono**:SKU、轴体/配列/键帽等规格、库存与数量、价格的数字部分(`tabular-nums`)、订单号、代码。用 `.label-mono`(标签)/ `.text-mono`(数据)。
- 标题:`--tracking-tight` + `text-wrap: balance`;正文 `--leading-normal`。
- 数字一律 `tabular-nums`(价格、数量、表格对齐)。

---

## 6. 组件库(状态齐全 · 店面与共用)

每个组件必须定义:结构 + 变体 + **全状态**(default / hover / focus-visible / active / disabled / loading)+ token 用法。focus 一律 steel-blue 环、**永不移除**。

| 组件 | 关键点 |
|---|---|
| **Button** | primary(amber 实心)/ secondary(描边)/ ghost / icon;尺寸 sm·md;**press 有触感**(轻微位移/缩放,呼应键盘);loading 态内联 spinner |
| **Input / Select / Search** | 标签关联、`aria-invalid`、错误文案 link;搜索框可带 mono 占位 |
| **Form field**(RHF + zod) | label、help、error 三段;校验态边框/图标用语义色 |
| **Surface / Card** | 商品卡:图 + 名称 + **mono 规格行** + 价格 + 库存徽章;hover `--shadow-lift` 轻抬升 |
| **Badge / Pill** | 库存三态用 stock token;状态徽章(订单) |
| **Filter chip / Tag** | 可选中态、可清除 |
| **Quantity stepper** | ★ 键帽式触感按钮(扣题机械键盘) |
| **Spec table** | 商品规格表:mono 键 + 值,hairline 分隔 |
| **Tabs / Accordion** | 详情信息分区 |
| **Drawer**(购物车) | 右侧滑入、焦点陷阱、Esc 关闭 |
| **Dialog / Confirm** | 破坏性操作确认(后台用得多) |
| **Toast / inline alert** | 成功/错误/警告;`aria-live` |
| **Skeleton** | 列表/详情/表格骨架(✅ ProductGridSkeleton 已有) |
| **Pagination** | mono 页码;键盘可达 |
| **Header / Footer** | hairline 分隔、mono 导航元信息、blueprint 氛围 |
| **空/加载/错误三态** | 每个数据区都要设计这三态,文案有性格 |

---

## 7. 店面(Storefront)信息架构 + 关键页面

每页定义:目的 · 布局意图 · 组件 · 交互 · 三态 · 响应式。

| 页面 | 要点 |
|---|---|
| **Home / Hero** | "Built for the typing obsessed";blueprint 网格 + 大尺度标题 + 产品展示;入口导向 catalog/search(✅ CatalogHero 已起) |
| **Catalog 列表 + 过滤** | **过滤/排序/分页走 URL state**;faceted 过滤来自商品属性(类型/轴体/配列/价格区间);grid + skeleton + 空态(✅ 已起) |
| **Product 详情** | 图库 + **规格选择器**(轴体/键帽/配列 → 价格与可售量随 variant 变)+ **mono 规格表** + 数量步进 + 库存徽章 + 关联推荐 |
| **语义搜索** | 自然语言输入("安静、适合办公的全尺寸热插拔")→ 混合搜索结果 + 相关度;无结果态 + 建议 |
| **Cart 抽屉** | 行项、数量**乐观更新**、合计、结账 CTA、空态 |
| **Checkout** | 联系/地址(RHF+zod)+ **Stripe Payment Element** + 订单摘要;`out_of_stock` / `payment_failed` 清晰处理 |
| **订单结果页** | **按订单状态判定成功**(轮询,不靠跳转,SPEC §7):成功/处理中/失败三态 |
| **Orders 列表 + 详情** | 需登录;状态徽章;`order_items` 为购买快照 |
| **Auth** | Keycloak 登录入口 + 账户菜单 |

---

## 8. 管理后台(Admin Panel)设计要求 ★ 全新界面

后台**复用同一套 token 与组件**,但更紧凑、桌面优先。

### 8.1 App Shell
- **侧边导航**:Dashboard / Products / Inventory / Orders /(Customers)/ Settings,带图标 + mono 计数。
- **顶栏**:全局搜索、账户、**主题切换**、环境徽章(dev/prod)。
- **内容区**:面包屑 + 页标题 + 操作区 + 主体。响应式:侧栏在窄屏收为抽屉。
- 密度:更紧的间距档(可加 `--space-compact` 变量),但仍走 token。

### 8.2 Dashboard
- KPI 卡:营收、订单数、转化、**低库存数**、**库存冲突次数(★ 呼应招牌并发系统)**。
- 最近订单表 + 低库存清单 + 图表(订单趋势、热销 Top)。
- **图表纳入设计系统**:配色用 token、坐标轴用 mono、网格用 `--line`;深浅主题都要适配。

### 8.3 Products 管理
- **DataTable**:可排序/过滤/分页/**批量选择**;列(图、名称、类型、规格数、价格区间、状态、库存);行操作。
- **创建/编辑商品表单** + **★ 动态属性表单(本平台旗舰 UX)**:
  - 表单字段**由 `product_type.attribute_schema`(JSONB)动态渲染** —— schema 决定字段(text/number/bool/select)、必填、校验。这是"通用可二次开发数据模型"在 UI 的体现,**必须重点设计**(schema → 表单的映射、错误提示、必填标记)。
  - **Variant/SKU 编辑器**:选项矩阵(如 轴体×键帽×配列)→ 生成 SKU,各自价格/库存。

### 8.4 Inventory 管理
- 每 variant 的 **available / reserved** 视图;**补货操作(带确认)**。
- **★ Stock Ledger(append-only 流水)视图**:reserve/commit/release/restock 历史 —— 既是审计,也是并发招牌的可视证据。
- 低库存过滤、预留状态。

### 8.5 Orders 管理
- 表 + 状态过滤;订单详情(快照行项、支付状态、**事件/状态时间线**);操作(履约/取消/退款占位)。

### 8.6 后台通用要求
- **DataTable** 统一规格:排序/过滤/分页/批量/空/加载(骨架)/错误。
- 破坏性操作必须 **Confirm Dialog**;写操作**乐观更新 + 失败回滚 + toast**。
- 表单内联校验、`aria-invalid`、错误聚焦。
- **RBAC**:后台路由需 admin 角色;无权限态有专门页面。
- ★ 锦上添花(扣题):**命令面板(⌘K)+ 键盘快捷键 + 键帽式 key hint** —— 键盘店的后台用键盘驱动,极加分。
- 空态有引导(无商品 → 引导导入 seed)。

---

## 9. 动效规范

- **只动合成器友好属性**:`transform` / `opacity` / `clip-path`;时长/缓动用 token。
- 用在:hover 抬升、抽屉滑入、轻微页面过渡、reveal、**按钮/步进的触感反馈**。
- 不做炫技动效。`prefers-reduced-motion` 已全局兜底(`global.css`),组件仍需自检。

---

## 10. 可访问性(WCAG 2.1 AA)

- 对比 **AA**(token 已朝 AA 设计,**两主题都要复核**)。
- **focus-visible** steel-blue 环、永不移除(✅ 已全局)。
- **键盘全可达**:目录/详情/购物车/结账/后台表格/命令面板。
- **语义化 HTML**:`header/nav/main/section/footer`;数据用 `<table>` 语义;表单 label 关联。
- ARIA:抽屉/对话框焦点陷阱;购物车更新与 toast 用 `aria-live`;`aria-invalid` + 错误关联。
- 触控目标 ≥ 44px;`prefers-reduced-motion` 尊重。

---

## 11. 性能与资产

- **CWV**:LCP<2.5s、INP<200ms、CLS<0.1、FCP<1.5s。
- **包体预算**:着陆 JS<150kb(gz)、应用页<300kb、CSS<30kb。
- **图片**:显式 `width/height`;AVIF/WebP;hero `fetchpriority=high`,below-fold `loading=lazy`。当前是 SVG 占位 → 生产需**键盘产品摄影规范**(见 §12)。
- **字体**:仅 Space Grotesk + IBM Plex Mono(fontsource),`font-display: swap`,只 preload 关键字重。
- **代码分割**:Stripe.js、后台图表用动态 `import()`。

---

## 12. 响应式 + 图像/内容方向

- **断点**:320/375/768/1024/1440/1920;店面 mobile-first;后台桌面优先(侧栏→抽屉,表格→卡片或横向滚动);**无溢出**。
- **产品摄影**:键盘统一角度/打光(光色主题用暖 off-white 背景,呼应 spec-sheet);轴体/键帽细节图;统一比例。
- **语气**:精准、懂行、略带克制的幽默;技术元数据走 mono 标签。空/错/加载文案要有性格。
- **图标**:线性、统一描边、技术感。

---

## 13. 交付物(给设计师 / 设计 Agent)

1. **补全 token**:`tokens.css` 增加 `[data-theme="dark"]`(§4.2),两主题复核 AA。
2. **组件规格 / 编码组件**:§6 全部组件,含所有状态 + 两主题。
3. **关键屏设计**(店面 + 后台)在断点 320/768/1024/1440 + 两主题:
   - 店面:Home、Catalog、Product 详情、搜索、Cart、Checkout、订单结果、Orders。
   - 后台:Dashboard、Products 表、**商品编辑(动态属性表单)**、Variant 编辑、Inventory(含 ledger)、Orders。
4. **原型**:catalog→detail→cart→checkout;后台 商品创建(动态属性)→ Inventory 补货。
5. **视觉回归基线**:各关键屏在 320/768/1024/1440 截图(对齐 frontend.md 测试要求)。

---

## 14. 验收清单(每个组件 / 屏)

- [ ] 不像默认 Tailwind/shadcn 模板?
- [ ] hover/focus/active 是设计过的?
- [ ] 用层级而非均匀强调?
- [ ] 放进真实产品截图里可信?
- [ ] 两主题都刻意设计?
- [ ] 只用 token、零硬编码色值/字号/间距?
- [ ] a11y:键盘走通 + 自动检查过 + 对比达标?
- [ ] 响应式 320–1440 无溢出、触控目标达标?

---

## 15. 范围 / 暂不做

- 暂不做:营销 CMS 页、UI 多语言、多币种展示(仅格式化)、按租户换肤。
- 但**保留可二次开发的余地**:token 化 + 接口化(配色/字体可被 fork 覆盖),呼应平台定位。
