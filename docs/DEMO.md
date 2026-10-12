# Live demo runbook (~10 minutes)

**Story:** the HPA scales the app tier under high traffic, which moves the bottleneck to the database
(connection exhaustion). Connection pooling (PgBouncer) and caching (Redis) fix it.

## Before the evaluation

- [ ] EC2 instance running, `kubectl get nodes` works, `v1-direct` deployed and idle for 5+ minutes (HPA back at 2 pods)
- [ ] Browser tabs: GitHub repo, GitHub Actions, `http://<public_ip>`, AWS console (EC2 + ECR)
- [ ] 3 terminals open with `export KUBECONFIG=...`
- [ ] Backup: screen recording of a full successful run

## Terminal layout

| Terminal | Command |
|---|---|
| A: dashboard | `scripts/demo-watch.sh` (HPA, pods, CPU, Postgres connections, refreshing every 3 seconds) |
| B: load | `k6 run -e BASE_URL=http://<public_ip> -e VARIANT=v1-direct load-test/k6.js` |
| C: logs | `kubectl -n chat logs -l app=backend -f --max-log-requests 20 \| grep -i overload` |

## Script

| # | Show | Say |
|---|---|---|
| 1 | Repo: `backend/`, `frontend/`, `Dockerfile`s, `k8s/`, `.github/workflows/ci-cd.yml`, `infra/terraform` | "Everything is code: app, containers, Kubernetes manifests, pipeline and AWS infrastructure." |
| 2 | Make a small change, `git push` | |
| 3 | Actions tab: test → build/push to ECR → deploy → smoke test | "Every push is tested, containerised, pushed to Amazon ECR and deployed to Kubernetes on EC2." |
| 4 | ECR console: new image tag = commit SHA | |
| 5 | App in browser: sign up → email code → chat | "Email sign-up uses SMTP; messages are in Postgres." |
| 6 | Terminal A idle: 2 backend pods, ~0% CPU, few DB connections | "The HPA keeps 2–10 backend pods at 50% CPU." |
| 7 | **Start k6 (v1-direct)** in B | "Ramping to 500 concurrent users." |
| 8 | A: replicas 2 → 6 → 10 | "The HPA is scaling out as CPU rises." |
| 9 | A: connections hit **40/40**, then *FULL*; C: `too many clients`; k6 errors climbing | "Each pod opens up to 10 connections. 10 pods × 10 = 100, but Postgres allows 40. **Adding pods made it worse:** the database is the real bottleneck." |
| 10 | k6 summary: error rate, p95 | Write the numbers in the results table |
| 11 | Deploy the fix: *Run workflow* → `v2-pooled` (or `scripts/deploy.sh v2-pooled`) | "PgBouncer multiplexes all pods onto ≤ 25 real connections; Redis caches hot reads." |
| 12 | Wait for the HPA to return to 2 pods, run k6 again with `-e VARIANT=v2-pooled` | |
| 13 | A: still scales to 10 pods, but DB connections stay ~25 or below | |
| 14 | k6 summary: error rate ≈ 0, lower p95, high cache hit rate | Compare with v1 |
| 15 | Stop load; HPA scales down after ~1 minute | "Pods shut down gracefully and release their DB connections (SIGTERM handler)." |

## Useful one-liners

```bash
kubectl -n chat get hpa -w                         # live HPA
kubectl -n chat describe hpa backend               # scaling events
scripts/db-connections.sh                          # connections / max_connections
curl http://<public_ip>/api/stats                  # which pod answered, its DB pool usage
kubectl -n chat logs deploy/pgbouncer --tail=5        # PgBouncer prints pool stats every minute
```

## If something goes wrong

| Problem | Fix |
|---|---|
| HPA shows `<unknown>` | metrics-server not ready: `kubectl -n kube-system get pods`, wait 1 minute |
| Pods `ImagePullBackOff` | ECR token expired: re-run deploy (it refreshes the `ecr-pull` secret) |
| GitHub Actions AWS auth fails | Learner Lab session expired: update the 3 AWS secrets |
| HPA does not scale | Check `kubectl -n chat top pods`; increase VUs or `STRESS_CPU_MS` in `k8s/base/kustomization.yaml` |
