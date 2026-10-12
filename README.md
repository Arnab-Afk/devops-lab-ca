# devops-lab-ca

**Horizontal Pod Autoscaling and Database Bottleneck Management in Kubernetes Under High Traffic**

A chat app with email sign-up (Next.js + Express + PostgreSQL), delivered through a full DevOps pipeline:
GitHub → GitHub Actions (test, build) → Docker images in **Amazon ECR** → **Kubernetes (k3s) on Amazon EC2**,
with infrastructure as code in Terraform. Under load, the HPA scales the backend, which makes the database the bottleneck.
Connection pooling and caching fix it.

```
                 ┌────────────── Kubernetes (k3s on EC2) ───────────────┐
 users / k6 ──►  │ Ingress ─► frontend (Next.js)                          │
                 │        └─► backend (Express) ×2..10  ◄── HPA (CPU 50%) │
                 │               │                                       │
                 │   v1-direct:  └──────────────► PostgreSQL (max 40 conns)
                 │   v2-pooled:  ├─► PgBouncer ──► PostgreSQL (≤25 conns) │
                 │               └─► Redis cache                         │
                 └────────────────────────────────────────────────────────┘
```

| Rubric item | Where |
|---|---|
| Version control | this repo |
| Application build | `frontend/` (Next.js), `backend/` (Express) |
| Automated testing | `backend/tests` (Jest + Supertest), k6 smoke test in the pipeline |
| Containerization | `backend/Dockerfile`, `frontend/Dockerfile`, `docker-compose.yml` |
| CI/CD | `.github/workflows/ci-cd.yml` |
| Deployment | `k8s/` (Kustomize), `scripts/deploy.sh`, `infra/terraform` (AWS) |
| HPA + DB bottleneck | `k8s/base/hpa.yaml`, `k8s/overlays/v1-direct` vs `k8s/overlays/v2-pooled`, `load-test/k6.js` |

## Docs

- [docs/AWS-SETUP.md](docs/AWS-SETUP.md): create the AWS infrastructure and connect the pipeline
- [docs/DEMO.md](docs/DEMO.md): step-by-step live demo script
- [docs/REPORT.md](docs/REPORT.md): project report with results and the AWS/Azure comparison

## Repository layout

```
backend/              Express API: email OTP sign-up (SMTP), JWT, chat, /api/stress load endpoint
frontend/             Next.js chat UI
k8s/base/             namespace, Postgres, backend, frontend, HPA, ingress, config
k8s/overlays/
  v1-direct/          backend → Postgres directly (shows the bottleneck)
  v2-pooled/          backend → PgBouncer → Postgres, plus Redis cache (the fix)
load-test/k6.js       ramps to 500 virtual users, prints a results table
scripts/              deploy.sh, create-secrets.sh, demo-watch.sh, db-connections.sh
infra/terraform/      EC2 + k3s, ECR, Elastic IP, security group, optional RDS
.github/workflows/    CI/CD pipeline
```

## Run locally (Docker Compose)

```bash
cp .env.example .env      # fill in SMTP_* and JWT_SECRET
docker compose up --build
```

Frontend http://localhost:3000, backend http://localhost:4000/health (override with `FRONTEND_PORT` / `BACKEND_PORT`).

## Tests

```bash
cd backend && npm test
```

## API

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/health` | none | liveness/readiness, returns the pod name |
| GET | `/api/stats` | none | pod name and its DB pool usage |
| GET | `/api/stress` | none | load-test endpoint: CPU work and a slow DB read (cached in Redis in v2) |
| POST | `/api/auth/request-code` | none | `{ name, email }`: emails a 6-digit code |
| POST | `/api/auth/verify` | none | `{ email, code }` → `{ token, user }` |
| GET | `/api/messages?after=<id>` | Bearer | new messages (clients poll every 2s, so any pod can answer) |
| POST | `/api/messages` | Bearer | `{ body }` |

## Configuration (`k8s/base/kustomization.yaml`)

| Key | Default | Meaning |
|---|---|---|
| `DB_POOL_SIZE` | 10 | connections per backend pod (pods × this = DB connections in v1) |
| `DB_HOST` | `postgres` / `pgbouncer` | set by the overlay |
| `REDIS_URL` | empty / `redis://redis:6379` | enables the cache in v2 |
| `STRESS_CPU_MS` | 20 | CPU work per `/api/stress` request |
| `STRESS_DB_DELAY_S` | 0.05 | simulated slow query |
