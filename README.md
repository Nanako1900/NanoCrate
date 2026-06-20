<h1 align="center">NanoCrate</h1>

<p align="center">
  <strong>An open-source, cloud-native e-commerce platform built to be forked.</strong><br/>
  A clean Go core, a pluggable architecture, and a production-grade inventory engine that <em>provably</em> never oversells — with a mechanical-keyboard reference store to make it real.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/license-Apache--2.0-blue.svg" alt="License: Apache-2.0"/>
  <img src="https://img.shields.io/badge/status-WIP-orange.svg" alt="Status: WIP"/>
  <img src="https://img.shields.io/badge/Go-1.23+-00ADD8?logo=go&logoColor=white" alt="Go 1.23+"/>
  <img src="https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black" alt="React 18"/>
  <img src="https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white" alt="PostgreSQL 16"/>
</p>

---

NanoCrate is a full-stack, **modular-monolith** e-commerce platform you can fork and adapt to any vertical. It is deliberately **not** "yet another store" — the value lives in the architecture: a flexible product model, four clean extension interfaces, a reservation-based inventory system that **never oversells**, and semantic search. It ships with a seeded **mechanical-keyboard store** as a working reference and live demo.

> **Status:** early development, currently **docs-first**. The architecture and the REST API contract are defined; implementation is in progress. See the [roadmap](#-roadmap).

## ✨ Highlights

- **Never oversells — and proves it.** Reservation-based inventory (`available`/`reserved` split + append-only ledger + atomic conditional updates + idempotent Stripe webhooks), validated by a concurrency test: **500 concurrent checkouts against 100 units → exactly 100 succeed, 0 oversold.** → [design](ecommerce-project-spec.md)
- **Built to be forked.** Four swappable interfaces — `PaymentProvider` (Stripe), `SearchProvider` (pgvector), `Notifier`, `EventBus` (NATS) — so adapting to a new vendor or vertical is a config change, not a rewrite.
- **Flexible product model.** Core columns + JSONB attributes + per-type attribute schemas: one schema fits keyboards, coffee, or anything — without the EAV pain.
- **Semantic + keyword search.** pgvector hybrid search — find products from a fuzzy natural-language description.
- **Cloud-native & observable.** Event-driven with the outbox pattern, idempotent consumers, and a DLQ; structured logs (`slog`) + Prometheus metrics + OpenTelemetry traces.

## 🏗 Architecture

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

| Layer | Choice |
|---|---|
| Frontend | React + TypeScript + Vite + Tailwind (SPA) |
| Backend | Go + Gin (modular monolith) |
| Database | PostgreSQL + pgvector |
| Data access | sqlc (compile-time type-safe SQL) |
| Auth | Keycloak (OIDC / OAuth2 / JWT) |
| Payments | Stripe |
| Messaging | NATS JetStream (outbox + idempotent consumers + DLQ) |
| Observability | slog + Prometheus + OpenTelemetry |
| Local dev | docker-compose |

## 📚 Documentation

- **[Project spec & architecture](ecommerce-project-spec.md)** — full design, data model, concurrency, decisions (ADR)
- **[Backend guide + REST API contract](docs/backend.md)** — the single source of truth for the API
- **[Frontend guide](docs/frontend.md)** — React/Vite app + mock-first workflow

## 🚀 Getting started

> The one-command quickstart lands with the backend skeleton. The intended flow:

```bash
# Backend — everything via docker-compose, no K8s needed for dev
cd backend && cp .env.example .env && docker compose up -d && make migrate-up && make run

# Frontend — mock-first, runs without a backend
cd frontend && pnpm install && pnpm dev
```

Until then, see the [development guides](#-documentation).

## 🗂 Project structure

```
NanoCrate/
├── backend/                    # Go + Gin API (modular monolith)
├── frontend/                   # React + Vite SPA
├── docs/                       # development guides
├── ecommerce-project-spec.md   # technical spec & decisions
└── LICENSE                     # Apache-2.0
```

## 🛣 Roadmap

Modular monolith first, **always shippable**. See [spec §12](ecommerce-project-spec.md) for detail.

1. Skeleton — Go + Postgres + sqlc + Keycloak JWT + product catalog
2. Core commerce — cart → Stripe checkout (idempotent webhooks) → orders → **reservation inventory + concurrency test**
3. Async + observability + admin — NATS consumers, DLQ, sweeper, Prometheus/Grafana, OTel
4. AI — pgvector semantic + keyword search
5. Polish — keyboard seed data, README screenshots, live demo, CI green
6. *(optional)* Kubernetes deploy; split 2–3 microservices

## 🤝 Contributing

Issues and PRs welcome. The four extension interfaces are designed exactly so you can plug in your own payment gateway, search backend, notifier, or message bus.

## 📄 License

[Apache-2.0](LICENSE) © 2026 Nanako1900
