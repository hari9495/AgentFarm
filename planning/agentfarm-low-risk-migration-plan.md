# AgentFarm Low-Risk Migration Plan (Boundary-Safe)

## Purpose
Migrate AgentFarm toward stronger orchestration/governance patterns with minimal operational risk and no boundary violations across apps, services, and shared packages.

## Guardrails (Non-Negotiable)
1. `apps/dashboard` calls only `apps/api-gateway`.
2. Services exchange contracts only via shared packages; no private cross-service imports.
3. Connector-specific payload shapes remain inside `services/connector-gateway` and `packages/connector-contracts`.
4. Evidence remains append-only and is written via approved APIs/queues only.
5. Policy decision source of truth remains `services/policy-engine`.
6. Runtime executes actions; orchestration decisions remain in control-plane orchestrator/services.

## Migration Strategy
- Pattern: contract-first -> shadow mode -> canary -> staged rollout -> cleanup.
- Safety posture: feature flags for all enforcement behavior.
- Rollback posture: each phase has explicit abort and rollback path.

## Adoption Phase Mapping (Requested)
1. Phase 1 (immediate)
- Run-lock and atomic checkout semantics.
- Cost policy warning + hard-stop around Auto provider mode.
- Structured fallback reason taxonomy for provider routing.
2. Phase 2
- Adapter registry for runtimes/connectors (server + dashboard surface).
- Heartbeat wake modes and coalescing policy.
3. Phase 3
- Routine scheduler and stronger org-level governance workflows.
- Optional external adapter/plugin loading with explicit capability boundaries.

## Phase 0: Guardrail Automation (2-3 days)
### Actions
1. Add CI checks for forbidden import paths across app/service boundaries.
2. Add contract ownership checks to enforce shared-package imports.
3. Add feature flags for lease enforcement, budget hard-stop, approval strict mode, scheduler.

### Exit criteria
1. CI fails on boundary violations.
2. New feature flags default to safe-off.

### Rollback
1. Keep checks warning-only for first CI cycle if false positives occur, then switch to blocking.

## Phase 1: Contract Introduction (Sprint A, week 1)
### Actions
1. Introduce shared schemas for task lease, budget decision, failover reason taxonomy, approval artifact linkage.
2. Add backward-compatible readers in API Gateway and Runtime.
3. Keep current behavior unchanged while contracts are dual-read/dual-write where needed.

### Exit criteria
1. Typecheck and contract tests pass in affected workspaces.
2. No user-visible behavior change with flags off.

### Rollback
1. Disable dual-write path and retain existing payload handling.

## Phase 2: Shadow-Mode Enforcement (Sprint A, week 2)
### Actions
1. Evaluate lease and budget decisions in shadow mode (log-only).
2. Capture failover taxonomy and cooldown decisions without hard blocking.
3. Compare shadow decisions against live execution outcomes.
4. Add adapter registry contracts and shadow-mode adapter resolution in API Gateway/orchestrator.
5. Add heartbeat wake mode and coalescing contracts in shadow mode.

### Exit criteria
1. Shadow mismatch rate is below agreed threshold for 5 business days.
2. No increase in failed task completion due to instrumentation overhead.

### Rollback
1. Disable shadow evaluators via flags and keep telemetry-only logging.

## Phase 3: Internal Canary Enforcement (Sprint B, week 1)
### Actions
1. Enable strict lease enforcement for internal/canary tenants.
2. Enable budget hard-stop and approval strict mode for canary tenants.
3. Run controlled chaos drills: provider outage, budget breach, approval delay.
4. Canary adapter registry operations (register/unregister/discover) with audit logs.
5. Canary heartbeat wake/coalescing behavior under load.

### Exit criteria
1. Governance KPIs remain within targets during canary window.
2. Drill outcomes are reproducible with complete evidence trails.

### Rollback
1. Tenant-scoped flag rollback restores prior execution path within one deploy.

## Phase 4: Progressive Rollout and KPI Activation (Sprint B, week 2)
### Actions
1. Expand enforcement to pilot tenants in staged cohorts.
2. Activate governance KPI dashboards and weekly export pipeline.
3. Keep routine scheduler feature-flagged and allowlist-only.
4. Enable stronger org-level governance workflows for pilot cohorts.
5. Keep external adapter/plugin loading disabled unless explicit allowlist and trust checks pass.

### Exit criteria
1. No critical incidents attributable to new enforcement controls.
2. Risky-action evidence completeness target remains met.

### Rollback
1. Revert cohort flags to canary-only and disable scheduler allowlist.

## Phase 5: Stabilization and Cleanup (post Sprint B)
### Actions
1. Remove deprecated payload paths after stability window.
2. Convert shadow-mode checks to permanent regression tests.
3. Update ADRs, risk register, and runbooks with final operating mode.
4. Optionally enable external adapter/plugin loading for approved cohorts with capability-boundary enforcement.

### Exit criteria
1. All legacy paths removed without contract regressions.
2. Governance and quality reports reflect the final state.

## Boundary-Safe Change Map

| Change Area | Allowed Location | Explicitly Not Allowed |
|---|---|---|
| Task lease and orchestration contracts | `packages/shared-types`, `packages/queue-contracts`, `apps/orchestrator`, `apps/api-gateway` | Runtime-only private schemas used as cross-service contract |
| Budget policy and enforcement | `services/approval-service`, `apps/agent-runtime`, `apps/api-gateway`, `apps/dashboard` | Direct dashboard reads from service databases |
| Failover reason taxonomy | `apps/agent-runtime`, `packages/shared-types`, `services/evidence-service` | Connector-specific reason schemas in shared global types |
| Approval strict runtime gate | `services/approval-service`, `services/policy-engine`, `apps/agent-runtime` | Runtime self-approval or policy bypass |
| Governance KPI dashboards | `packages/observability`, `apps/dashboard`, `apps/api-gateway` | Direct service-to-dashboard metric side channels |

## Change Control and Evidence Requirements
1. Any gate-impacting behavior change requires same-day ADR and risk register update.
2. Every phase close must attach quality-gate evidence (tests/typecheck/smoke).
3. Production rollout decisions require explicit signoff by Engineering Lead and Security and Safety Lead.

<!-- doc-sync: 2026-05-06 sprint-6 -->
> Last synchronized: 2026-05-06 (Sprint 6 hardening and quality gate pass).
