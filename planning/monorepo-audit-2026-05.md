# AgentFarm Monorepo Audit — May 2026

> **Read-only audit. No code was changed.**
> Scope: `apps/api-gateway`, `apps/agent-runtime`, `apps/dashboard`, `apps/website`, `services/*`, `packages/*`

---

## Audit Index

| # | Category | Packages examined |
|---|----------|-------------------|
| 1 | Files (count) | all |
| 2 | Dead code / unused routes | api-gateway |
| 3 | Silent stubs / TODOs | all |
| 4 | Typecheck | all |
| 5 | Duplicate logic candidates | api-gateway, website |
| 6 | Missing error handling | api-gateway/services |
| 7 | Routes registered but never called | api-gateway |
| 8 | Env vars in code but missing from `.env.example` | agent-runtime, website |
| 9 | Prisma models without a migration | db-schema |

---

## `apps/api-gateway`

### 1. Files
~175 TypeScript files across `src/`, `src/lib/`, `src/routes/`, `src/services/`, `src/__tests__/`.

### 2. Dead code / unused exports
None detected. Every file in `src/routes/` is imported and registered in `src/main.ts`.

### 3. Silent stubs / TODOs
**`src/routes/webhooks.ts`** — 5 consecutive TODO comments (L327, 335, 354, 366, 379):
```
// TODO: Add a WebhookSource model to the Prisma schema for persistence.
// TODO: Replace with prisma.webhookSource.findMany() once the model exists.
// TODO: Persist to prisma.webhookSource once the model exists.
// TODO: Delete from prisma.webhookSource once the model exists.
// TODO: Query from an InboundWebhookEvent model once it exists.
```
**Impact:** All webhook-source and inbound-event CRUD operates on an in-memory store (`Map`). Data is lost on restart. Two Prisma models (`WebhookSource`, `InboundWebhookEvent`) are referenced by code but do not yet exist in the schema.

### 4. Typecheck
**CLEAN** — `pnpm --filter @agentfarm/api-gateway typecheck` passes with 0 errors.

### 5. Duplicate logic candidates
- `hashPassword` / `verifyPassword` are shared from `src/lib/password.ts`. `auth.ts`, `portal-auth.ts`, and `team.ts` all import the same module — **not a duplicate**.
- Manual cookie-header parsing is isolated to `src/lib/session-auth.ts` and `src/lib/portal-session.ts` — each handles a different cookie name. No cross-file duplication.

### 6. Missing error handling
- `src/services/contract-generator.ts` — 0 try/catch blocks. The service generates contracts synchronously; if an exception is thrown it will propagate unhandled to the caller.
- `src/services/provisioning-monitoring.ts` — 0 try/catch blocks. Polling loop could silently drop errors on DB query failure.
- `src/services/run-recovery-worker.ts` — pure utility functions (no async), acceptable.

### 7. Routes registered but never called
All route files in `src/routes/` are registered in `main.ts`. No orphaned route files.

### 8. Env vars in code but missing from `.env.example`
All env vars referenced in `src/main.ts`, `src/lib/*`, and `src/routes/*` are documented in the root `.env.example`. No gaps.

### 9. Prisma models without migrations
N/A for this package. See `packages/db-schema` section.

---

## `apps/agent-runtime`

### 1. Files
~120 TypeScript source files in `src/`. Separate `src/__tests__/` directory (10 test files).

### 2. Dead code / unused exports
Not analyzed at import-graph depth. Notable: `src/advanced-runtime-features.ts` is referenced only from runtime-server; `src/code-review-learning.ts` has no observable callers outside tests — flagged for future analysis.

### 3. Silent stubs / TODOs
**`src/local-workspace-executor.ts`** — 15 stub locations:

| ~Line | Stub description |
|-------|-----------------|
| 3452 | `// Stub: search for function/class definition patterns` |
| 3487 | `// Stub implementation: returns structured type placeholder without spawning a shell` |
| 3501 | `// Stub: run eslint with unused-vars plugin logic` |
| 3538 | `// Stub: could use typescript-complexity or similar` |
| 3547 | `metrics.push({ cyclomatic: 5, cognitive: 8, lines: 50 }); // Stub values` — hardcoded complexity metrics |
| 3560 | `// Stub: grep for common patterns (hardcoded secrets, etc.)` |
| 3764 | `// Stub: build a simple dependency tree by parsing imports` |
| 3793 | `// Stub: find test files that import or depend on changedFile` |
| 3826 | `// Stub: return mock doc results` |
| 3851 | `// Stub: return mock package info` |
| 3912 | `// Stub: actual REPL would require spawning a process` |
| 3929 | `// Stub: would execute in active REPL session` |
| 3961 | `// Stub: would configure a debugger` |
| 3973 | `// Stub: would run with profiler` |
| ~4482/4488 | Generated test templates contain `// TODO: implement test for ${sym}` — intentional, emitted to user files |

**`src/desktop-operator-factory.ts` L126:**
```
// TODO: wire up a real native adapter (e.g. AppleScript / xdg-open / PowerShell)
```
**Impact:** Native desktop operator falls back to a no-op stub. All desktop automation on non-Playwright paths is inert.

