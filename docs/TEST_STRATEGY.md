> **Status:** Mixed planned + shipped behavior. See [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) for the authoritative gap tracker.
# AgentFarm Test Strategy

> Last updated: May 10, 2026 | AgentFarm monorepo audit

Complete reference for the testing architecture, test counts, coverage policies, CI integration, and known coverage gaps across the AgentFarm monorepo.

---

## Testing Philosophy

AgentFarm uses **Node.js built-in test runner** (`node:test` + `node:assert/strict`) throughout — no Jest, no Vitest.

Key principles:
- **Positive and negative scenarios required** for every behavior change
- **Bug fixes must include regression coverage** before merge
- **DB integration is explicit-scope** — smoke lane exists but unit tests mock Prisma
- **Quality gate is the release bar** — `pnpm quality:gate` must pass before any merge

---

## Test Runner Configuration

```bash
# Run all tests across the entire monorepo
pnpm test

# Run tests for a specific package
pnpm --filter @agentfarm/api-gateway test
pnpm --filter @agentfarm/agent-runtime test
pnpm --filter @agentfarm/dashboard test

# Run quality gate (lint + typecheck + test + coverage threshold)
pnpm quality:gate
```

---

## Test Framework

| Tool | Purpose |
|---|---|
| `node:test` | Test runner — all test files |
| `node:assert/strict` | Assertions |
| `node:mock` | Mocking (built-in since Node 22) |
| Playwright | E2E browser automation smoke tests |
| `scripts/coverage-threshold-check.mjs` | Post-test coverage enforcement |

---

## Test Counts by Package

| Package | Test Count | Notes |
|---|---|---|
| `apps/api-gateway` | **450** | Largest test suite; includes route, service, lib, and integration tests |
| `apps/agent-runtime` | **906** | Highest coverage; full execution, LLM, memory, skills, desktop, voice, etc. |
| `apps/dashboard` | **118** | Component logic, proxy handlers, pagination, navigation |
| `apps/website` | **118** | Auth flow, provisioning, deployments, permissions, session |
| `apps/orchestrator` | **62** | GOAP planner, parallel task manager, scheduler, state store |
| `services/provisioning-service` | **15** | Step executor, VM bootstrap, job processor |
| `services/approval-service` | **12** | Approval enforcer, governance workflow manager |
| `services/connector-gateway` | **36** | Adapter registry, plugin loader, PII filter, mTLS |
| `services/policy-engine` | **2** | Governance routing policy |
| `services/evidence-service` | **24** | Governance KPI, HNSW index |
| `services/agent-observability` | **9** | Audit log writer, correctness scorer, diff verifier |
| `services/notification-service` | **31** | Dispatcher, voice adapter |
| `services/meeting-agent` | **23** | Meeting lifecycle, voice pipeline |
| `services/memory-service` | **11** | Memory store |
| `services/agent-question-service` | **4** | Question store |
| `services/audit-storage` | **3** | Screenshot uploader |
| `packages/shared-types` | **1** | Contract compatibility |
| `apps/trigger-service` | **~12** | Router, dispatcher, reply dispatcher |
| **Total (estimated)** | **~1,800+** | Across all packages |

---

## Test File Naming Convention

All test files follow the pattern `{module-name}.test.ts` co-located next to the source file.

Exceptions:
- `apps/agent-runtime/src/__tests__/desktop-operator-factory.test.ts` — in a `__tests__/` subdirectory
- `apps/website/tests/*.test.ts` — in a top-level `tests/` directory per Next.js convention
- `apps/dashboard/app/components/*.test.ts` — co-located with components

---

## Key Test Areas by Package

### apps/api-gateway (898 tests)

