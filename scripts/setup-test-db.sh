#!/bin/bash
# Creates a test database for running integration tests.
# Run once before first test run, or after dropping the test DB.

set -e

DB_NAME="${TEST_DB_NAME:-balanzify_test}"
DB_USER="${TEST_DB_USER:-balanzify_test}"
DB_PASS="${TEST_DB_PASS:-balanzify_test_pass}"
DB_HOST="${TEST_DB_HOST:-localhost}"

echo "[setup-test-db] Creating test database: $DB_NAME"

psql -U postgres -h "$DB_HOST" << SQL
  CREATE USER $DB_USER WITH PASSWORD '$DB_PASS';
  CREATE DATABASE $DB_NAME OWNER $DB_USER;
  GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;
SQL

export DATABASE_URL="postgresql://$DB_USER:$DB_PASS@$DB_HOST:5432/$DB_NAME?schema=public"

echo "[setup-test-db] Applying Prisma schema..."
cd "$(dirname "$0")/../backend"
npx prisma migrate deploy

echo "[setup-test-db] Done."
echo ""
echo "Add this to .env.test:"
echo "TEST_DATABASE_URL=postgresql://$DB_USER:$DB_PASS@$DB_HOST:5432/$DB_NAME?schema=public"
