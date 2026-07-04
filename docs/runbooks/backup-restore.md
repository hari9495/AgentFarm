# Postgres Backup & Restore Runbook

> Pre-flight reliability P0 (enterprise audit 2026-07-02): a backup that has
> never been restored is a hope, not a backup. This runbook covers the three
> pieces: scheduled dumps, retention, and the automated restore drill.

## Components

| Piece | File | What it does |
|---|---|---|
| Backup | `scripts/db-backup.sh` | `pg_dump -Fc` (custom format, max compression) → Azure Blob / S3 / local dir; local mode prunes to the newest `BACKUP_RETENTION_COUNT` (default 14) |
| Restore | `scripts/db-restore.sh` | Interactive restore into the real DB (dry-run, confirm prompt, optional drop-and-recreate, Tenant smoke check) |
| **Drill** | `scripts/db-restore-drill.sh` | **Non-interactive proof**: restores the newest dump into a fresh scratch database, checks ≥ `DRILL_MIN_TABLES` tables (default 50) and Tenant readability, drops the scratch DB. Never touches the real database. |
| Scheduler | `docker-compose.yml` → `pg-backup` service (`profiles: [backup]`) | Dumps every `BACKUP_INTERVAL_HOURS` (default 24) into `./backups`, runs the drill every 7th cycle |

## Enable scheduled backups (VM / any compose host)

```bash
docker compose --profile backup up -d pg-backup
docker logs -f agentfarm-pg-backup   # watch the first cycle complete
```

Dumps land in `./backups/agentfarm_<db>_<UTC timestamp>.dump`.

## Run a backup manually

```bash
# Inside the compose network (has pg_dump 16 + connectivity):
docker compose exec -T postgres bash -c \
  'DATABASE_URL=postgresql://$POSTGRES_USER:$POSTGRES_PASSWORD@localhost:5432/$POSTGRES_DB \
   BACKUP_DESTINATION=local LOCAL_BACKUP_DIR=/backups bash /usr/local/bin/db-backup.sh'
```

(or on any host with `pg_dump` 16+: set `DATABASE_URL`, `BACKUP_DESTINATION`, run the script.)

## Run the restore drill

```bash
DATABASE_URL=postgresql://user:pass@host:5432/agentfarm \
LOCAL_BACKUP_DIR=./backups \
bash scripts/db-restore-drill.sh          # newest dump
bash scripts/db-restore-drill.sh --file backups/agentfarm_agentfarm_20260704_120000.dump
```

Exit code 0 = the dump provably restores. Non-zero = treat as a **sev-2**: you
do not have a working backup. The drill runs automatically every 7th backup
cycle in the `pg-backup` sidecar — alert on `restore drill FAILED` in its logs.

## Real restore (disaster recovery)

1. Stop writers: `docker compose stop api-gateway agent-runtime trigger-service worker-runner orchestrator`
2. `DRY_RUN=true ./scripts/db-restore.sh --file <dump>` — validate the dump.
3. `DROP_AND_RECREATE=true ./scripts/db-restore.sh --file <dump>` — type `YES` at the prompt.
4. `pnpm db:migrate:deploy` — apply any migrations newer than the dump.
5. Restart services; verify `/health` and the dashboard.

## Offsite durability

Local `./backups` on the same VM does **not** survive VM loss. For production:

- Preferred: `BACKUP_DESTINATION=azure` with `AZURE_STORAGE_ACCOUNT` / `AZURE_STORAGE_KEY` /
  `AZURE_BACKUP_CONTAINER` (the script uploads each dump; configure a blob
  lifecycle policy for retention). Run from a host cron with the `az` CLI, or
  sync `./backups` with `azcopy sync` on a schedule.
- RPO with defaults: ≤ 24h (tighten `BACKUP_INTERVAL_HOURS` as needed).
  RTO: dump-size dependent; drill logs give the current restore time.

## Verified

- 2026-07-04: full cycle verified locally — live dump of the dev database →
  `db-restore-drill.sh` restored it into a scratch DB, table + Tenant checks
  passed, scratch dropped. (See commit message for the transcript.)
