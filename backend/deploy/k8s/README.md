# NanoCrate · Kubernetes manifests

Reference manifests (kustomize) for the full backend stack: Postgres+pgvector,
NATS (JetStream), Keycloak, Jaeger/Prometheus/Grafana, the **api** Deployment, and
the **worker** Deployment, with a migrate **Job**. One image (`../../Dockerfile`)
carries all binaries; Deployments/Job select one via `command`.

## Build & load the image

```bash
# from backend/
docker build -t nanocrate-backend:latest .
# push to your registry, or load into a local cluster, e.g. kind:
kind load docker-image nanocrate-backend:latest
```

## Deploy

```bash
kubectl apply -k deploy/k8s          # creates the nanocrate namespace + all resources
kubectl -n nanocrate wait --for=condition=complete job/nanocrate-migrate --timeout=120s
kubectl -n nanocrate rollout status deploy/nanocrate-api
# optional: seed embeddings
kubectl -n nanocrate run backfill --image=nanocrate-backend:latest --restart=Never \
  --env-from=... --command -- /app/backfill
```

Edit `10-config.yaml` (`nanocrate-secrets`) before applying — supply real
`DATABASE_URL` / Stripe / OpenAI values via a sealed-secret, external-secrets, or
your CI, never committed.

## Not included (deliberately, environment-dependent)

- **Ingress / TLS** (cluster-specific; add an Ingress or Gateway for `nanocrate-api`).
- **CD pipeline & a live deploy + Grafana/Jaeger screenshots** — these require a real
  cluster and registry credentials, which aren't available in this dev environment.
  The manifests are validated structurally (`kubectl kustomize`/`kubeconform`) and the
  same topology runs under `docker compose` locally.
- HPA, NetworkPolicies, PodDisruptionBudgets, and a managed/HA Postgres — production
  hardening left as follow-ups.
