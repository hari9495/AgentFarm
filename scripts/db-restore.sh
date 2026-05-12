#!/usr/bin/env bash
# =============================================================================
# db-restore.sh — AgentFarm database restore from a pg_dump custom-format file
# =============================================================================
# Usage:
#   # Dry-run: shows what would happen, does not touch the database
#   DRY_RUN=true ./scripts/db-restore.sh --file agentfarm_prod_20260513_020000.dump
#
#   # Restore from a local dump file
#   ./scripts/db-restore.sh --file /path/to/dump.dump
#
#   # Download from Azure and restore
#   ./scripts/db-restore.sh --azure agentfarm_prod_20260513_020000.dump
#
#   # Download from S3 and restore
#   ./scripts/db-restore.sh --s3 s3://agentfarm-db-backups/agentfarm_prod_20260513_020000.dump
#
# Required environment variables:
#   DATABASE_URL              — PostgreSQL connection string for RESTORE TARGET
#
# Optional environment variables:
#   DRY_RUN                   — "true" to simulate without restoring (default: false)
#   DROP_AND_RECREATE         — "true" to DROP the target DB before restore (default: false)
#                               Use with extreme caution — irreversible data loss.
#
# Exit codes:
#   0  — success (or dry-run success)
#   1  — missing required variable or argument
#   2  — download failed
#   3  — pg_restore failed
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
log()     { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }
err()     { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] ERROR: $*" >&2; }
die()     { err "$*"; exit "${2:-1}"; }
confirm() {
  read -r -p "Type YES to confirm: " ans
  [[ "$ans" == "YES" ]] || die "Aborted by user."
}

DRY_RUN="${DRY_RUN:-false}"
DROP_AND_RECREATE="${DROP_AND_RECREATE:-false}"
DUMP_FILE=""

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------
while [[ $# -gt 0 ]]; do
  case "$1" in
    --file)  DUMP_FILE="$2"; shift 2 ;;
    --azure)
      BLOB_NAME="$2"; shift 2
      : "${AZURE_STORAGE_ACCOUNT:?AZURE_STORAGE_ACCOUNT is required for --azure}"
      : "${AZURE_STORAGE_KEY:?AZURE_STORAGE_KEY is required for --azure}"
      CONTAINER="${AZURE_BACKUP_CONTAINER:-agentfarm-db-backups}"
      DUMP_FILE="/tmp/${BLOB_NAME}"
      log "Downloading from Azure: $CONTAINER/$BLOB_NAME"
      az storage blob download \
        --account-name  "$AZURE_STORAGE_ACCOUNT" \
        --account-key   "$AZURE_STORAGE_KEY" \
        --container-name "$CONTAINER" \
        --name          "$BLOB_NAME" \
        --file          "$DUMP_FILE" \
        --only-show-errors || die "Azure download failed" 2
      log "Downloaded to $DUMP_FILE"
      ;;
    --s3)
      S3_URI="$2"; shift 2
      DUMP_FILE="/tmp/$(basename "$S3_URI")"
      log "Downloading from S3: $S3_URI"
      aws s3 cp "$S3_URI" "$DUMP_FILE" --quiet || die "S3 download failed" 2
      log "Downloaded to $DUMP_FILE"
      ;;
    *)
      die "Unknown argument: $1. Use --file, --azure, or --s3."
      ;;
  esac
done

[[ -n "$DUMP_FILE" ]] || die "No dump file specified. Use --file, --azure, or --s3."
[[ -f "$DUMP_FILE" ]] || die "Dump file not found: $DUMP_FILE"

# ---------------------------------------------------------------------------
# Validate required variables
# ---------------------------------------------------------------------------
: "${DATABASE_URL:?DATABASE_URL is required}"

PGPASSWORD=$(echo "$DATABASE_URL" | sed -E 's|postgresql://[^:]+:([^@]+)@.*|\1|')
PGHOST=$(echo     "$DATABASE_URL" | sed -E 's|postgresql://[^@]+@([^:/]+).*|\1|')
PGPORT=$(echo     "$DATABASE_URL" | sed -E 's|.*:([0-9]+)/.*|\1|')
PGDATABASE=$(echo "$DATABASE_URL" | sed -E 's|.*/([^?]+).*|\1|')
PGUSER=$(echo     "$DATABASE_URL" | sed -E 's|postgresql://([^:]+):.*|\1|')
export PGPASSWORD

DUMP_SIZE=$(du -sh "$DUMP_FILE" | cut -f1)
log "Restore target  : $PGDATABASE on $PGHOST:$PGPORT"
log "Dump file       : $DUMP_FILE ($DUMP_SIZE)"
log "DRY_RUN         : $DRY_RUN"
log "DROP_AND_RECREATE: $DROP_AND_RECREATE"

# ---------------------------------------------------------------------------
# Dry-run mode — validate dump without touching the database
# ---------------------------------------------------------------------------
if [[ "$DRY_RUN" == "true" ]]; then
  log "DRY_RUN: validating dump with pg_restore --list (no changes made)"
  pg_restore --list "$DUMP_FILE" | head -20
  log "Dump appears valid. DRY_RUN complete — no data was modified."
  exit 0
fi

# ---------------------------------------------------------------------------
# Confirmation prompt for destructive restore
# ---------------------------------------------------------------------------
log ""
log "WARNING: This will restore '$DUMP_FILE' into '$PGDATABASE'."
log "         Existing data in the target database may be overwritten."
if [[ "$DROP_AND_RECREATE" == "true" ]]; then
  log "         DROP_AND_RECREATE=true — the database will be DROPPED and recreated."
  log "         This is IRREVERSIBLE. All existing data will be permanently deleted."
fi
confirm

# ---------------------------------------------------------------------------
# Optional: drop and recreate the database
# ---------------------------------------------------------------------------
if [[ "$DROP_AND_RECREATE" == "true" ]]; then
  log "Dropping database $PGDATABASE ..."
  psql \
    --host="$PGHOST" --port="$PGPORT" --username="$PGUSER" \
    --dbname=postgres \
    --command="DROP DATABASE IF EXISTS \"${PGDATABASE}\";"
  log "Recreating database $PGDATABASE ..."
  psql \
    --host="$PGHOST" --port="$PGPORT" --username="$PGUSER" \
    --dbname=postgres \
    --command="CREATE DATABASE \"${PGDATABASE}\";"
fi

# ---------------------------------------------------------------------------
# Restore
# ---------------------------------------------------------------------------
log "Restoring dump ..."
pg_restore \
  --host="$PGHOST" \
  --port="$PGPORT" \
  --username="$PGUSER" \
  --dbname="$PGDATABASE" \
  --no-password \
  --clean \
  --if-exists \
  --exit-on-error \
  "$DUMP_FILE" || die "pg_restore failed" 3

log "Restore complete."

# ---------------------------------------------------------------------------
# Post-restore smoke check — count rows in a key table
# ---------------------------------------------------------------------------
ROW_COUNT=$(psql \
  --host="$PGHOST" --port="$PGPORT" --username="$PGUSER" \
  --dbname="$PGDATABASE" \
  --no-password --tuples-only \
  --command='SELECT COUNT(*) FROM "Tenant";' | tr -d ' ')
log "Post-restore smoke check: Tenant table has $ROW_COUNT rows."

# ---------------------------------------------------------------------------
# Cleanup downloaded temp file
# ---------------------------------------------------------------------------
if [[ "$DUMP_FILE" == /tmp/* ]]; then
  rm -f "$DUMP_FILE"
fi

log "db-restore.sh finished successfully."
