# NanoCrate · Backend

Go + Gin **modular monolith** exposing a RESTful JSON API for NanoCrate, an open-source,
cloud-native, fork-friendly e-commerce platform. This directory is the backend only.

- Full technical plan: [`../ecommerce-project-spec.md`](../ecommerce-project-spec.md)
- Backend dev guide + **REST API contract (§9)**: [`../docs/backend.md`](../docs/backend.md)

> Phase 1 scope (this branch): project skeleton + the **product catalog vertical slice**.
> Cart / checkout / Stripe / the signature inventory-reservation system land in later phases.

## Stack

| Concern        | Choice                                             |
|----------------|----------------------------------------------------|
| Language / web | Go 1.23+ / Gin                                     |
| Database       | PostgreSQL 16 + **pgvector** (HNSW)                |
| Data access    | **sqlc** (type-safe, compile-checked) over **pgx/v5** |
| Migrations     | golang-migrate                                     |
| Auth           | Keycloak (OIDC) — backend verifies JWT only (JWKS) |
| Logging        | `log/slog` (JSON, request-id correlated)           |
| Tests          | stdlib `testing` + **testcontainers-go**           |

## Quick start

```bash
cd backend
docker compose up -d        # postgres+pgvector / keycloak / nats
make migrate-up             # schema + keyboard demo seed
make run                    # API on :8080 (auto-creates .env from .env.example)

curl localhost:8080/healthz
curl "localhost:8080/api/v1/products?type=keyboard&limit=2"
curl localhost:8080/api/v1/products/nano75
```

Prerequisites: Go 1.23+, Docker (compose v2), and the dev tools:

```bash
go install github.com/sqlc-dev/sqlc/cmd/sqlc@latest
go install -tags 'postgres' github.com/golang-migrate/migrate/v4/cmd/migrate@latest
```

## Layout

```
cmd/api/                 HTTP entrypoint, router, graceful shutdown
internal/
  domain/                pure entities + sentinel errors (no IO)
  catalog/               handler → service → repository → domain (+ dto)
    db/                  sqlc-generated code (DO NOT EDIT)
  auth/                  Keycloak JWT middleware (JWKS verify + RBAC)
  platform/              config (fail-fast env), logging (slog), db pool, web (envelope + middleware)
db/
  migrations/            golang-migrate NNNN_*.up/.down.sql
  queries/               sqlc query sources
```

Dependencies point inward only: `domain` depends on nothing; `handler → service → repository → domain`.

## API (v1)

Base path `/api/v1`; every response uses the unified envelope (see `docs/backend.md` §9):

```jsonc
{ "success": true,  "data": <payload>, "error": null, "meta": <optional> }
{ "success": false, "data": null,      "error": { "code": "...", "message": "..." } }
```

Implemented this phase:

| Method | Path                  | Auth   | Notes                                   |
|--------|-----------------------|--------|-----------------------------------------|
| GET    | `/healthz` `/readyz`  | —      | liveness / readiness (readyz pings DB)  |
| GET    | `/api/v1/product-types` | public | category templates                    |
| GET    | `/api/v1/products`    | public | `?type=&q=&page=&limit=&sort=`          |
| GET    | `/api/v1/products/:slug` | public | detail + variants + sellable qty      |
| GET    | `/api/v1/me`          | user   | RBAC stub (verified principal)          |
| GET    | `/api/v1/admin/ping`  | admin  | RBAC stub (`admin` realm role)          |

`sort` accepts `newest` (default), `price_asc`, `price_desc`, `name`. `limit` is clamped to 100.

## Make targets

```
make run | build | migrate-up | migrate-down | migrate-new name=... | sqlc
make test | test-unit | test-int | cover | lint | vet | fmt | tidy | compose-up | compose-down
```

## Schema & money

Schema authority is `db/migrations/*.up.sql` (mirrors SPEC §5). Money is always `*_cents bigint`;
status fields use string enums with `CHECK`; product/variant attributes are JSONB; `products.embedding`
is `vector(1536)` with an HNSW index, reserved for the Phase-4 semantic search.

## Testing

```bash
make test-unit   # fast, no Docker
make test        # unit + testcontainers integration (real pgvector Postgres)
make cover       # coverage profile + summary
```

Integration tests boot a `pgvector/pgvector:pg16` container, apply migrations, and exercise the
catalog endpoints end-to-end through the public handler.
