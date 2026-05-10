#!/usr/bin/env bash
# run-db-tests.sh — CI database integration test runner
# Starts a test Postgres via docker-compose.test.yml, runs migrations,
# runs all packages with a test:db-smoke script, runs the full test suite,
# then tears the DB down regardless of outcome.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "==> Starting test database..."
docker compose -f "$ROOT_DIR/docker-compose.test.yml" up -d --wait

export DATABASE_URL="postgresql://agentfarm_test:agentfarm_test@localhost:5433/agentfarm_test"

echo "==> DATABASE_URL=${DATABASE_URL}"

echo "==> Running Prisma migrations..."
cd "$ROOT_DIR"
pnpm db:migrate:deploy

echo "==> Discovering and running db-smoke test scripts..."
EXIT_CODE=0

for pkg_json in apps/*/package.json packages/*/package.json; do
    full_path="$ROOT_DIR/$pkg_json"
    if [ -f "$full_path" ] && grep -q '"test:db-smoke"' "$full_path"; then
        pkg_name=$(node -e "const fs=require('fs'); console.log(JSON.parse(fs.readFileSync('$full_path','utf8')).name)")
        echo "  --> Running test:db-smoke for $pkg_name..."
        pnpm --filter "$pkg_name" test:db-smoke || EXIT_CODE=$?
    fi
done

echo "==> Running full test suite..."
pnpm test || EXIT_CODE=$?

echo "==> Cleaning up test database..."
docker compose -f "$ROOT_DIR/docker-compose.test.yml" down

echo "==> Done. Exit code: $EXIT_CODE"
exit $EXIT_CODE
