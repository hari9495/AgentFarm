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
5. Orchestrator state persistence backend selection and validation.

## Key Components
1. Runtime smoke script:
- `apps/agent-runtime/src/db-snapshot-smoke.ts`
2. Orchestrator state store implementation:
- `apps/orchestrator/src/orchestrator-state-store.ts`
3. Orchestrator API bootstrap and backend selection:
- `apps/orchestrator/src/main.ts`
4. DB package migration scripts:
- `packages/db-schema/package.json`
5. Root convenience scripts:
- `package.json`
6. CI DB integration job:
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
3. Orchestrator state backend selector:
- `ORCHESTRATOR_STATE_BACKEND` with supported values:
  - `auto` (default): use DB when `DATABASE_URL` exists; otherwise file.
  - `db`: force DB backend and fail fast if `DATABASE_URL` is missing.
  - `file`: force file backend regardless of `DATABASE_URL`.
4. File backend override (optional):
- `ORCHESTRATOR_STATE_PATH` (default `.orchestrator/state.json`)

## Orchestrator Backend Rollout Defaults
Use the following defaults for staged rollout:
1. Local developer default:
- `ORCHESTRATOR_STATE_BACKEND=auto`
- Set `DATABASE_URL` only when explicitly validating DB persistence.
2. CI default for non-DB lanes:
- `ORCHESTRATOR_STATE_BACKEND=file`
3. DB integration lane and production/staging environments:
- `ORCHESTRATOR_STATE_BACKEND=db`
- `DATABASE_URL` required and validated at startup.

## Orchestrator Validation Commands

### Step 5: Run orchestrator tests and typecheck
```powershell
pnpm --filter @agentfarm/orchestrator test
pnpm --filter @agentfarm/orchestrator typecheck
```

### Step 6: Validate explicit DB backend behavior
```powershell
$env:DATABASE_URL='postgresql://agentfarm:agentfarm@localhost:5432/agentfarm'
$env:ORCHESTRATOR_STATE_BACKEND='db'
pnpm --filter @agentfarm/orchestrator test
```

### Step 7: Validate auto fallback behavior
```powershell
Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
$env:ORCHESTRATOR_STATE_BACKEND='auto'
pnpm --filter @agentfarm/orchestrator test
```

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

### 5. Orchestrator DB backend startup fails fast
Symptoms:
- Startup error indicates `DATABASE_URL` is required for `ORCHESTRATOR_STATE_BACKEND=db`.

Recovery:
1. Set `DATABASE_URL` before starting orchestrator process.
2. If DB is not required for current lane, set `ORCHESTRATOR_STATE_BACKEND=file`.
3. Re-run orchestrator tests and typecheck.

## Operational Notes
1. Keep migrations provider-agnostic PostgreSQL SQL; avoid platform-only DB features in core paths unless approved ADR exists.
2. For repeat smoke runs with deterministic first-start behavior, set a new `AF_DB_SMOKE_BOT_ID` per run.
3. Document every DB incident or migration anomaly in `operations/quality/8.1-quality-gate-report.md`.
