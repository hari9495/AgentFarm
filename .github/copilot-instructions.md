# AgentFarm Copilot Instructions

## Project Context
AgentFarm is a TypeScript pnpm monorepo with these primary boundaries:
- apps: user-facing and runtime applications
- services: domain services for control and evidence planes
- packages: shared contracts, schema, and observability libraries
- infrastructure: Azure control-plane and runtime-plane IaC

## Core Expectations
- Preserve clear boundaries between apps, services, and shared packages.
- Prefer extending shared contracts in `packages/*` rather than duplicating types.
- Keep changes scoped and avoid broad refactors unless explicitly requested.
- Maintain existing script and workflow conventions before introducing new tooling.

## Architecture Rules
- Dashboard and website clients should consume APIs through gateway contracts.
- Service-to-service assumptions must be explicit in shared types and queue contracts.
- Evidence and approval flows are reliability-critical; prioritize correctness over speed.
- Avoid introducing hidden coupling between runtime-plane and control-plane modules.

## Quality Rules
- For behavior changes, add or update tests in the nearest package/app.
- Treat `pnpm quality:gate` as the release-quality bar for meaningful changes.
- Keep lint/typecheck/test fixes in the same change when they are caused by your edits.

## Security Rules
- Never hardcode credentials, tokens, or tenant secrets.
- Follow least-privilege assumptions in identity, connector, and provisioning paths.
- Prefer explicit validation and fail-safe defaults for inbound payloads.

## Documentation Rules
- Update nearby planning or operations docs when architecture-level behavior changes.
- Keep runbooks and quality docs aligned with actual scripts and workflow names.

<!-- doc-sync: 2026-05-06 sprint-6 -->
> Last synchronized: 2026-05-06 (Sprint 6 hardening and quality gate pass).

<!-- doc-sync: 2026-05-06 full-pass-2 -->
> Last synchronized: 2026-05-06 (Full workspace sync pass 2 + semantic sprint-6 alignment).
