#!/bin/bash
set -e
echo "======================================"
echo "  Balanzify Enterprise Deploy"
echo "======================================"

APP_DIR="/opt/balanzify"

# Check .env exists
if [ ! -f "$APP_DIR/.env" ]; then
  echo "ERROR: $APP_DIR/.env not found."
  echo "Copy .env.template to $APP_DIR/.env and fill in JWT_SECRET, DB_PASSWORD, DOMAIN"
  exit 1
fi

source "$APP_DIR/.env"

if [ -z "$JWT_SECRET" ] || [ -z "$DB_PASSWORD" ] || [ -z "$DOMAIN" ]; then
  echo "ERROR: JWT_SECRET, DB_PASSWORD, and DOMAIN must be set in .env"
  exit 1
fi

echo "[1/5] Pulling latest images..."
cd "$APP_DIR"
docker-compose pull --quiet

echo "[2/5] Building app containers..."
docker-compose build --quiet

echo "[3/5] Starting services..."
docker-compose up -d --remove-orphans

echo "[4/5] Waiting for health checks..."
sleep 10
docker-compose ps

echo "[5/5] Done!"
echo ""
echo "App running at http://$DOMAIN (HTTP — redirects to HTTPS after cert)"
echo ""
echo "To provision SSL certificate (first deploy only):"
echo "  docker-compose exec certbot certbot certonly \\"
echo "    --webroot --webroot-path=/var/www/certbot \\"
echo "    --email your@email.com --agree-tos --no-eff-email \\"
echo "    -d $DOMAIN"
echo ""
echo "Then reload Nginx:"
echo "  docker-compose exec nginx nginx -s reload"
echo ""
echo "Useful commands:"
echo "  docker-compose logs -f api       # API logs"
echo "  docker-compose logs -f nginx     # Nginx logs"
echo "  docker-compose exec api node -e 'require(\"./config/database\").query(\"SELECT 1\").then(()=>console.log(\"DB OK\"))'"