**`src/skill-execution-engine.ts` L444, 446:**
Generated test scaffolding emits `// TODO: implement` — intentional placeholder in output, not a code stub.

### 4. Typecheck
**CLEAN** — `pnpm --filter @agentfarm/agent-runtime typecheck` passes with 0 errors.

### 5. Duplicate logic candidates
`API_GATEWAY_URL` is resolved inline in ~15 separate files via:
```ts
process.env.API_GATEWAY_URL ?? 'http://localhost:3000'
```
No shared constant exists in agent-runtime. All callers are internal. Consolidating into a `src/config.ts` would reduce drift risk.

### 6. Missing error handling
Not audited at per-function depth. Macro-level: all async route handlers in `src/runtime-server.ts` use try/catch wrappers.

### 7. Routes registered but never called
N/A — agent-runtime is not a route-registry server in the same sense as api-gateway.

### 8. Env vars in code but missing from `.env.example`
`src/config/notification-config.ts` reads 6 vars **not documented** in root `.env.example`:

| Var | Purpose |
|-----|---------|
| `NOTIFICATION_CHANNEL` | Selects active notification channel (slack/email/teams/webhook) |
| `NOTIFICATION_WEBHOOK_URL` | Generic webhook notification target |
| `NOTIFICATION_EMAIL_TO` | Recipient address for email notifications |
| `NOTIFICATION_EMAIL_FROM` | Sender address for email notifications |
| `NOTIFICATION_SMTP_HOST` | SMTP host for email notification channel |
| `NOTIFICATION_SMTP_PORT` | SMTP port for email notification channel |

Root `.env.example` documents `NOTIFICATION_SLACK_WEBHOOK_URL` and `NOTIFICATION_TEAMS_WEBHOOK_URL` but omits the six above.

### 9. Prisma models without migrations
N/A for this package. See `packages/db-schema` section.

---

## `apps/dashboard`

### 1. Files
~65 TypeScript/TSX files across `app/`, `app/components/`, `app/connectors/`, `app/provisioning/`.

### 2. Dead code / unused exports
Not analyzed at import-graph depth.

### 3. Silent stubs / TODOs
**None.** All `TODO`/`Stub` matches were false positives:
- `kanban-board-utils.ts` and its test — `'todo'` is a valid column status string, not a code TODO.
- `workflow-builder-panel.tsx` — `TemplateStub` is a local type name for reduced template objects (not a code stub).
- `health-status-panel.tsx` L594 — user-facing display string: _"connector health monitor may be in stub mode"_ — informational, not a code issue.

### 4. Typecheck
**CLEAN** — `pnpm --filter @agentfarm/dashboard typecheck` passes with 0 errors.

### 5. Duplicate logic candidates
None identified.

### 6. Missing error handling
Not audited at per-function depth.

### 7. Routes registered but never called
N/A (Next.js App Router file-based routes).

### 8. Env vars in code but missing from `.env.example`
All vars (`DASHBOARD_API_BASE_URL`, `NEXT_PUBLIC_API_URL`) are in root `.env.example`. No gaps.

### 9. Prisma models without migrations
N/A.

---

## `apps/website`

### 1. Files
~130 TypeScript/TSX files across `app/`, `app/api/`, `app/portal/`, `components/`, `lib/`.

### 2. Dead code / unused exports
`lib/bots-catalogue.ts` exports a very large static catalogue (~2500 lines). Whether all catalogue entries are consumed by pages is not verified.

### 3. Silent stubs / TODOs
**None.** All `TODO`/`FIXME` matches were false positives — occurrences of `"Todoist"` (integration name) inside `lib/bots-catalogue.ts` data arrays.

### 4. Typecheck
**CLEAN** — `pnpm --filter @agentfarm/website typecheck` passes with 0 errors.

### 5. Duplicate logic candidates
`API_GATEWAY_URL` / `NEXT_PUBLIC_API_URL` resolution appears in two forms:
- `app/api/portal/_utils.ts` exports a shared `GATEWAY_URL` constant used by portal API routes.
- Many non-portal API routes under `app/api/` each define `GATEWAY_URL` or `API_GATEWAY_URL` inline rather than reusing the shared util.

### 6. Missing error handling
Portal server components (`app/portal/(app)/layout.tsx`, `agents/page.tsx`) redirect on 401 but do not handle non-401 network errors from the gateway (e.g. 500, timeout) — these would throw unhandled and surface a Next.js error boundary.

### 7. Routes registered but never called
N/A (Next.js App Router).

