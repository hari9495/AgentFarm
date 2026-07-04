#!/usr/bin/env bash
# =============================================================================
# db-restore-drill.sh — automated, non-interactive proof that backups restore
# =============================================================================
# A backup that has never been restored is a hope, not a backup. This drill:
#   1. picks the newest dump in LOCAL_BACKUP_DIR (or takes --file <dump>),
#   2. restores it into a FRESH scratch database (never the real one),
#   3. sanity-checks the result (table count, Tenant table readable),
#   4. drops the scratch database again.
#
# Safe to run on a schedule or in CI: it never touches the source database
# and requires no interactive confirmation.
#
# Usage:
#   ./scripts/db-restore-drill.sh                    # newest dump in LOCAL_BACKUP_DIR
#   ./scripts/db-restore-drill.sh --file /path/x.dump
#
# Required environment variables:
#   DATABASE_URL          — connection string to the Postgres SERVER (any db);
#                           the drill creates/drops its own scratch database.
# Optional:
#   LOCAL_BACKUP_DIR      — where dumps live (default: /var/backups/agentfarm)
#   DRILL_MIN_TABLES      — minimum restored table count to pass (default: 50)
#
# Exit codes:
#   0 — drill passed (dump restores cleanly and passes sanity checks)
#   1 — missing variable / no dump found
#   2 — scratch database could not be created
#   3 — pg_restore failed
#   4 — sanity checks failed
# =============================================================================

set -euo pipefail

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] [drill] $*"; }
err() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] [drill] ERROR: $*" >&2; }
die() { err "$*"; exit "${2:-1}"; }

: "${DATABASE_URL:?DATABASE_URL is required}"
LOCAL_BACKUP_DIR="${LOCAL_BACKUP_DIR:-/var/backups/agentfarm}"
DRILL_MIN_TABLES="${DRILL_MIN_TABLES:-50}"

# ---------------------------------------------------------------------------
# Locate the dump to drill against
# ---------------------------------------------------------------------------
DUMP_FILE=""
if [[ "${1:-}" == "--file" ]]; then
  DUMP_FILE="${2:?--file requires a path}"
else
  DUMP_FILE=$(ls -1t "$LOCAL_BACKUP_DIR"/agentfarm_*.dump 2>/dev/null | head -1 || true)
fi
[[ -n "$DUMP_FILE" && -f "$DUMP_FILE" ]] || die "No dump found (dir: $LOCAL_BACKUP_DIR). Run db-backup.sh first."

# ---------------------------------------------------------------------------
# Connection parts (drill talks to the 'postgres' maintenance DB for DDL)
# ---------------------------------------------------------------------------
PGPASSWORD=$(echo "$DATABASE_URL" | sed -E 's|postgresql://[^:]+:([^@]+)@.*|\1|')
PGHOST=$(echo     "$DATABASE_URL" | sed -E 's|postgresql://[^@]+@([^:/]+).*|\1|')
PGPORT=$(echo     "$DATABASE_URL" | sed -E 's|.*:([0-9]+)/.*|\1|')
PGUSER=$(echo     "$DATABASE_URL" | sed -E 's|postgresql://([^:]+):.*|\1|')
export PGPASSWORD

SCRATCH_DB="agentfarm_restore_drill_$(date -u +%Y%m%d_%H%M%S)"
PSQL=(psql --host="$PGHOST" --port="$PGPORT" --username="$PGUSER" --no-password --tuples-only --quiet)

cleanup() {
  log "Dropping scratch database $SCRATCH_DB"
  "${PSQL[@]}" --dbname=postgres \
    --command="DROP DATABASE IF EXISTS \"${SCRATCH_DB}\" WITH (FORCE);" >/dev/null 2>&1 || true
}
trap cleanup EXIT

log "Dump under drill : $DUMP_FILE ($(du -sh "$DUMP_FILE" | cut -f1))"
log "Postgres server  : $PGHOST:$PGPORT"
log "Scratch database : $SCRATCH_DB"

# ---------------------------------------------------------------------------
# 1. Fresh scratch database
# ---------------------------------------------------------------------------
"${PSQL[@]}" --dbname=postgres \
  --command="CREATE DATABASE \"${SCRATCH_DB}\";" >/dev/null \
  || die "Could not create scratch database" 2

# pgvector types inside the dump need the extension available in the scratch DB.
"${PSQL[@]}" --dbname="$SCRATCH_DB" \
  --command="CREATE EXTENSION IF NOT EXISTS vector;" >/dev/null 2>&1 || true

# ---------------------------------------------------------------------------
# 2. Restore into the scratch database
# ---------------------------------------------------------------------------
log "Restoring ..."
pg_restore \
  --host="$PGHOST" --port="$PGPORT" --username="$PGUSER" \
  --dbname="$SCRATCH_DB" \
  --no-password --no-owner --no-privileges \
  --exit-on-error \
  "$DUMP_FILE" || die "pg_restore failed — the backup does NOT restore cleanly" 3

# ---------------------------------------------------------------------------
# 3. Sanity checks
# ---------------------------------------------------------------------------
TABLE_COUNT=$("${PSQL[@]}" --dbname="$SCRATCH_DB" \
  --command="SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public';" | tr -d '[:space:]')
log "Restored table count: $TABLE_COUNT (minimum: $DRILL_MIN_TABLES)"
[[ "$TABLE_COUNT" -ge "$DRILL_MIN_TABLES" ]] \
  || die "Only $TABLE_COUNT tables restored (< $DRILL_MIN_TABLES) — dump looks incomplete" 4

TENANT_COUNT=$("${PSQL[@]}" --dbname="$SCRATCH_DB" \
  --command='SELECT COUNT(*) FROM "Tenant";' | tr -d '[:space:]') \
  || die 'Tenant table is not readable after restore' 4
log "Tenant rows restored: $TENANT_COUNT"

log "DRILL PASSED — $DUMP_FILE restores cleanly ($TABLE_COUNT tables, $TENANT_COUNT tenants)."
