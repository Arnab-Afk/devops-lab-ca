# devops-lab-ca

A simple chat app with email sign-up, built for the DevOps lab CA:
**Horizontal Pod Autoscaling and Database Bottleneck Management in Kubernetes Under High Traffic**.

| Part | Stack |
|---|---|
| `frontend/` | Next.js 15 (App Router). Proxies `/api/*` to the backend through `BACKEND_URL` |
| `backend/` | Express, PostgreSQL (`pg`), Nodemailer (SMTP), JWT |
| Database | PostgreSQL 16 |

## How it works

1. The user enters a name and email, and the backend emails them a 6-digit code over SMTP.
2. The user enters the code, and the backend returns a JWT.
3. Chat: messages are stored in Postgres. Clients poll `GET /api/messages?after=<id>` every 2 seconds.
   The API keeps no state between requests, so any number of pods can serve it behind an HPA.

## Run locally (Docker Compose)

```bash
cp .env.example .env      # fill in the SMTP_* values and JWT_SECRET
docker compose up --build
```

- Frontend: http://localhost:3000 (override with `FRONTEND_PORT`)
- Backend: http://localhost:4000/health (override with `BACKEND_PORT`)

## Run without Docker

```bash
# backend (needs a Postgres instance)
cd backend && npm install
DATABASE_URL=postgres://chat:chat@localhost:5432/chat npm run dev

# frontend
cd frontend && npm install && BACKEND_URL=http://localhost:4000 npm run dev
```

## Tests

```bash
cd backend && npm test
```

## API

| Method | Path | Auth | Body |
|---|---|---|---|
| GET | `/health` | none | returns the pod hostname (useful when showing HPA load balancing) |
| POST | `/api/auth/request-code` | none | `{ name, email }` |
| POST | `/api/auth/verify` | none | `{ email, code }` → `{ token, user }` |
| GET | `/api/messages?after=<id>` | Bearer | none |
| POST | `/api/messages` | Bearer | `{ body }` |

## Environment variables

| Variable | Used by | Purpose |
|---|---|---|
| `DATABASE_URL` | backend | Postgres connection string |
| `DB_POOL_SIZE` | backend | connections per pod (default 10). This is the setting that causes the DB bottleneck under HPA |
| `JWT_SECRET` | backend | signs login tokens |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM` | backend | sends sign-up codes |
| `BACKEND_URL` | frontend | where `/api/*` is proxied to |