### 8. Env vars in code but missing from `.env.example`
All website-specific env vars are present in root `.env.example` (sections: website, dashboard). No gaps identified after cross-referencing `WEBSITE_AUTH_DB_PATH`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_WAITLIST_PROVIDER`, `NEXT_PUBLIC_FORMSPREE_ID`.

### 9. Prisma models without migrations
N/A.

---

## `services/*`

### 1. Files
~60 TypeScript files across 15 service directories.

### 2. Dead code / unused exports
Not analyzed at import-graph depth.

### 3. Silent stubs / TODOs
**`services/connector-gateway/src/connectors/email-connector.ts` L5:**
> _"Gmail and Outlook adapters are stubbed pending OAuth configuration."_

**Impact:** Email connector does not send or receive real email. All operations are no-ops until OAuth credentials are configured and the stub replaced.

**`services/meeting-agent/src/voice-pipeline.ts` L23, L29:**
```
/** Default STT stub — in production replace with a Whisper API call. */
/** Default TTS stub — in production replace with VoxCPM /v1/audio/speech call. */
```
**Impact:** Speech-to-text and text-to-speech in the meeting agent are placeholder implementations. No actual transcription or synthesis occurs in default configuration.

### 4. Typecheck
Services are not part of the pnpm typecheck workspace scripts. Not run.

### 5. Duplicate logic candidates
Not analyzed.

### 6. Missing error handling
Not audited at per-function depth.

### 7. Routes registered but never called
N/A.

### 8. Env vars in code but missing from `.env.example`
Not audited per service.

### 9. Prisma models without migrations
N/A.

---

## `packages/*`

### 1. Files
| Package | Files |
|---------|-------|
| `shared-types` | ~10 TypeScript files |
| `queue-contracts` | ~5 TypeScript files |
| `connector-contracts` | ~5 TypeScript files |
| `observability` | ~5 TypeScript files |
| `db-schema` | 1 schema file + 13 migration SQL files |

### 2–3. Dead code / Stubs / TODOs
**None** — full grep scan returned 0 matches across all packages.

### 4. Typecheck
All CLEAN:
- `pnpm --filter @agentfarm/shared-types typecheck` ✅
- `pnpm --filter @agentfarm/queue-contracts typecheck` ✅
- `pnpm --filter @agentfarm/connector-contracts typecheck` ✅
- `pnpm --filter @agentfarm/observability typecheck` ✅
- `pnpm --filter @agentfarm/db-schema typecheck` ✅

### 5–8.
No duplicate logic, missing error handling, dead routes, or env gaps identified.

### 9. Prisma models without migrations (`packages/db-schema`)

13 migration directories spanning 2026-04-25 → 2026-05-13. Last: `20260513000000_data_durability_baseline`.

**Models in `schema.prisma` with NO `CREATE TABLE` in any migration SQL:**

| Model | References in migrations | Status |
|-------|--------------------------|--------|
| `AgentMessage` | 0 | **No migration** |
| `Order` | 0 | **No migration** |
| `TenantMcpServer` | 0 | **No migration** |
| `TenantPortalAccount` | 0 | **No migration** — added in tenant portal sessions (Sprint 3) |
| `TenantPortalSession` | 0 | **No migration** — added in tenant portal sessions (Sprint 3) |

**Models with ALTER TABLE but no CREATE TABLE (ambiguous):**

| Model | Notes |
|-------|-------|
| `Invoice` | `ALTER TABLE "Invoice"` in `data_durability_baseline`; no CREATE TABLE found in any migration. Likely created in `phase8_to_35_models` under a non-standard format. |
| `Plan` | 6 references (`ALTER TABLE "Plan"`, FK columns) but no CREATE TABLE. Same likely cause. |

**Models mentioned in `webhooks.ts` TODOs but absent from `schema.prisma`:**

| Model | Status |
|-------|--------|
| `WebhookSource` | Not in schema; routes stub with in-memory Map |
| `InboundWebhookEvent` | Not in schema; routes stub with in-memory Map |

---

## Cross-Cutting Findings

### Duplicate password hashing across app boundaries
`apps/api-gateway/src/lib/password.ts` exports `hashPassword`/`verifyPassword` (bcrypt).
`apps/website/lib/auth-store.ts` implements its own bcrypt hash/verify functions.
These are in separate deployed apps so the duplication is a boundary decision, but if hashing parameters (cost factor) ever need updating, both must be changed independently.

### `API_GATEWAY_URL` pattern
~30 files across `agent-runtime`, `website`, `dashboard`, `orchestrator`, `trigger-service` each resolve this var inline. The website uses a shared util in `app/api/portal/_utils.ts` for portal routes but not for all API routes. There is no monorepo-wide shared config helper for this URL.

---

## Summary Table

| Package | Typecheck | TODOs/Stubs | Missing env vars | Migration gaps | Dead routes |
|---------|-----------|-------------|------------------|----------------|-------------|
| api-gateway | ✅ clean | 5 (webhooks.ts) | None | N/A | None |
| agent-runtime | ✅ clean | 15+ (local-workspace-executor) + 1 (desktop-operator) | 6 (notification config) | N/A | N/A |
| dashboard | ✅ clean | None | None | N/A | N/A |
| website | ✅ clean | None | None | N/A | N/A |
| services/* | Not run | 3 (email-connector + voice-pipeline) | Not audited | N/A | N/A |
| packages/* | ✅ all clean | None | None | 5 models no migration | N/A |

---

*Generated: 2026-05 | Read-only audit — no changes made*
