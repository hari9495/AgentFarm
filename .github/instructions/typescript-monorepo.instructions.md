---
description: "TypeScript monorepo engineering guidance for apps, services, and shared packages"
applyTo: "apps/**/*.ts,apps/**/*.tsx,services/**/*.ts,packages/**/*.ts,scripts/**/*.mjs,.github/workflows/**/*.yml"
---

## Monorepo Boundaries
- Keep domain logic inside its owning app or service.
- Move truly shared contracts to `packages/shared-types`, `packages/queue-contracts`, or `packages/connector-contracts`.
- Do not import from another service's internal files.

## Type Safety
- Prefer explicit interfaces and discriminated unions for cross-service contracts.
- Avoid `any` unless a typed boundary adapter is impossible.
- Preserve strict null-safe handling and explicit error paths.

## API and Contract Discipline
- Treat API and queue payloads as versioned contracts.
- When changing payload shape, update producers and consumers in the same change.
- Keep data mapping logic near boundary layers, not scattered through business code.

## Operational Reliability
- Add structured logs around workflow transitions and external calls.
- Preserve idempotent behavior for provisioning and retry-capable operations.
- Guard side effects with explicit checks and clear failure handling.

## Change Hygiene
- Keep pull requests focused on one architectural concern.
- Prefer minimal diff changes over stylistic churn.
- If a behavior change is introduced, add corresponding test coverage.

<!-- doc-sync: 2026-05-06 sprint-6 -->
> Last synchronized: 2026-05-06 (Sprint 6 hardening and quality gate pass).

<!-- doc-sync: 2026-05-06 full-pass-2 -->
> Last synchronized: 2026-05-06 (Full workspace sync pass 2 + semantic sprint-6 alignment).
