# Database Integration Testing Runbook

## Purpose
Provide a repeatable, real-database validation workflow for AgentFarm runtime persistence paths, especially capability snapshot migration and restart-load behavior.

## Why This Exists
1. Unit tests validate logic but cannot guarantee migration/runtime behavior against real PostgreSQL.
2. This runbook prevents regressions in migration scripts, Prisma model availability, and startup read/write persistence paths.
3. It documents exact commands and expected outcomes so on-call and new contributors can execute DB validation quickly.

## Scope
1. PostgreSQL startup for local testing.
2. Prisma migration apply verification.
3. Runtime DB smoke scenario (two-startup persisted snapshot check).
4. CI DB integration lane behavior.

## Key Components
1. Runtime smoke script:
- `apps/agent-runtime/src/db-snapshot-smoke.ts`
2. DB package migration scripts:
- `packages/db-schema/package.json`
3. Root convenience scripts:
- `package.json`
4. CI DB integration job:
- `.github/workflows/ci.yml`

## Required Environment
1. `DATABASE_URL`
- Example: `postgresql://agentfarm:agentfarm@localhost:5432/agentfarm`
2. Optional smoke overrides:
- `AF_DB_SMOKE_BOT_ID`
- `AF_DB_SMOKE_TENANT_ID`
- `AF_DB_SMOKE_WORKSPACE_ID`
- `AF_DB_SMOKE_ROLE_PROFILE`
- `AF_DB_SMOKE_POLICY_PACK_VERSION`

## Local Execution

### Step 1: Start PostgreSQL
Using Docker Compose from repo root:
```powershell
docker compose up -d postgres
```

### Step 2: Apply migrations
```powershell
$env:DATABASE_URL='postgresql://agentfarm:agentfarm@localhost:5432/agentfarm'
pnpm db:migrate:deploy
```

### Step 3: Run DB smoke lane
```powershell
$env:DATABASE_URL='postgresql://agentfarm:agentfarm@localhost:5432/agentfarm'
pnpm test:db-smoke
```

### Step 4: Optional full DB lane
```powershell
$env:DATABASE_URL='postgresql://agentfarm:agentfarm@localhost:5432/agentfarm'
pnpm test:db-lane
```

## Expected Smoke Behavior
The script verifies:
1. First runtime startup source is `runtime_freeze`.
2. Second startup source is `persisted_load` for same bot.
3. Snapshot id is stable across restart.

Expected output shape:
```json
{
  "ok": true,
  "scenario": "db_snapshot_restart_load",
  "first": {
    "capability_snapshot_source": "runtime_freeze"
  },
  "second": {
    "capability_snapshot_source": "persisted_load"
  },
  "stable_snapshot_id": "..."
}
```

## Quality Gate Integration
1. `scripts/quality-gate.mjs` supports optional DB lane.
2. Enable with:
```powershell
$env:AF_ENABLE_DB_INTEGRATION='true'
$env:DATABASE_URL='postgresql://agentfarm:agentfarm@localhost:5432/agentfarm'
pnpm quality:gate
```

## CI Integration
CI workflow includes `db-integration` job in `.github/workflows/ci.yml`.

Job behavior:
1. Starts PostgreSQL service container (`postgres:16`).
2. Sets `DATABASE_URL` in job env.
3. Runs:
- `pnpm db:migrate:deploy`
- `pnpm test:db-smoke`

## Known Failure Modes and Recovery

### 1. Docker daemon unavailable
Symptoms:
- `docker info` fails to connect to `dockerDesktopLinuxEngine`.

Recovery:
1. Start Docker Desktop.
2. Confirm daemon ready: `docker info`.
3. Retry `docker compose up -d postgres`.

### 2. Prisma migration shadow/apply failure
Symptoms:
- `prisma migrate ...` fails with SQL syntax errors.

Recovery:
1. Inspect latest migration SQL for malformed content/encoding.
2. Normalize migration SQL content to clean UTF-8 text.
3. Re-run `pnpm db:migrate:deploy`.

### 3. Runtime does not load persisted snapshot
Symptoms:
- second startup still returns `runtime_freeze`.

Checks:
1. Verify `DATABASE_URL` is set for runtime process.
2. Confirm `@prisma/client` is available in `agent-runtime` dependencies.
3. Re-run `pnpm test:db-smoke` and inspect output.

### 4. Port conflict on 5432
Symptoms:
- PostgreSQL container fails to start/bind.

Recovery:
1. Free port 5432 or change local port mapping in compose for local-only runs.
2. Update `DATABASE_URL` accordingly.

## Operational Notes
1. Keep migrations provider-agnostic PostgreSQL SQL; avoid platform-only DB features in core paths unless approved ADR exists.
2. For repeat smoke runs with deterministic first-start behavior, set a new `AF_DB_SMOKE_BOT_ID` per run.
3. Document every DB incident or migration anomaly in `operations/quality/8.1-quality-gate-report.md`.