| Area | Files | Focus |
|---|---|---|
| Auth routes | `auth.test.ts`, `auth.internal-login-policy.test.ts` | Login, signup, logout, session, internal login policy |
| Approval routes | `approvals.test.ts` | Approval CRUD, decision, packet parsing |
| Task routes | `runtime-tasks.test.ts`, `runtime-tasks.lease-concurrency.test.ts` | Task creation, status, concurrency lease |
| Approval packet | `approval-packet.test.ts` | Structured packet field parsing |
| Provider clients | `provider-clients.test.ts` | LLM provider client factories |
| Payment service | `payment-service.test.ts` | Stripe + Razorpay order processing |
| ZohoSign client | `zoho-sign-client.test.ts` | Contract send, status check |
| Contract generator | `contract-generator.test.ts` | PDF generation |
| Provisioning monitoring | `provisioning-monitoring.test.ts` | Stuck job detection |
| Connector workers | `connector-token-lifecycle-worker.test.ts`, `connector-health-worker.test.ts` | Token refresh, health polling |
| Run recovery | `run-recovery-worker.test.ts` | Crashed run restart |
| Admin provision | `admin-provision.test.ts` | Admin provisioning triggers |
| Budget policy | `budget-policy.test.ts` | Token budget enforcement |
| Governance workflows | `governance-workflows.test.ts` | Workflow routing |
| CI failures | `ci-failures.test.ts` | CI failure triage |
| Desktop actions | `desktop-actions.test.ts` | Desktop action routes |
| Desktop profile | `desktop-profile.test.ts` | Profile CRUD |
| Env reconciler | `env-reconciler.test.ts` | Env var reconciliation |
| Handoffs | `handoffs.test.ts` | Agent escalation |
| IDE state | `ide-state.test.ts` | IDE state persistence |
| Language | `language.test.ts` | Language config routes |
| Meetings | `meetings.test.ts` | Meeting session routes |
| Observability | `observability.test.ts` | Metrics/trace routes |
| Plugin loading | `plugin-loading.test.ts` | Dynamic plugin loading |
| Pull requests | `pull-requests.test.ts` | PR lifecycle |
| Questions | `questions.test.ts` | Agent question routing |
| Repro packs | `repro-packs.test.ts` | Repro pack creation |
| Roles | `roles.test.ts` | Role management |
| LLM config | `runtime-llm-config.test.ts` | LLM provider config |
| Snapshots | `snapshots.test.ts` | Workspace snapshots |
| SSE tasks | `sse-tasks.test.ts` | Real-time task progress |
| Webhooks | `webhooks.test.ts` | Outbound webhook management |
| Work memory | `work-memory.test.ts` | Task working context |
| Workspace session | `workspace-session.test.ts` | Session state |
| ZohoSign webhook | `zoho-sign-webhook.test.ts` | Signature events |
| Activity events | `activity-events.test.ts` | Activity feed |
| Connector auth | `connector-auth.test.ts` | OAuth flow |
| Connector actions | `connector-actions.test.ts` | Action proxy |
| Internal login policy | `internal-login-policy.test.ts` | IP/MFA policy |
| Sprint integration | `sprint3-integration.test.ts`, `sprint4-integration.test.ts` | Full sprint regression |
| API routes | `api-routes.test.ts` | All routes registered correctly |

### apps/agent-runtime (906 tests)

