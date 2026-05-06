---
description: "Testing and quality gate discipline for AgentFarm CI and local validation"
applyTo: "apps/**/*.test.ts,apps/**/*.spec.ts,services/**/*.test.ts,services/**/*.spec.ts,apps/website/tests/**/*.ts,scripts/**/*.mjs,.github/workflows/**/*.yml,operations/quality/**/*.md"
---

## Test Strategy
- Add tests for behavior changes, especially around approval, provisioning, identity, and evidence paths.
- Favor scenario-driven assertions over implementation-coupled assertions.
- Cover unhappy paths and permission failures, not only successful flows.

## Quality Gate Alignment
- Keep local validation aligned with root scripts: `pnpm test`, `pnpm typecheck`, and `pnpm quality:gate`.
- If CI commands change, update related operational docs in `operations/quality/`.
- Avoid introducing workflow steps that bypass existing quality scripts without clear rationale.

## CI Workflow Edits
- Preserve deterministic installs and explicit Node/pnpm versions.
- Keep workflow changes minimal and explain why each new step is needed.
- Ensure path filters include all impacted directories when adding new checks.

## Regression Prevention
- For bug fixes, add a regression test that fails before the fix and passes after.
- For cross-service changes, validate upstream and downstream contract behavior.

<!-- doc-sync: 2026-05-06 sprint-6 -->
> Last synchronized: 2026-05-06 (Sprint 6 hardening and quality gate pass).

<!-- doc-sync: 2026-05-06 full-pass-2 -->
> Last synchronized: 2026-05-06 (Full workspace sync pass 2 + semantic sprint-6 alignment).
