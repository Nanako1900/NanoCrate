# NanoCrate · Backend

Go + Gin **modular monolith** (+ a worker) exposing a RESTful JSON API for NanoCrate, an
open-source, cloud-native, fork-friendly e-commerce platform with a seeded mechanical-keyboard
reference store. This directory is the backend only.

- Full technical plan: [`../ecommerce-project-spec.md`](../ecommerce-project-spec.md)
- Backend dev guide + **REST API contract (§9)**: [`../docs/backend.md`](../docs/backend.md)

## Stack

| Concern        | Choice                                                            |
|----------------|------------------------------------------------------------------|
| Language / web | Go 1.26 / Gin                                                    |
| Database       | PostgreSQL 16 + **pgvector** (HNSW) + full-text (`tsvector`/GIN) |
| Data access    | **sqlc** (type-safe, compile-checked) over **pgx/v5**            |
| Migrations     | golang-migrate                                                   |
| Auth           | Keycloak (OIDC) — backend verifies JWT only (JWKS) + RBAC        |
| Payments       | Stripe (webhook-authoritative) behind a `PaymentProvider` port   |
| Messaging      | **NATS JetStream** behind an `EventBus` port + transactional outbox |
| Search / AI    | semantic (pgvector) + keyword (tsvector) **hybrid, RRF-fused** behind a `SearchProvider` port |
| Observability  | `log/slog` (JSON, request_id + trace_id) · Prometheus · OpenTelemetry → Jaeger |
| Tests          | stdlib `testing` + **testcontainers-go** (real pg16/NATS)        |

## Architecture

Two binaries over one Postgres + NATS:

- **`cmd/api`** — synchronous HTTP: catalog, cart, checkout saga, orders, admin, search.
- **`cmd/worker`** — asynchronous: outbox relay → NATS, idempotent consumers (order-confirmation
  email, search indexing) with retry → DLQ, the reservation sweeper, and the abandoned-order sweeper.
- **`cmd/backfill`** — one-shot: (re)compute product embeddings.

Fork-friendliness lives in **four ports** (SPEC §6), each with a default implementation you can
swap: `PaymentProvider` (Stripe), `SearchProvider` (pgvector), `Notifier` (log/SMTP), `EventBus` (NATS).

## Key engineering decisions

- **No oversell under concurrency (the signature).** Reservation model: `available`/`reserved`
  double-count + a `held → committed/released/expired` state machine + an append-only `stock_ledger`.
  Reservation is a single atomic conditional `UPDATE ... WHERE available >= qty` (RowsAffected==1 or
  out-of-stock) — correct under READ COMMITTED with no explicit locks; a `CHECK (available >= 0)`
  backstops. Proven by a concurrency test (500 goroutines vs 100 stock → exactly 100 succeed; ledger
  reconciles) and a sweeper-vs-webhook race test (only one terminal transition wins), both `-race` clean.
