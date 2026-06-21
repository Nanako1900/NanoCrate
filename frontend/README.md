# NanoCrate · Frontend

A **React + TypeScript + Vite** storefront for the [NanoCrate](../README.md) platform,
built **mock-first**: the UI is developed and tested entirely against [MSW](https://mswjs.io)
mocks that mirror the backend contract, so no backend is required to run it.

> Contract source of truth: [`../docs/backend.md` §9](../docs/backend.md). UI conventions:
> [`../docs/frontend.md`](../docs/frontend.md).

## Phase 1 scope

Skeleton + product catalog (mock-first):

- Design system with CSS-custom-property tokens (`src/styles/tokens.css`) mapped onto Tailwind v4.
- Typed API client (`src/services/api.ts`) — envelope unwrapping, Zod validation, normalized
  `ApiError`, `Authorization: Bearer`, and `Idempotency-Key` on checkout. Components never `fetch`.
- MSW handlers (`src/mocks/`) mirroring `/product-types`, `/products`, `/products/:slug`, `/search`,
  with mechanical-keyboard fixtures.
- TanStack Query hooks (`useProducts`, `useProduct`, `useProductTypes`) + React Router.
- **Catalog** page: category filter, sort, and pagination driven by URL search params, with skeletons.
- **Product** page: variant picker where price and availability follow the selected variant.
- Accessibility (semantic HTML, keyboard reachable, reduced-motion) and responsive 320–1440.

## Design direction

*Industrial spec-sheet / technical editorial.* Warm paper light base (no default dark mode),
near-black warm ink, a confident **amber** brand accent plus a **steel-blue** interactive accent,
and **monospace (IBM Plex Mono)** reserved for technical data (SKUs, specs, prices). The catalog
uses a grid-breaking editorial layout rather than a uniform card grid; hover / focus / active states
are deliberately designed and animate only compositor-friendly properties.

## Prerequisites

```bash
node -v   # >= 20  (developed on 22)
corepack enable && corepack prepare pnpm@latest --activate
```

## Getting started

```bash
pnpm install
cp .env.example .env.local
pnpm dev                 # http://localhost:5173 — mock mode by default
```

Switch to a real backend in `.env.local`:

```ini
VITE_API_MODE=live
VITE_API_BASE_URL=http://localhost:8080/api/v1
```

## Scripts

| Script | Purpose |
|---|---|
| `pnpm dev` | Vite dev server (mock mode) |
| `pnpm build` | Typecheck + production build |
| `pnpm typecheck` | `tsc --noEmit` for app + config |
| `pnpm test` | Vitest unit/integration (runs against MSW) |
| `pnpm test:coverage` | Vitest with coverage |
| `pnpm test:e2e` | Playwright smoke (mock mode, deterministic) |
| `pnpm test:e2e:install` | Install the Playwright browser |
| `node scripts/generate-images.mjs` | Regenerate SVG product placeholders |

## Architecture

```
src/
  services/      api.ts (typed client) · types.ts (Zod contract) · query-client.ts · auth-token.ts
  mocks/         handlers.ts + browser/server + fixtures/  (mirror backend §9)
  hooks/         useProducts · useProduct · useCatalogParams · useReducedMotion
  components/    ui/ · layout/ · catalog/ · product/
  routes/        CatalogPage · ProductPage · NotFoundPage
  styles/        tokens.css · typography.css · global.css
```

- All catalog state (type / query / sort / page) lives in URL search params — shareable and
  back/forward friendly.
- Auth tokens are held in memory only (never `localStorage`) per the security guidance.

## Contract notes (flag for backend)

- **`/product-types` payload** is not pinned by §9; modeled from the SPEC §5 DDL (`key`, `name`)
  plus an optional `product_count` convenience.
- **`GET /products/:slug`** (§9.3) returns no `image` field; the detail page derives media from the
  slug as a documented fallback. A real implementation should add product media to the contract.
