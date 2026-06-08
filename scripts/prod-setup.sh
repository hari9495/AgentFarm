#!/usr/bin/env bash
# =============================================================================
# AgentFarm — Production Setup Script
# =============================================================================
# Run this ONCE on first deployment, before starting any services.
#
# Usage:
#   chmod +x scripts/prod-setup.sh
#   ./scripts/prod-setup.sh
#
# What it does:
#   1. Checks all required tools are installed
#   2. Generates all HMAC / encryption secrets (prints them — save immediately)
#   3. Verifies DATABASE_URL is reachable
#   4. Enables pgvector extension on the production database
#   5. Runs Prisma migrations
#   6. Validates NODE_ENV and API_REQUIRE_AUTH are set correctly
# =============================================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

info()    { echo -e "${CYAN}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

echo ""
echo "=============================================="
echo "  AgentFarm — Production Setup"
echo "=============================================="
echo ""

# -----------------------------------------------------------------------------
# 1. Tool checks
# -----------------------------------------------------------------------------
info "Checking required tools..."

command -v openssl  >/dev/null 2>&1 || error "openssl is required but not installed."
command -v psql     >/dev/null 2>&1 || error "psql is required but not installed (postgresql-client)."
command -v node     >/dev/null 2>&1 || error "node is required but not installed."
command -v pnpm     >/dev/null 2>&1 || error "pnpm is required. Install: npm i -g pnpm"

success "All required tools found."
echo ""

# -----------------------------------------------------------------------------
# 2. Secret generation
# -----------------------------------------------------------------------------
info "Generating production secrets..."
echo ""
echo -e "${YELLOW}IMPORTANT: Copy these values into your .env file now.${NC}"
echo -e "${YELLOW}They will NOT be shown again.${NC}"
echo ""

generate_secret() {
  openssl rand -base64 32
}

generate_hex_secret() {
  openssl rand -hex 32
}

echo "# ---- Paste the following into your .env ----"
echo ""
echo "API_SESSION_SECRET=$(generate_secret)"
echo "FIELD_ENCRYPTION_KEY=$(generate_secret)"
echo "MFA_ENCRYPTION_KEY=$(generate_secret)"
echo ""
echo "RUNTIME_SERVICE_TOKEN=$(generate_secret)"
echo "APPROVAL_INTAKE_SHARED_TOKEN=$(generate_secret)"
echo "RUNTIME_DECISION_SHARED_TOKEN=$(generate_secret)"
echo "CONNECTOR_EXEC_SHARED_TOKEN=$(generate_secret)"
echo "RUNTIME_DISPATCH_SHARED_TOKEN=$(generate_secret)"
echo "RUNTIME_TASK_SHARED_TOKEN=$(generate_secret)"
echo "PASSWORDLESS_LOGIN_SHARED_TOKEN=$(generate_secret)"
echo "SSE_INTERNAL_TOKEN=$(generate_secret)"
echo "EVIDENCE_SERVICE_TOKEN=$(generate_secret)"
echo "MEETING_SERVICE_TOKEN=$(generate_secret)"
echo "OPS_MONITORING_TOKEN=$(generate_secret)"
echo "DASHBOARD_API_TOKEN=$(generate_secret)"
echo "AGENT_RUNTIME_TOKEN=$(generate_secret)"
echo "MEETING_AGENT_TOKEN=$(generate_secret)"
echo ""
echo "WEBHOOK_INGEST_SECRET=$(generate_secret)"
echo "SLACK_WEBHOOK_SECRET=$(generate_secret)"
echo "TEAMS_WEBHOOK_SECRET=$(generate_secret)"
echo "MEMORY_WEBHOOK_SECRET=$(generate_secret)"
echo "ZOHO_SIGN_WEBHOOK_TOKEN=$(generate_secret)"
echo "BOOKING_WEBHOOK_SECRET=$(generate_secret)"
echo "CONTRACT_WEBHOOK_SECRET=$(generate_secret)"
echo "CALLS_WEBHOOK_SECRET=$(generate_secret)"
echo "WEBHOOK_HMAC_SECRET=$(generate_secret)"
echo "WIN_NOTIFICATION_SECRET=$(generate_secret)"
echo ""
echo "# ---- End of generated secrets ----"
echo ""

read -rp "Press ENTER once you have saved all secrets above to your .env file..."

# -----------------------------------------------------------------------------
# 3. Load .env and validate critical vars
# -----------------------------------------------------------------------------
if [ ! -f .env ]; then
  error ".env file not found. Copy .env.production.example to .env and fill it in first."
fi

# shellcheck disable=SC1091
set -o allexport
source .env
set +o allexport

info "Validating critical environment variables..."

MISSING=()

[ -z "${DATABASE_URL:-}" ]        && MISSING+=("DATABASE_URL")
[ -z "${REDIS_URL:-}" ]           && MISSING+=("REDIS_URL")
[ -z "${API_SESSION_SECRET:-}" ]  && MISSING+=("API_SESSION_SECRET")
[ -z "${FIELD_ENCRYPTION_KEY:-}" ] && MISSING+=("FIELD_ENCRYPTION_KEY")
[ -z "${MFA_ENCRYPTION_KEY:-}" ]  && MISSING+=("MFA_ENCRYPTION_KEY")
[ -z "${ALLOWED_ORIGINS:-}" ]     && MISSING+=("ALLOWED_ORIGINS")
[ -z "${APPROVAL_INTAKE_SHARED_TOKEN:-}" ] && MISSING+=("APPROVAL_INTAKE_SHARED_TOKEN")
[ -z "${RUNTIME_DECISION_SHARED_TOKEN:-}" ] && MISSING+=("RUNTIME_DECISION_SHARED_TOKEN")
[ -z "${RUNTIME_DISPATCH_SHARED_TOKEN:-}" ] && MISSING+=("RUNTIME_DISPATCH_SHARED_TOKEN")
[ -z "${RUNTIME_TASK_SHARED_TOKEN:-}" ]     && MISSING+=("RUNTIME_TASK_SHARED_TOKEN")

if [ "${#MISSING[@]}" -gt 0 ]; then
  error "Missing required env vars: ${MISSING[*]}"
fi

if [ "${NODE_ENV:-}" != "production" ]; then
  error "NODE_ENV must be 'production'. Got: '${NODE_ENV:-}'"
fi

if [ "${API_REQUIRE_AUTH:-}" != "true" ]; then
  error "API_REQUIRE_AUTH must be 'true' in production."
fi

# Warn if any secret still contains placeholder text
if grep -q "<REQUIRED\|<GENERATE\|your-secret-here" .env 2>/dev/null; then
  warn "Your .env still contains placeholder values (<REQUIRED>, <GENERATE>, or 'your-secret-here')."
  warn "Search and replace all placeholders before going live."
fi

success "Environment variables look good."
echo ""

# -----------------------------------------------------------------------------
# 4. Database connectivity check
# -----------------------------------------------------------------------------
info "Testing database connection..."

DB_URL="${DATABASE_URL}"
if psql "${DB_URL}" -c "SELECT 1" >/dev/null 2>&1; then
  success "Database is reachable."
else
  error "Cannot connect to database: ${DB_URL}"
fi
echo ""

# -----------------------------------------------------------------------------
# 5. Enable pgvector extension
# -----------------------------------------------------------------------------
info "Enabling pgvector extension (required for all 15 RAG agents)..."

psql "${DB_URL}" -c "CREATE EXTENSION IF NOT EXISTS vector;" >/dev/null 2>&1 \
  && success "pgvector extension is enabled." \
  || error "Failed to enable pgvector. Make sure your Postgres server has the pgvector package installed."

# Also ensure uuid-ossp and pg_trgm which Prisma migrations depend on
psql "${DB_URL}" -c "CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";" >/dev/null 2>&1 || true
psql "${DB_URL}" -c "CREATE EXTENSION IF NOT EXISTS pg_trgm;" >/dev/null 2>&1 || true

success "All Postgres extensions enabled."
echo ""

# -----------------------------------------------------------------------------
# 6. Generate Prisma client
# -----------------------------------------------------------------------------
info "Generating Prisma client..."
pnpm --filter @agentfarm/db-schema exec prisma generate >/dev/null 2>&1 \
  && success "Prisma client generated." \
  || error "Prisma generate failed. Check db-schema package."
echo ""

# -----------------------------------------------------------------------------
# 7. Run database migrations
# -----------------------------------------------------------------------------
info "Running Prisma migrations..."
pnpm db:migrate:deploy \
  && success "Database migrations applied." \
  || error "Migration failed. Check DATABASE_URL and Prisma schema."
echo ""

# -----------------------------------------------------------------------------
# 8. Encrypt existing sensitive fields (if FIELD_ENCRYPTION_KEY is newly set)
# -----------------------------------------------------------------------------
if [ -f "scripts/migrate-encrypt-fields.ts" ]; then
  info "Running field encryption migration..."
  pnpm tsx scripts/migrate-encrypt-fields.ts \
    && success "Field encryption migration complete." \
    || warn "Field encryption migration failed or had no rows to process."
  echo ""
fi

# -----------------------------------------------------------------------------
# 9. Final summary
# -----------------------------------------------------------------------------
echo ""
echo "=============================================="
echo -e "  ${GREEN}Production setup complete!${NC}"
echo "=============================================="
echo ""
echo "Next steps:"
echo "  1. Start services:         docker compose up -d"
echo "  2. Check health endpoints: curl https://api.agentfarms.in/health"
echo "  3. Set up Cloudflare Tunnel (run: scripts/cloudflare-tunnel-setup.sh)"
echo "  4. Deploy website worker:  pnpm wrangler deploy --env production"
echo ""
