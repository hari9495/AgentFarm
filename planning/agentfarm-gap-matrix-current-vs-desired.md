# AgentFarm Gap Matrix (Current vs Desired)

## Purpose
Provide a concrete capability gap matrix mapped to existing AgentFarm apps, services, and shared packages.

## Baseline
- Date: 2026-04-30
- Inputs: architecture baseline, repo/service structure, sprint execution evidence, ADR-007, Tier 1/2 workspace action implementation
- Scope guard: MVP freeze remains active (Developer Agent + Jira/Teams/GitHub/company email)

## Legend
- Gap severity: High, Medium, Low
- Change type: Contract, Behavior, Operational, Observability
- Status: **Open** = still a gap | **Closed** = implemented and tested

## Closed Gaps (Tier 1/2 Local Workspace Actions — 2026-04-30)

| Capability | Prior State | Implemented | Actions | Risk | Status |
|---|---|---|---|---|---|
| Workspace file discovery | No file listing; agent had to assume paths | Recursive walk with depth/pattern/include_dirs filters | `workspace_list_files` | low | **Closed** |
| Workspace code search | No way to search for symbols or patterns in workspace | Regex grep with context lines and max_results cap | `workspace_grep` | low | **Closed** |
| File rename/move | No file movement operations; agent could only create/overwrite | Move/rename within sandbox with parent dir auto-creation | `file_move` | medium | **Closed** |
| File deletion | No file deletion; agent accumulated stale files | Recursive-safe deletion with force:true | `file_delete` | medium | **Closed** |
| Dependency installation | No way to install packages from inside agent | Auto-detects pnpm/yarn/npm/pip/go/cargo from lockfiles | `workspace_install_deps` | medium | **Closed** |
| Lint execution | No linting in agent loop; validation only ran build/test | ESLint (default) + fix mode + file targeting + auto command | `run_linter` | medium | **Closed** |
| Unified diff application | No `git apply` path; agent could only overwrite files | Writes to temp diff file, applies via git apply, auto-cleans | `apply_patch` | medium | **Closed** |
| Git stash for WIP isolation | No safe checkpoint before risky edits without a commit | push/pop/list/drop stash operations | `git_stash` | medium | **Closed** |
| Structured git history | No commit history visibility; agent could not inspect recent work | JSON array `[{hash, short_hash, subject, author_name, author_email, date}]` | `git_log` | low | **Closed** |
| Project discovery / stack detection | Agent had to guess language/framework from file names | JSON summary: language, framework, package_manager, scripts, readme_excerpt | `workspace_scout` | low | **Closed** |
| Safe WIP rollback branches | No git-native rollback before autonomous loops | Creates `agentfarm/checkpoints/<name>` branch; restore via reset --hard | `workspace_checkpoint` | medium | **Closed** |

All 11 actions are covered by tests in `apps/agent-runtime/src/local-workspace-executor.test.ts` (118 tests, 0 failures as of 2026-04-30).

## Open Gaps

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

<!-- doc-sync: 2026-05-06 sprint-6 -->
> Last synchronized: 2026-05-06 (Sprint 6 hardening and quality gate pass).

<!-- doc-sync: 2026-05-06 full-pass-2 -->
> Last synchronized: 2026-05-06 (Full workspace sync pass 2 + semantic sprint-6 alignment).