| Area | Files | Focus |
|---|---|---|
| Execution engine | `execution-engine.test.ts` | Action routing, risk classification |
| LLM adapter | `llm-decision-adapter.test.ts` | Provider selection, failover |
| Role prompts | `role-system-prompts.test.ts` | Prompt retrieval, all 12 roles |
| Pre-task scout | `pre-task-scout.test.ts` | Scout trigger conditions |
| Escalation engine | `escalation-engine.test.ts` | 5 escalation conditions |
| Memory store | `prisma-memory-store.test.ts` | Read/write/relevance ranking |
| Language resolver | `language-resolver.test.ts` | Detection cascade, all 5 languages |
| Post-task closeout | `post-task-closeout.test.ts` | Evidence packaging, quality gate |
| Action result writer | `action-result-writer.test.ts` | Result persistence |
| Action observability | `action-observability.test.ts` | Telemetry emission |
| Evidence assembler | `evidence-assembler.test.ts` | Evidence bundle creation |
| Evidence record writer | `evidence-record-writer.test.ts` | Evidence persistence |
| Evaluator webhook | `evaluator-webhook.test.ts` | External QA notification |
| Local workspace executor | `local-workspace-executor.test.ts` | Shell command execution |
| Skills registry | `skills-registry.test.ts` | Skill registration/retrieval |
| Skill execution engine | `skill-execution-engine.test.ts`, `skill-execution-engine-extended.test.ts` | Skill execution coverage |
| Skill composition | `skill-composition-engine.test.ts` | Multi-skill pipelines |
| Skill pipeline | `skill-pipeline.test.ts` | Pipeline execution |
| Skill scheduler | `skill-scheduler.test.ts` | Cron scheduling |
| Skill dependency DAG | `skill-dependency-dag.test.ts` | Topological sort |
| Multi-agent | `multi-agent-orchestrator.test.ts` | Sub-agent spawning |
| Repo knowledge graph | `repo-knowledge-graph.test.ts` | Graph indexing/querying |
| Provider state | `provider-state-persistence.test.ts` | Cooldown state persistence |
| System prompt builder | `system-prompt-builder.test.ts` | Prompt construction |
| Code review learning | `code-review-learning.test.ts` | Feedback recording |
| Effort estimator | `effort-estimator.test.ts` | Effort estimation |
| Package manager | `package-manager-service.test.ts` | npm/yarn/pnpm detection |
| Web research | `web-research-service.test.ts` | Search + page fetch |
| Vision service | `vision-service.test.ts` | Screenshot analysis |
| Voicebox client | `voicebox-client.test.ts` | TTS client |
| Voxcpm2 client | `voxcpm2-client.test.ts` | Local TTS |
| Speaking agent | `speaking-agent.test.ts` | Meeting participation |
| Meeting transcription | `meeting-transcription.test.ts` | Audio transcription |
| Wake coalescer | `wake-coalescer.test.ts` | Event deduplication |
| Webhook ingestion | `webhook-ingestion.test.ts` | Webhook receipt |
| Workspace rate limiter | `workspace-rate-limiter.test.ts` | Rate limiting |
| Agent feedback | `agent-feedback.test.ts` | Feedback collection |
| Task intelligence | `task-intelligence-memory.test.ts` | Task-specific memory |
| Task progress reporter | `task-progress-reporter.test.ts` | SSE progress |
| Autonomous coding loop | `autonomous-coding-loop.test.ts` | Code iteration loop |
| Autonomous loop orchestrator | `autonomous-loop-orchestrator.test.ts` | Multi-loop coordination |
| Runtime server | `runtime-server.test.ts` | HTTP route validation |
| Desktop operator factory | `__tests__/desktop-operator-factory.test.ts` | Operator selection |
| Desktop action governance | `desktop-action-governance.test.ts` | Governance on desktop actions |

### apps/dashboard (118 tests)

| Area | Files | Focus |
|---|---|---|
| Approval queue panel | `approval-queue-panel.test.ts` | Table display, drawer, packet fields |
| Approval evidence pagination | `approval-evidence-pagination.test.ts` | Evidence page navigation |
| Dashboard navigation | `dashboard-navigation.test.ts` | Nav item generation |
| Dashboard tab storage | `dashboard-tab-storage.test.ts` | Tab persistence |
| Kanban board utils | `kanban-board-utils.test.ts` | Task grouping/reordering |
| Operational signal timeline | `operational-signal-timeline.test.tsx` | Timeline rendering |
| Runtime observability utils | `runtime-observability-utils.test.ts` | Metric formatting |
| Workspace budget panel utils | `workspace-budget-panel-utils.test.ts` | Budget formatting |
| Marketplace entitlements | `marketplace-entitlements.test.ts` | Plan-gated content |
| Route handler core | `route-handler-core.test.ts` | Proxy handler logic |
| Runtime proxy utils | `runtime-proxy-utils.test.ts` | Auth forwarding |

### apps/website (118 tests)

| Area | Files | Focus |
|---|---|---|
| Approvals flow | `approvals-flow.test.ts` | Approval API + UI |
| Connector bot scope | `connectors-bot-scope.test.ts` | Connector permission scoping |
| Deployments flow | `deployments-flow.test.ts` | Deployment lifecycle |
| Deployment history UI | `deployments-history-ui.test.ts` | History table rendering |
| Evidence compliance | `evidence-compliance.test.ts` | Compliance panel |
| Permissions | `permissions.test.ts` | Auth + role checks |
| Provisioning progress UI | `provisioning-progress-ui.test.ts` | Progress card |
| Provisioning worker | `provisioning-worker.test.ts` | Worker step execution |
| Session auth | `session-auth.test.ts` | Token build/verify |
| Signup flow | `signup-flow.test.ts` | Full signup journey |

---

## Environment Variable: `AF_TEST_AFTER_EDIT`

When set, the agent-runtime quality gate runs tests automatically after every code edit:

```bash
AF_TEST_AFTER_EDIT=1 pnpm --filter @agentfarm/agent-runtime test
```

- If tests pass → action marked complete
- If tests fail → agent enters retry loop (max 3 attempts), then escalates

---

## Database Integration Testing

### Permanent Smoke Lane

The DB smoke lane validates real database connectivity and data persistence:

