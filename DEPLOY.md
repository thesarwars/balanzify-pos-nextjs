# Balanzify — Deployment Guide

## Prerequisites
- Docker + Docker Compose installed
- A domain pointed at your server's IP
- Ports 80 and 443 open

---

## Quick Deploy (docker-compose, single server)

### 1. Clone and configure
```bash
git clone https://github.com/your-org/balanzify.git
cd balanzify
cp backend/.env.example .env
```

Edit `.env` and fill in every `CHANGE_ME` value:
```bash
# Generate secrets
openssl rand -hex 64   # → JWT_SECRET
openssl rand -hex 32   # → DB_PASSWORD
```

### 2. SSL certificate (first run only)
```bash
# Start nginx on port 80 only to get the cert
docker-compose up -d nginx certbot
# Wait 60 seconds for certbot to issue the cert
docker-compose logs certbot
```

### 3. Start everything
```bash
docker-compose up -d
docker-compose logs -f api   # watch for "Balanzify v2 running on port 5000"
```

The API container runs `prisma migrate deploy` automatically on start.
On a fresh database this applies the baseline migration.
On an existing database it is idempotent.

### 4. Verify
```bash
curl https://yourdomain.com/health      # → {"status":"ok"}
curl https://yourdomain.com/ready       # → {"status":"ready","database":"connected"}
```

---

## Cloud Deploy (AWS ECS + RDS)

### Prerequisites
- AWS CLI configured
- Terraform installed
- RDS PostgreSQL 16 instance running

### 1. Apply infrastructure
```bash
cd infrastructure/terraform/environments/production
cp terraform.tfvars.example terraform.tfvars
# Fill in terraform.tfvars
terraform init && terraform apply
```

### 2. Set secrets in AWS SSM Parameter Store
```bash
aws ssm put-parameter --name /balanzify/prod/JWT_SECRET --value "$(openssl rand -hex 64)" --type SecureString
aws ssm put-parameter --name /balanzify/prod/DB_PASSWORD --value "$(openssl rand -hex 32)" --type SecureString
aws ssm put-parameter --name /balanzify/prod/DATABASE_URL \
  --value "postgresql://balanzify:PASSWORD@your-rds-endpoint:5432/balanzify?schema=public" \
  --type SecureString
```

### 3. Bootstrap the database (first deploy only)
```bash
# From a bastion host or via RDS Query Editor
psql $DATABASE_URL < backend/config/schema.sql

# Then mark the baseline migration as applied so migrate deploy doesn't try to re-run it
DATABASE_URL=$DATABASE_URL npx prisma migrate resolve --applied 0001_initial
```

### 4. Deploy
```bash
./scripts/deploy-aws.sh all
```

---

## Database migrations (ongoing)

After the initial deploy, all schema changes go through Prisma migrations:

```bash
# Create a new migration (development)
cd backend
npx prisma migrate dev --name describe_your_change

# Apply in production (runs automatically on container start)
npx prisma migrate deploy
```

---

## Rollback
```bash
# docker-compose
docker-compose down
docker tag balanzify-api:previous balanzify-api:latest
docker-compose up -d

# ECS
aws ecs update-service --cluster balanzify-prod --service api --task-definition balanzify-api:PREVIOUS_REVISION
```

---

## Environment variables reference

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ | Full Prisma connection string |
| `JWT_SECRET` | ✅ | Min 64 chars — `openssl rand -hex 64` |
| `DB_PASSWORD` | ✅ | Postgres password |
| `FRONTEND_URL` | ✅ | Full URL of frontend (for CORS) |
| `DOMAIN` | ✅ | Domain for Nginx/SSL |
| `REDIS_URL` | ⚠️ | Required for multi-instance; falls back to memory |
| `SMTP_HOST` + `SMTP_USER` + `SMTP_PASS` | ⚠️ | Email delivery — receipts, alerts, resets |
| `S3_BUCKET` | ⚠️ | Product image uploads |
| `AWS_REGION` | ⚠️ | Required if using S3 or SES |
| `EMAIL_FROM` | ⚠️ | From address for outbound email |

---

## Health checks

| Endpoint | Purpose |
|----------|---------|
| `GET /health` | Liveness — always returns 200 if process is running |
| `GET /ready` | Readiness — checks database connection |
| `GET /metrics` | Prometheus metrics (blocked externally by Nginx) |