- **Stripe checkout saga, webhook-authoritative + idempotent.** Reserve every line + create the order
  in one transaction; settle only on the signature-verified webhook, deduped (recorded only after the
  order is visible so an early webhook isn't dropped), with the cart converted atomically.
- **Reliable events via transactional Outbox.** Business code writes an `outbox` row in its
  transaction; the relay publishes to NATS (at-least-once; JetStream dedups on the row id); consumers
  are idempotent (`consumed_events`), retried N times, then dead-lettered (`dead_letters`) with metrics.
- **Hybrid semantic + keyword search.** pgvector cosine kNN (`embedding <=>`) + Postgres full-text
  (`ts_rank`) fused with Reciprocal Rank Fusion. Embeddings come from a configurable `Embedder`: an
  OpenAI `text-embedding-3-small` impl or a deterministic offline stub (no API key needed for dev/test).
  Indexing is async (a `ProductUpserted` outbox event drives the worker's indexer).
- **Observability wired to the hot paths.** Structured logs carry `request_id` + `trace_id`; Prometheus
  exposes RED-ish business metrics (inventory conflicts, checkout failures, orders paid, event consume
  failures, DLQ depth); OpenTelemetry threads one trace from the HTTP request through the async
  `relay.publish → consume` legs (the producer's traceparent is persisted on the outbox row).

## Quick start (full stack)

```bash
cd backend
cp .env.example .env
docker compose up -d                 # postgres+pgvector / keycloak / nats / jaeger / prometheus / grafana
make migrate-up                      # schema + keyboard demo seed
make backfill                        # compute embeddings for the seed (stub by default)
make run                             # API on :8080
make worker                          # (separate shell) relay + consumers + sweepers + search indexer

# catalog
curl "localhost:8080/api/v1/products?type=keyboard&limit=2"
# hybrid search — fuzzy natural language
curl -s -X POST localhost:8080/api/v1/search -H 'Content-Type: application/json' \
  -d '{"query":"a quiet full size keyboard for the office","limit":5}'
```

Dev tools: `go install github.com/sqlc-dev/sqlc/cmd/sqlc@latest`,
`go install -tags 'postgres' github.com/golang-migrate/migrate/v4/cmd/migrate@latest`,
`go install honnef.co/go/tools/cmd/staticcheck@latest`.

## Layout

```
cmd/{api,worker,backfill}/      entrypoints
internal/
  domain/                       pure entities + sentinel errors
  catalog/ cart/ checkout/ order/ inventory/   commerce domains (handler→service→repo→domain)
  admin/                        admin API + dynamic attribute validation
  search/                       SearchProvider (pgvector hybrid) + Embedder (stub/OpenAI)
  events/                       EventBus (NATS/in-memory) + outbox relay + idempotent consumer + DLQ
  notify/                       Notifier (log/SMTP)
  payment/                      PaymentProvider (Stripe/fake)
  auth/                         Keycloak JWT verify + RBAC
  platform/                     config, logging (slog+trace), db pool, observability (OTel), metrics, web
db/{migrations,queries}/        golang-migrate sources + sqlc query sources
deploy/                         prometheus.yml + grafana provisioning
```

## API (v1)

Unified envelope; see [`docs/backend.md` §9](../docs/backend.md) for the full contract (§9.1 conventions,
§9.2 endpoints + §9.2.1 CORS, §9.3 search, §9.4 cart/order, §9.5 admin). Highlights: public catalog +
`POST /search`; session cart; user `POST /checkout` + orders; signature-verified `POST /webhooks/stripe`;
admin `/admin/*` (RBAC, dynamic attribute validation, stock ledger).

## Observability

`docker compose up` brings up the full stack; with the API/worker running locally:

- **Jaeger** UI → http://localhost:16686 (service `nanocrate-api` / `nanocrate-worker`): one connected
  trace spans the HTTP request and the async `relay.publish → consume` legs.
- **Prometheus** → http://localhost:9090 (scrapes API `:8080` and worker `:9091`).
- **Grafana** → http://localhost:3001 (Prometheus + Jaeger datasources auto-provisioned).

Capture README screenshots from those URLs after running the end-to-end flow (cart → checkout →
webhook); place them under `../docs/screenshots/`.

## Make targets

```
make run | worker | backfill | build | migrate-up | migrate-down | migrate-new name=... | sqlc
make test | test-unit | test-int | cover | lint | vet | fmt | tidy | compose-up | compose-down
```

## Testing

```bash
make test-unit   # fast, no Docker
make test        # unit + testcontainers integration (real pgvector Postgres + NATS)
```

Concurrency, idempotency, and retrieval are TDD'd: the oversell concurrency test, the
sweeper-vs-webhook race, webhook idempotency, consumer dedup/DLQ, and hybrid-search ranking/recall all
run against real containers. CI (GitHub Actions) runs build + vet + gofmt + staticcheck + sqlc-clean +
the full test suite on every backend change.