```bash
# Run DB snapshot smoke test (requires live PostgreSQL)
pnpm --filter @agentfarm/agent-runtime exec ts-node src/db-snapshot-smoke.ts

# Apply migrations first
pnpm --filter @agentfarm/db-schema prisma migrate dev

# Validate schema
pnpm --filter @agentfarm/db-schema prisma validate
```

**Smoke lane checks:**
1. Migration applies cleanly
2. Two startup operations persist to DB
3. Snapshot validates stored data matches expected schema

### Deferred Scope

Full DB integration tests (multi-table transactions, cascade deletes, constraint violations) are deferred to a dedicated integration test phase. Unit tests mock Prisma via dependency injection.

---

## E2E Test Coverage

| Test | File | Tool | Status |
|---|---|---|---|
| Full E2E integration | `scripts/e2e-integration.mjs` | Node.js | ✅ Exists |
| E2E smoke | `scripts/e2e-smoke.mjs` | Node.js | ✅ Exists |
| Playwright browser smoke | `apps/agent-runtime/src/e2e-playwright-smoke.ts` | Playwright | ✅ Exists |
| Task planner smoke | `apps/agent-runtime/src/task-planner-smoke.ts` | Node.js | ✅ Exists |
| Mobile drawer E2E | `apps/dashboard/scripts/mobile-drawer-e2e.mjs` | Node.js | ✅ Exists |
| Workspace tab E2E | `apps/dashboard/scripts/workspace-tab-e2e.mjs` | Node.js | ✅ Exists |
| UI smoke | `apps/website/scripts/ui-smoke.mjs` | Node.js | ✅ Exists |
| UI baseline verify | `apps/website/scripts/verify-ui-baseline.mjs` | Node.js | ✅ Exists |
| CI pipeline integration | — | GitHub Actions | NOT FOUND — needs investigation |

---

## Coverage Policy

Coverage thresholds are enforced by `scripts/coverage-threshold-check.mjs` after `pnpm test`.

| Metric | Threshold (target) |
|---|---|
| Statements | NOT FOUND — needs investigation (check coverage-threshold-check.mjs) |
| Branches | NOT FOUND — needs investigation |
| Functions | NOT FOUND — needs investigation |
| Lines | NOT FOUND — needs investigation |

Run the check manually:
```bash
node scripts/coverage-threshold-check.mjs
```

---

## Known Coverage Gaps

| Area | Gap | Priority |
|---|---|---|
| `services/policy-engine` | Only 2 tests — needs negative scenarios for policy rejection | High |
| `services/identity-service` | No tests found | High |
| `services/browser-actions` | No tests found (`web-actions.ts` untested) | Medium |
| `services/compliance-export` | No tests found | Medium |
| `services/retention-cleanup` | No tests found | Medium |
| `services/audit-storage` | Only 3 tests (screenshot-uploader only) | Medium |
| `apps/orchestrator/src/proactive-signal-detector.ts` | No tests | Medium |
| `apps/orchestrator/src/agent-handoff-manager.ts` | No tests | Medium |
| `apps/agent-runtime/src/advanced-runtime-features.ts` | No tests | Low |
| `apps/agent-runtime/src/crm-hook.ts` | No tests | Low |
| `apps/agent-runtime/src/erp-hook.ts` | No tests | Low |
| `apps/agent-runtime/src/structured-telemetry-collector.ts` | No tests | Low |
| `apps/agent-runtime/src/loop-learning-store.ts` | No tests | Low |
| `apps/agent-runtime/src/runtime-audit-integration.ts` | No tests | Low |
| `apps/api-gateway/src/routes/knowledge-graph.ts` | No dedicated test file | Low |
| `apps/api-gateway/src/routes/mcp-registry.ts` | No dedicated test file | Low |
| `apps/api-gateway/src/routes/memory.ts` | No dedicated test file | Low |
| `apps/api-gateway/src/routes/retention-policy.ts` | No dedicated test file | Low |
| Dashboard page routes | Next.js page rendering not unit-tested | Low |

---

## Quality Gate Commands

```bash
# Full quality gate (CI release bar)
pnpm quality:gate

# Lint only
pnpm lint

# Typecheck only
pnpm typecheck

# Test only
pnpm test

# Contract validation (cross-package type compatibility)
node scripts/a4-contract-validation.mjs

# Import boundary check
node scripts/a4-import-boundary-check.mjs

# Coverage threshold check
node scripts/coverage-threshold-check.mjs
```

