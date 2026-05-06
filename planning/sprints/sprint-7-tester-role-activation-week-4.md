# Sprint 7 — Week 4: Tester Role Activation

Status: CLOSED  
Closed at: 2026-05-06  
Sprint identifier: sprint-7-week-4-tester-role-activation

## Objective

Activate and harden the Tester role as a first-class runtime profile with explicit capability boundaries, alias support, and regression coverage to prevent accidental privilege drift.

## Delivered

1. Dedicated tester role profile module
- Added a dedicated tester profile source file to centralize Tester role policy.
- Centralized tester connector allowlist, local workspace action allowlist, and supported role aliases.
- Added helper utilities for tester profile normalization and alias detection.

2. Runtime policy wiring for tester profile
- Replaced inline tester connector/action policy definitions in runtime with imports from the new tester profile module.
- Added role-specific connector action overrides to enforce tester guardrails for high-risk connector actions.
- Enforced that tester does not inherit `merge_pr` from generic connector policy.

3. Stronger role alias activation
- Added explicit alias handling for Tester activation paths, including QA-style role names.
- Startup role resolution now consistently maps tester aliases to role key `tester`.

4. Connector contract policy hardening
- Added explicit tester defaults for Jira and Azure DevOps connector action policies in connector contracts.
- Added helper APIs to resolve role-aware connector permissions:
  - `isRoleAllowedForConnector`
  - `getConnectorActionsForRole`

5. Regression tests for Week 4 behavior
- Added runtime startup/capability snapshot test coverage for tester alias activation and guardrail enforcement.
- New assertions verify that tester snapshot includes expected read/test actions and excludes risky actions such as `merge_pr` and code-edit/refactor actions.

## Test Evidence

Targeted package validation:
- `pnpm --filter @agentfarm/agent-runtime typecheck` — PASS
- `pnpm --filter @agentfarm/connector-contracts typecheck` — PASS
- `pnpm --filter @agentfarm/agent-runtime test` — PASS (`580 pass`, `0 fail`)

Monorepo quality gate:
- `pnpm quality:gate` — executed; core test/typecheck lanes passed in captured output.
- Dashboard E2E smoke lane surfaced `ECONNREFUSED` for dashboard API fetches during `test:e2e:workspace-tabs` execution in this environment.

## Files Updated

- `apps/agent-runtime/src/tester-agent-profile.ts` (new)
- `apps/agent-runtime/src/runtime-server.ts`
- `apps/agent-runtime/src/runtime-server.test.ts`
- `packages/connector-contracts/src/index.ts`

## Notes

- Week 4 implementation is additive and keeps existing role architecture intact while making tester policy explicit and testable.
- Connector action override for tester prevents privilege creep where role-level connector access could otherwise inherit broad connector defaults.

<!-- doc-sync: 2026-05-06 sprint-7-week-4 -->
