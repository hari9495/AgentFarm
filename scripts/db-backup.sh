#!/usr/bin/env bash
# =============================================================================
# db-backup.sh — AgentFarm production database backup
# =============================================================================
# Usage:
#   ./scripts/db-backup.sh
#
# Required environment variables (set in .env or CI secrets):
#   DATABASE_URL              — PostgreSQL connection string (production DB)
#   BACKUP_DESTINATION        — One of: "azure" | "s3" | "local"
#
# For azure destination:
#   AZURE_STORAGE_ACCOUNT     — Storage account name
#   AZURE_STORAGE_KEY         — Storage account key (or use az login)
#   AZURE_BACKUP_CONTAINER    — Blob container name (default: agentfarm-db-backups)
#
# For s3 destination:
#   AWS_S3_BACKUP_BUCKET      — S3 bucket name (e.g. s3://agentfarm-db-backups)
#   AWS_REGION                — AWS region (e.g. us-east-1)
#   (Uses the AWS CLI credential chain: env vars, ~/.aws/credentials, or IAM role)
#
# Exit codes:
#   0  — success
#   1  — missing required variable
#   2  — pg_dump failed
#   3  — upload failed
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
log()  { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }
err()  { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] ERROR: $*" >&2; }
die()  { err "$*"; exit "${2:-1}"; }

# ---------------------------------------------------------------------------
# Validate required variables
# ---------------------------------------------------------------------------
: "${DATABASE_URL:?DATABASE_URL is required}"
: "${BACKUP_DESTINATION:?BACKUP_DESTINATION is required (azure | s3 | local)}"

# ---------------------------------------------------------------------------
# Derive connection parts from DATABASE_URL
# postgresql://user:password@host:port/dbname
# ---------------------------------------------------------------------------
PGPASSWORD=$(echo "$DATABASE_URL" | sed -E 's|postgresql://[^:]+:([^@]+)@.*|\1|')
PGHOST=$(echo     "$DATABASE_URL" | sed -E 's|postgresql://[^@]+@([^:/]+).*|\1|')
PGPORT=$(echo     "$DATABASE_URL" | sed -E 's|.*:([0-9]+)/.*|\1|')
PGDATABASE=$(echo "$DATABASE_URL" | sed -E 's|.*/([^?]+).*|\1|')
PGUSER=$(echo     "$DATABASE_URL" | sed -E 's|postgresql://([^:]+):.*|\1|')
export PGPASSWORD

# ---------------------------------------------------------------------------
# Create timestamped dump file
# ---------------------------------------------------------------------------
TIMESTAMP=$(date -u +%Y%m%d_%H%M%S)
DUMP_FILE="/tmp/agentfarm_${PGDATABASE}_${TIMESTAMP}.dump"
DUMP_NAME="agentfarm_${PGDATABASE}_${TIMESTAMP}.dump"

log "Starting backup of database '$PGDATABASE' on $PGHOST:$PGPORT"

pg_dump \
  --host="$PGHOST" \
  --port="$PGPORT" \
  --username="$PGUSER" \
  --format=custom \
  --compress=9 \
  --no-password \
  --file="$DUMP_FILE" \
  "$PGDATABASE" || die "pg_dump failed" 2

DUMP_SIZE=$(du -sh "$DUMP_FILE" | cut -f1)
log "Dump complete: $DUMP_FILE ($DUMP_SIZE)"

# ---------------------------------------------------------------------------
# Upload to offsite destination
# ---------------------------------------------------------------------------
case "$BACKUP_DESTINATION" in
  azure)
    : "${AZURE_STORAGE_ACCOUNT:?AZURE_STORAGE_ACCOUNT is required for azure destination}"
    : "${AZURE_STORAGE_KEY:?AZURE_STORAGE_KEY is required for azure destination}"
    CONTAINER="${AZURE_BACKUP_CONTAINER:-agentfarm-db-backups}"
    log "Uploading to Azure Blob: $CONTAINER/$DUMP_NAME"
    az storage blob upload \
      --account-name  "$AZURE_STORAGE_ACCOUNT" \
      --account-key   "$AZURE_STORAGE_KEY" \
      --container-name "$CONTAINER" \
      --name          "$DUMP_NAME" \
      --file          "$DUMP_FILE" \
      --overwrite \
      --only-show-errors || die "Azure upload failed" 3
    log "Upload complete: https://${AZURE_STORAGE_ACCOUNT}.blob.core.windows.net/${CONTAINER}/${DUMP_NAME}"
    ;;

  s3)
    : "${AWS_S3_BACKUP_BUCKET:?AWS_S3_BACKUP_BUCKET is required for s3 destination}"
    S3_URI="${AWS_S3_BACKUP_BUCKET%/}/${DUMP_NAME}"
    log "Uploading to S3: $S3_URI"
    aws s3 cp "$DUMP_FILE" "$S3_URI" \
      --sse aws:kms \
      --quiet || die "S3 upload failed" 3
    log "Upload complete: $S3_URI"
    ;;

  local)
    LOCAL_DIR="${LOCAL_BACKUP_DIR:-/var/backups/agentfarm}"
    mkdir -p "$LOCAL_DIR"
    cp "$DUMP_FILE" "${LOCAL_DIR}/${DUMP_NAME}"
    log "Backup stored locally: ${LOCAL_DIR}/${DUMP_NAME}"
    log "WARNING: local backups do not satisfy offsite durability requirements."
    ;;

  *)
    die "Unknown BACKUP_DESTINATION: $BACKUP_DESTINATION (expected: azure | s3 | local)"
    ;;
esac

# ---------------------------------------------------------------------------
# Prune local temp file
# ---------------------------------------------------------------------------
rm -f "$DUMP_FILE"
log "Backup finished successfully."
