# Contributing

AgentFarm is a TypeScript pnpm monorepo. This document covers local setup, development workflow, testing requirements, and CI expectations.

---

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | 20+ (CI uses Node 22) |
| pnpm | 9.12.0+ |
| Docker + Docker Compose | any recent version |
| PostgreSQL 16 | provided by Docker Compose |

---

## Local setup

```bash
# Clone and install
git clone <repo>
cd AgentFarm
pnpm install

# Set up environment
cp .env.example .env
# Edit .env — fill in DATABASE_URL and the required secret variables
# See README.md for the list of required variables

# Generate Prisma client and run migrations
pnpm --filter @agentfarm/db-schema exec prisma generate
pnpm --filter @agentfarm/db-schema exec prisma migrate deploy
```

---

## Running services

Start each service in a separate terminal:

```bash
pnpm --filter @agentfarm/api-gateway dev      # port 3000
pnpm --filter @agentfarm/agent-runtime dev    # port 4000
pnpm --filter @agentfarm/trigger-service dev  # port 3002
pnpm --filter @agentfarm/dashboard dev        # port 3001
pnpm --filter @agentfarm/website dev          # port varies
```

Or start everything via Docker Compose:

```bash
docker compose up
```

---

## Development workflow

1. Make changes in the relevant `apps/*` or `packages/*` directory.
2. Run the typecheck for the changed package:
   ```bash
   pnpm --filter @agentfarm/<package> typecheck
   ```
3. Run the tests for the changed package:
   ```bash
   pnpm --filter @agentfarm/<package> test
   ```
4. Ensure the workspace-level typecheck still passes:
   ```bash
   pnpm typecheck
   ```

### Adding a shared type
Shared contract types go in `packages/shared-types/src/`. Export from the package's `src/index.ts`. Do not duplicate types between packages.

### Adding a shared package
If a new shared package is needed, add it under `packages/` following the existing pattern:
- `package.json` with `name: @agentfarm/<name>` and `main: ./src/index.ts`
- `tsconfig.json` extending `../../tsconfig.base.json`
- Add to `pnpm-workspace.yaml` and to the `references` array in the root `tsconfig.base.json`

---

## Testing

Test framework: Node.js built-in `node:test`. Do not introduce Jest or Vitest.

### Running tests

```bash
# Single package
pnpm --filter @agentfarm/api-gateway test
pnpm --filter @agentfarm/agent-runtime test
pnpm --filter @agentfarm/trigger-service test

# All packages (requires Postgres running)
pnpm test
```

### Test requirements

- Every new route handler or service function must have a corresponding test.
- Tests must include at least one positive path and one negative/error path per tested unit.
- Test files live alongside the source files they test: `src/foo.ts` → `src/foo.test.ts`.
- Use `node:test` and `node:assert` — no external test library dependencies.

### DB integration tests

DB smoke tests require a live PostgreSQL instance. In CI this is provided by the `db-integration` job's Postgres service. Locally, start PostgreSQL via Docker Compose first:

```bash
docker compose up postgres -d
pnpm test:db-smoke
```

---

## Quality gate

The quality gate script checks typecheck, test counts, and coverage thresholds. Run it before opening a PR for any meaningful change:

```bash
pnpm quality:gate
```

The gate is defined in `operations/quality/`. Passing the gate is the release-quality bar.

---

## CI pipeline

Seven jobs in `.github/workflows/ci.yml`:

| Job | Trigger | What it checks |
|-----|---------|----------------|
| `website-permissions` | push/PR | Website permissions matrix + deployment UI regression |
| `validate` | push/PR | `pnpm typecheck` + `pnpm build` workspace-level |
| `db-integration` | push/PR | Migrations apply cleanly; DB smoke tests pass |
| `install` | push/PR | `pnpm install --frozen-lockfile` succeeds |
| `typecheck` | push/PR (needs: install) | 7-package typecheck matrix |
| `test` | push/PR (needs: install) | 6-package test matrix with Postgres |
| `build` | push/PR (needs: install) | Docker build for 4 service images |

CI uses Node 22. All jobs run on `ubuntu-latest`.

### pnpm lock file
Never commit a partial or hand-edited `pnpm-lock.yaml`. The `install` CI job uses `--frozen-lockfile`. If you add a dependency, run `pnpm install` locally and commit the updated lock file together with the `package.json` change.

---

## Code style

- **TypeScript**: `strict` mode, `module: NodeNext`, `moduleResolution: NodeNext`. No `any` without a comment explaining why.
- **Imports**: use package name imports for internal packages (`@agentfarm/shared-types`), not relative paths across package boundaries.
- **Formatting**: the project uses the default VS Code formatter. Keep formatting consistent with the surrounding file.
- **No compiled output for dev**: shared packages resolve via `main: ./src/index.ts`. Do not check in `dist/` output (except `@agentfarm/shared-types` which has a build step).

---

## Security rules

- Never commit credentials, tokens, API keys, or connection strings.
- All secrets must come from environment variables. Use `.env.example` to document new variables.
- New inbound webhook handlers must verify HMAC signatures before processing.
- New authenticated routes must use the existing session middleware — do not bypass it.
- Do not disable or weaken the `@fastify/helmet` configuration.

---

## Submitting changes

1. Branch from `main`.
2. Make focused, single-concern changes.
3. Run typecheck and tests for affected packages.
4. Run `pnpm quality:gate` for meaningful changes.
5. Open a PR with a clear description of what changed and why.
6. CI must be fully green before merging.

For architecture-level decisions, add an entry to [planning/architecture-decision-log.md](planning/architecture-decision-log.md) before merging.