---

## Import Boundary Rules

Enforced by `tools/eslint-plugin-agentfarm-boundaries.cjs`:

| Rule | Detail |
|---|---|
| No app-to-app imports | `apps/*` packages cannot import from other `apps/*` packages |
| Shared types only | Cross-service communication only via `packages/*` contracts |
| No runtime → gateway imports | `agent-runtime` cannot import from `api-gateway` |
| Services are isolated | `services/*` communicate via queue contracts, not direct imports |

---

## Continuous Integration

| Step | Command | Status |
|---|---|---|
| Install dependencies | `pnpm install` | ✅ Configured |
| Typecheck | `pnpm typecheck` | ✅ Configured |
| Lint | `pnpm lint` | ✅ Configured |
| Test | `pnpm test` | ✅ Configured |
| Contract validation | `node scripts/a4-contract-validation.mjs` | ✅ Configured |
| Import boundary check | `node scripts/a4-import-boundary-check.mjs` | ✅ Configured |
| Coverage threshold | `node scripts/coverage-threshold-check.mjs` | ✅ Configured |
| E2E smoke | `node scripts/e2e-smoke.mjs` | NOT FOUND — needs investigation (CI integration) |
| DB smoke lane | `pnpm --filter @agentfarm/agent-runtime exec ts-node src/db-snapshot-smoke.ts` | NOT FOUND — needs investigation (CI integration) |
| Azure SWA verify | `node scripts/website-swa-verify.mjs` | NOT FOUND — needs investigation |

---

## Tester Agent Actions

The Tester agent (role `tester`) exposes a rich set of workspace actions for QA tasks.
All actions live in `apps/agent-runtime/src/local-workspace-executor.ts`; the allowlist is
enforced in `apps/agent-runtime/src/tester-agent-profile.ts`.

### Confirmed Implemented Actions

| Action | Description | Notes |
|---|---|---|
| `workspace_run_tests` | Run any test command; capture pass/fail/coverage | Core runner |
| `workspace_test_coverage_report` | Parse LCOV/JSON coverage; surface gap lines | Tiers 1–2 |
| `workspace_test_impact_analysis` | BFS transitive import resolver, depth 1–5; finds all affected tests | Fixed Sprint 6 — was filename-grep only |
| `workspace_playwright_test_run` | Run Playwright scripts against a URL; screenshot on failure | |
| `workspace_cypress_test_run` | Run Cypress specs; parse results | |
| `workspace_selenium_test_run` | Run Selenium Java/Python test suite | |
| `workspace_appium_test_run` | Run Appium mobile test suite | |
| `workspace_axe_scan` | WCAG accessibility scan (axe-playwright → axe-cli → curl+regex fallback) | **New in Sprint 6** |
| `workspace_create_bug` | Auto-file defect from test failure to GitHub/Jira/Linear (local JSON fallback) | **New in Sprint 6** |
| `workspace_mutation_test` | Stryker Mutator integration: auto-detect config or generate on-the-fly; reports score + survivor list | **New in Sprint 7** |
| `workspace_contract_test` | Pact consumer/provider contract testing: verify, publish, or generate consumer stub | **New in Sprint 7** |
| `workspace_generate_test` (LLM path) | LLM-guided generation via claude-haiku when `ANTHROPIC_API_KEY` is set; regex fallback always active | **New in Sprint 7** |
| `workspace_visual_regression` | SHA256 exact-match + ImageMagick pixel diff | |
| `workspace_dast_scan` | OWASP ZAP active scan (`AGENTFARM_ZAP_API_URL` env var required); HTTP header passive fallback always available | Env-dependent for active scan |
| `workspace_load_test_run` | Run k6 / Artillery / Locust load tests | |
| `workspace_api_contract_test` | Run Newman (Postman collection) contract test | |
| `workspace_sast_scan` | Static analysis (semgrep / eslint / pattern grep fallback) | |
| `workspace_exploratory_session` | SFDPOT-guided charter builder; accepts `acceptance_criteria`, `story_description`, or `jira_story` | AC ingestion added Sprint 6 |

### SFDPOT Routing — Updated in Sprint 8

Eleven SFDPOT exploration actions were previously mapped to `skip`. Nine now dispatch directly:

