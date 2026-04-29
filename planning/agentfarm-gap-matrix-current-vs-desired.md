# AgentFarm Gap Matrix (Current vs Desired)

## Purpose
Provide a concrete capability gap matrix mapped to existing AgentFarm apps, services, and shared packages.

## Baseline
- Date: 2026-04-29
- Inputs: architecture baseline, repo/service structure, sprint execution evidence, ADR-007
- Scope guard: MVP freeze remains active (Developer Agent + Jira/Teams/GitHub/company email)

## Legend
- Gap severity: High, Medium, Low
- Change type: Contract, Behavior, Operational, Observability

## Matrix

| Capability | Current State (Evidence) | Desired State | Gap | Severity | Change Type | Affected Apps | Affected Services | Affected Packages |
|---|---|---|---|---|---|---|---|---|
| Atomic task checkout and lease | Task assignment and retries exist in runtime/orchestrator paths, but no explicit lease/renew contract is frozen | Single-claimer task execution with lease renew, lease timeout requeue, and idempotent claim tokens | Missing claim/renew/release contract and race-safe semantics | High | Contract + Behavior | orchestrator, api-gateway | approval-service (for hold/resume interplay) | shared-types, queue-contracts |
| Heartbeat wake model with coalescing | Runtime executes assigned work and emits health; wake-source model not standardized | Wake sources: timer, assignment, on_demand, automation; duplicate wakeups coalesced during active run | Missing canonical wake policy and run dedupe model | Medium | Contract + Behavior | agent-runtime, orchestrator, api-gateway | provisioning-service (pattern reuse) | shared-types, queue-contracts |
| Budget guardrails (hard-stop) | Dashboard has LLM provider presets; no hard budget stop contract across tenant/workspace/bot | Policy-enforced budget thresholds with warning and hard-stop before risky execution | Missing budget policy model and runtime enforcement path | High | Contract + Behavior | dashboard, api-gateway, orchestrator | approval-service, evidence-service | shared-types, observability |
| Provider cooldown classes and reason taxonomy | Auto fallback + health-score reordering live (ADR-007) | Standard failover classes (rate_limit, auth, billing_disable, timeout, provider_unavailable, unclassified) with cooldown persistence | Missing durable reason taxonomy and cooldown state storage | Medium | Contract + Behavior | agent-runtime, api-gateway | evidence-service | shared-types, observability |
| Adapter registry for runtimes/connectors | Provider and connector paths are implemented, but adapter registration is mostly code-wired and static | Registry-driven adapter lifecycle (register/unregister/discover/health-check) surfaced in server and dashboard | Missing central adapter registry contract and management surface | Medium | Contract + Behavior | api-gateway, dashboard, orchestrator | connector-gateway | shared-types, connector-contracts |
| Approval enforcement fidelity | Medium/high approvals required by policy design; runtime blocking contract needs stricter cross-service guarantee | Runtime cannot execute medium/high actions without signed approval artifact; kill-switch precedence enforced | Missing strict enforcement contract and denial reason propagation | High | Contract + Behavior | agent-runtime, api-gateway, dashboard | approval-service, policy-engine | shared-types |
| Evidence completeness at attempt level | Evidence model is append-only and retention policy is defined | Every risky action includes full chain: proposed action -> policy decision -> approval decision -> execution result -> provider attempt details | Missing unified attempt-chain schema and linkage IDs | High | Contract + Observability | api-gateway, agent-runtime, dashboard | evidence-service, approval-service | shared-types, observability |
| Connector execution gating | Connector auth state machine is frozen and implemented in API paths | Runtime blocks connector actions when connector state is token_expired/permission_invalid/revoked/disconnected | Missing strict runtime-side gating check at execution edge for all connectors | Medium | Behavior | agent-runtime, api-gateway | connector-gateway, policy-engine | connector-contracts, shared-types |
| Policy explainability and auditability | Policy engine returns risk + reason; evidence freshness gates defined | Deterministic policy reason codes and policy pack version attached to each approval request and action record | Missing stable reason-code taxonomy and required fields in all records | Medium | Contract | api-gateway, dashboard | policy-engine, approval-service, evidence-service | shared-types |
| Governance KPIs in operator UI | Quality gate reporting exists in operations docs/scripts | Live KPI surfaces: approval P95, risky-action audit completeness, budget block rate, fallback-chain degradation rate | Missing dedicated metrics wiring and dashboard views for governance SLOs | Medium | Observability | dashboard, api-gateway | approval-service, evidence-service | observability |
| External adapter/plugin loading with capability boundaries | Connector and runtime integrations exist, but extension loading boundaries are not a first-class contract | Optional external adapter/plugin loading with explicit capability allowlists, signing/provenance, tenant scoping, and kill-switch controls | Missing plugin trust model, capability boundary schema, and controlled loading pipeline | Medium | Contract + Operational | api-gateway, dashboard, orchestrator | connector-gateway, approval-service | shared-types, connector-contracts, observability |
| Boundary-rule enforcement in CI | Repo boundaries documented in planning docs | Automated checks for forbidden import paths and cross-boundary coupling in CI | Missing codified boundary lint/test checks | Medium | Operational | api-gateway, dashboard, agent-runtime, orchestrator | all services | shared-types, connector-contracts, queue-contracts |

## Highest-Priority Gaps (Must address first)
1. Atomic task checkout + lease (prevents duplicate execution and race-driven incidents).
2. Budget hard-stop policy (prevents runaway spend and unsafe autonomy at scale).
3. Approval enforcement fidelity (ensures risky actions cannot bypass governance).
4. Attempt-chain evidence completeness (supports gate score trust and audit defensibility).

## Non-Goals for this cycle
1. Expanding connector set beyond Jira, Teams, GitHub, company email.
2. Multi-role agent expansion (QA Agent / Manager Agent).
3. Cross-region runtime topology changes.

## Exit Criteria for Gap Closure
1. All high-severity rows have approved shared contracts and passing contract tests.
2. Quality gate includes regression checks for lease semantics, approval enforcement, and evidence completeness.
3. Operations quality report reflects the new governance KPIs with pass/fail thresholds.
