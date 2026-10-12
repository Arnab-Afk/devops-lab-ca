# AWS setup (one time, ~20 minutes)

What gets created:

| AWS service | Used for |
|---|---|
| **ECR** (`chat-backend`, `chat-frontend`) | Docker image registry the pipeline pushes to |
| **EC2** t3.xlarge + Elastic IP | Single-node **k3s** Kubernetes cluster (includes metrics-server, Traefik ingress, storage) |
| **Security group** | 80 (app), 22 (SSH), 6443 (Kubernetes API) |
| **RDS PostgreSQL** *(optional)* | Managed database with `max_connections=40` |

Cost: about $0.17/hour for EC2 (+ $0.02/hour for RDS). **Stop the instance after the demo** or run `terraform destroy`.

## 0. Tools on your laptop

- AWS CLI v2, Terraform ≥ 1.5, kubectl, [kustomize](https://kubectl.docs.kubernetes.io/installation/kustomize/), [k6](https://grafana.com/docs/k6/latest/set-up/install-k6/)
- AWS credentials: `aws configure`
  - **AWS Academy Learner Lab:** open *AWS Details* → copy the credentials into `~/.aws/credentials`
    (they include `aws_session_token` and expire after ~4 hours). Use region `us-east-1` and key pair `vockey`
    (download `labsuser.pem` from *AWS Details*).

## 1. Create the infrastructure (Terraform)

```bash
cd infra/terraform
cp terraform.tfvars.example terraform.tfvars   # set key_name (and create_rds = true if you want RDS)
terraform init
terraform apply
```

Wait ~2 minutes after `apply` for k3s to finish installing, then:

```bash
terraform output                                  # public_ip, app_url, ecr_registry, ...
scp -i labsuser.pem ubuntu@<public_ip>:kubeconfig ../../kubeconfig
export KUBECONFIG=$PWD/../../kubeconfig
kubectl get nodes                                 # 1 node, Ready
kubectl top nodes                                 # metrics-server works (needed by the HPA)
```

## 2. GitHub Actions secrets and variables

Repo → *Settings* → *Secrets and variables* → *Actions*.

**Secrets**

| Name | Value |
|---|---|
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | your AWS credentials |
| `AWS_SESSION_TOKEN` | Learner Lab only (update it each lab session) |
| `KUBECONFIG_B64` | output of `base64 -w0 kubeconfig` |
| `POSTGRES_PASSWORD` | any strong password (with RDS: `terraform output -raw rds_password`) |
| `JWT_SECRET` | `openssl rand -hex 32` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM` | from your `.env` |

**Variables**

| Name | Value |
|---|---|
| `AWS_REGION` | e.g. `us-east-1` |
| `APP_URL` | `terraform output -raw app_url` (enables the smoke test step) |
| `DEPLOY_VARIANT` | `v1-direct` or `v2-pooled` (default `v2-pooled`) |
| `RDS_ENDPOINT` | only if `create_rds = true`: `terraform output -raw rds_endpoint` |

## 3. First deployment

Push to `main` (or *Actions* → *CI/CD* → *Run workflow* and pick the variant). The pipeline:

1. **Test & build**: backend unit tests, frontend production build, manifest validation
2. **Docker build & push**: images tagged with the commit SHA pushed to ECR
3. **Deploy**: refreshes the ECR pull secret, applies `k8s/overlays/<variant>`, waits for rollout
4. **Smoke test**: `/health` check plus a 30-second k6 run, results uploaded as an artifact

Open `http://<public_ip>`: sign up with your email, get the code, chat.

## Deploying by hand (without the pipeline)

```bash
export KUBECONFIG=$PWD/kubeconfig
REG=$(cd infra/terraform && terraform output -raw ecr_registry)
aws ecr get-login-password | docker login --username AWS --password-stdin $REG
docker build -t $REG/chat-backend:manual backend  && docker push $REG/chat-backend:manual
docker build -t $REG/chat-frontend:manual frontend && docker push $REG/chat-frontend:manual

scripts/create-secrets.sh                      # reads .env
ECR_REGISTRY=$REG BACKEND_IMAGE=$REG/chat-backend:manual FRONTEND_IMAGE=$REG/chat-frontend:manual \
  scripts/deploy.sh v1-direct                  # or v2-pooled
# with RDS add: RDS_ENDPOINT=$(cd infra/terraform && terraform output -raw rds_endpoint)
```

## Using Amazon RDS instead of in-cluster Postgres

Set `create_rds = true`, re-run `terraform apply`, then set the `RDS_ENDPOINT` variable and use the RDS password as
`POSTGRES_PASSWORD`. `deploy.sh` points the backend (v1) or PgBouncer (v2) at RDS. Watch connections in
CloudWatch → RDS → `DatabaseConnections`. In the report, mention **RDS Proxy** as AWS's managed equivalent of PgBouncer.

## Alternative: Amazon EKS

The same manifests work on EKS. Differences:

```bash
eksctl create cluster --name devops-chat --region us-east-1 --nodes 2 --node-type t3.large
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
helm install ingress-nginx ingress-nginx/ingress-nginx -n ingress-nginx --create-namespace \
  --set controller.ingressClassResource.default=true
kubectl apply -f https://raw.githubusercontent.com/rancher/local-path-provisioner/v0.0.31/deploy/local-path-storage.yaml  # or use the EBS CSI driver
```

Use the ingress-nginx LoadBalancer hostname as `APP_URL`. EKS costs more (~$0.10/hour control plane + nodes) and
takes ~15 minutes to create.

## Clean up

```bash
cd infra/terraform && terraform destroy
```