| SFDPOT Action | Was | Now |
|---|---|---|
| `Confirm responsive layout at 375px, 768px, 1280px, 1920px` | skip | dispatch → `workspace_playwright_test_run` + `{ viewports: [...] }` |
| `Check focus order is logical (Tab traversal)` | skip | dispatch → `workspace_playwright_test_run` + `{ keyboard_nav: true }` |
| `Test with screen reader role announcements (axe scan)` | skip | dispatch → `workspace_axe_scan` |
| `Verify on iOS Safari (mobile viewport emulation)` | skip | dispatch → `workspace_playwright_test_run` + `{ device: 'iPhone 12' }` |
| `Test on Chrome, Firefox, and Edge` | skip | dispatch → `workspace_playwright_test_run` + `{ browsers: ['chromium','firefox','webkit'] }` |
| `Check with keyboard-only navigation (no mouse)` | skip | dispatch → `workspace_axe_scan` + `{ rules: ['keyboard'] }` |
| `Slow network throttle (Slow 3G) — check loading states` | skip | dispatch → `workspace_playwright_test_run` + `{ cdp_throttle: 'slow3g' }` |
| `Disable JavaScript — assert graceful degradation` | skip | dispatch → `workspace_playwright_test_run` + `{ javascript_disabled: true }` |
| `Session timeout — assert redirect to login without data loss` | skip | dispatch → `workspace_playwright_test_run` + `{ session_expire: true }` |
| `Set system clock to year-end boundary (Dec 31) and verify date pickers` | skip | dispatch → `workspace_playwright_test_run` + `{ fake_date: '2024-12-31' }` |
| `Check "expires in X days" countdown accuracy` | skip | dispatch → `workspace_playwright_test_run` + `{ fake_date: '2024-12-29' }` |
| `Verify timestamps display in the correct timezone` | skip | dispatch → `workspace_playwright_test_run` + `{ fake_timezone: 'America/New_York' }` |
| `Test with DST-transition datetime values` | skip | dispatch → `workspace_playwright_test_run` + `{ fake_date: '2024-11-03' }` |

One skip remains (truly concurrent request execution is outside a single action type):
- `Trigger concurrent requests (double-click submit) — assert no duplicate actions`

### `workspace_playwright_test_run` — Extended in Sprint 8

The action now handles special payload flags injected by SFDPOT dispatch:

| Payload flag | Behaviour |
|---|---|
| `browsers: string[]` | Adds `--project=<browser>` per entry (multi-browser run) |
| `cdp_throttle: 'slow3g'` | Writes a temp Playwright config; exposes `AGENTFARM_CDP_THROTTLE=slow3g` env var for tests |
| `javascript_disabled: true` | Config override: `contextOptions.javaScriptEnabled: false` |
| `fake_date: 'YYYY-MM-DD'` | Sets `AGENTFARM_FAKE_DATE` env var; use `page.clock.setFixedTime(new Date(process.env.AGENTFARM_FAKE_DATE))` in tests |
| `fake_timezone: 'TZ'` | Config override: `use.timezoneId` |
| `session_expire: true` | Config override: `use.storageState: undefined` (clears auth state) |

### Gaps — Resolved in Sprint 8

| Gap | Sprint | What was built |
|---|---|---|
| Test data management | 8 | `workspace_generate_test_data` — seed/reset/generate/list with Prisma + npm script detection; synthetic fixture JSON/SQL/CSV |
| Cross-browser SFDPOT dispatch | 8 | `'Test on Chrome, Firefox, and Edge'` now dispatches with `browsers: ['chromium','firefox','webkit']` |
| 9 more SFDPOT skips | 8 | keyboard-only, throttle, disable-JS, session timeout, clock/DST — all converted to dispatches |
| TestRail / Zephyr fallback | 8 | Both `workspace_test_case_sync` and `workspace_test_run_publish` now write to `.agentfarm/test-registry.json` when connector is absent |
| Coverage-weighted regression | 8 | `workspace_test_impact_analysis` parses `coverage-final.json` / `lcov.info`; returns `coverage_weighted[]` sorted lowest coverage first |
| Mobile real-device | 8 | `workspace_mobile_test` — BrowserStack (Tier 1) → Sauce Labs (Tier 2) → Playwright emulation (Tier 3) |

### Remaining Gaps

| Gap | Status | Notes |
|---|---|---|
| Concurrent request testing | **Infeasible in single action** | Requires orchestration layer above the executor |

> `workspace_mutation_test`, `workspace_contract_test`, and LLM-guided test generation were gaps in Sprint 6 and were fully implemented in Sprint 7. See the "Confirmed Implemented Actions" table above.
