#!/bin/bash
# ============================================================
# Balanzify AWS Deployment Script
# Usage: ./deploy-aws.sh [api|frontend|all]
# Requires: AWS CLI, Docker, jq
# ============================================================
set -euo pipefail

TARGET="${1:-all}"
AWS_REGION="${AWS_REGION:-us-east-1}"
ENVIRONMENT="${ENVIRONMENT:-production}"

# ── Load Terraform outputs ────────────────────────────────────────────────────
TF_DIR="$(dirname "$0")/terraform/environments/$ENVIRONMENT"
echo "[deploy] Reading Terraform outputs..."
ECR_API=$(terraform -chdir="$TF_DIR" output -raw ecr_api_url 2>/dev/null || echo "")
ECR_FRONTEND=$(terraform -chdir="$TF_DIR" output -raw ecr_frontend_url 2>/dev/null || echo "")
CLUSTER=$(terraform -chdir="$TF_DIR" output -raw ecs_cluster_name 2>/dev/null || echo "")

if [ -z "$ECR_API" ]; then
  echo "ERROR: Could not read Terraform outputs. Run 'terraform apply' first."
  exit 1
fi

# ── Image tag ─────────────────────────────────────────────────────────────────
GIT_SHA=$(git rev-parse --short HEAD 2>/dev/null || echo "latest")
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
TAG="${GIT_SHA}-${TIMESTAMP}"

echo "[deploy] Tag: $TAG"
echo "[deploy] Region: $AWS_REGION"
echo "[deploy] Cluster: $CLUSTER"

# ── ECR login ─────────────────────────────────────────────────────────────────
echo "[deploy] Logging into ECR..."
aws ecr get-login-password --region "$AWS_REGION" | \
  docker login --username AWS --password-stdin "${ECR_API%%/*}"

APP_DIR="$(dirname "$0")/.."

# ── Deploy API ────────────────────────────────────────────────────────────────
deploy_api() {
  echo "[deploy] Building API image..."
  docker build -t "$ECR_API:$TAG" -t "$ECR_API:latest" \
    --platform linux/amd64 \
    -f "$APP_DIR/backend/Dockerfile" \
    "$APP_DIR/backend"

  echo "[deploy] Pushing API image..."
  docker push "$ECR_API:$TAG"
  docker push "$ECR_API:latest"

  echo "[deploy] Updating ECS API service..."
  aws ecs update-service \
    --cluster "$CLUSTER" \
    --service "balanzify-${ENVIRONMENT}-api" \
    --force-new-deployment \
    --region "$AWS_REGION" \
    --query 'service.serviceName' \
    --output text

  echo "[deploy] Waiting for API deployment to stabilize..."
  aws ecs wait services-stable \
    --cluster "$CLUSTER" \
    --services "balanzify-${ENVIRONMENT}-api" \
    --region "$AWS_REGION"

  echo "[deploy] API deployed successfully."
}

# ── Deploy Frontend ───────────────────────────────────────────────────────────
deploy_frontend() {
  echo "[deploy] Building frontend image..."
  docker build -t "$ECR_FRONTEND:$TAG" -t "$ECR_FRONTEND:latest" \
    --platform linux/amd64 \
    -f "$APP_DIR/frontend/Dockerfile" \
    "$APP_DIR/frontend"

  echo "[deploy] Pushing frontend image..."
  docker push "$ECR_FRONTEND:$TAG"
  docker push "$ECR_FRONTEND:latest"

  echo "[deploy] Updating ECS frontend service..."
  aws ecs update-service \
    --cluster "$CLUSTER" \
    --service "balanzify-${ENVIRONMENT}-frontend" \
    --force-new-deployment \
    --region "$AWS_REGION" \
    --query 'service.serviceName' \
    --output text

  echo "[deploy] Waiting for frontend deployment to stabilize..."
  aws ecs wait services-stable \
    --cluster "$CLUSTER" \
    --services "balanzify-${ENVIRONMENT}-frontend" \
    --region "$AWS_REGION"

  echo "[deploy] Frontend deployed successfully."
}

# ── Run database migrations ───────────────────────────────────────────────────
run_migrations() {
  echo "[deploy] Running database schema migrations..."
  # Run schema SQL via ECS exec (requires ECS Exec enabled on cluster)
  # Alternative: run as a one-off ECS task
  TASK_DEF=$(aws ecs describe-task-definition \
    --task-definition "balanzify-${ENVIRONMENT}-api" \
    --region "$AWS_REGION" \
    --query 'taskDefinition.taskDefinitionArn' \
    --output text)

  SUBNET=$(terraform -chdir="$TF_DIR" output -json 2>/dev/null | jq -r '.vpc.value.private_subnets[0]' 2>/dev/null || echo "")
  SG=$(aws ec2 describe-security-groups \
    --filters "Name=group-name,Values=balanzify-${ENVIRONMENT}-ecs-sg" \
    --region "$AWS_REGION" \
    --query 'SecurityGroups[0].GroupId' \
    --output text 2>/dev/null || echo "")

  if [ -n "$SUBNET" ] && [ -n "$SG" ]; then
    aws ecs run-task \
      --cluster "$CLUSTER" \
      --task-definition "$TASK_DEF" \
      --launch-type FARGATE \
      --network-configuration "awsvpcConfiguration={subnets=[$SUBNET],securityGroups=[$SG],assignPublicIp=DISABLED}" \
      --overrides '{"containerOverrides":[{"name":"api","command":["node","-e","const p=require(\"./config/database\");const fs=require(\"fs\");p.query(fs.readFileSync(\"./config/schema.sql\",\"utf8\")).then(()=>{console.log(\"Schema applied\");process.exit(0)}).catch(e=>{console.error(e);process.exit(1)})"]}]}' \
      --region "$AWS_REGION" > /dev/null
    echo "[deploy] Migration task started."
  else
    echo "[deploy] WARNING: Could not determine subnet/SG for migration task. Run schema manually if needed."
  fi
}

# ── Execute ───────────────────────────────────────────────────────────────────
case "$TARGET" in
  api)      deploy_api ;;
  frontend) deploy_frontend ;;
  all)
    run_migrations
    deploy_api
    deploy_frontend
    ;;
  *) echo "Usage: $0 [api|frontend|all]"; exit 1 ;;
esac

APP_URL=$(terraform -chdir="$TF_DIR" output -raw app_url 2>/dev/null || echo "your domain")
echo ""
echo "======================================"
echo "  Deployment complete!"
echo "  $APP_URL"
echo "======================================"
