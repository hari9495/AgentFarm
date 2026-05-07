# Awesome Copilot Adoption Map for AgentFarm

## Objective
Adopt proven resources from github/awesome-copilot and bind them to AgentFarm domains so Copilot sessions produce more consistent architecture, testing, and delivery outcomes.

## Current Baseline
- Monorepo shape: apps + services + packages + infrastructure.
- Existing CI workflows: `.github/workflows/ci.yml`, `.github/workflows/website-swa.yml`.
- No workspace Copilot customization files currently existed before this plan.

## Priority Resource Mapping (10 items)

1. quality-playbook (skill)
- Source: `skills/quality-playbook/SKILL.md`
- Why: AgentFarm already has quality gate scripts and reporting, so this aligns directly.
- Apply to: `operations/quality/`, `scripts/quality-gate.mjs`, CI gating steps.
- Outcome: A repeatable quality constitution and integration-test protocol for AI-assisted sessions.

2. testing-automation (plugin)
- Source: `plugins/testing-automation/README.md`
- Why: Encourages stronger unit + integration test generation practices across services.
- Apply to: `apps/agent-runtime/`, `apps/api-gateway/`, `services/*`, `apps/website/tests/`.
- Outcome: Better test density on critical control-plane and runtime flows.

3. dependabot (skill)
- Source: `skills/dependabot/references/example-configs.md`
- Why: This repo is a pnpm monorepo and benefits from grouped dependency update strategy.
- Apply to: root and all workspaces under `apps/*`, `services/*`, `packages/*`.
- Outcome: Safer and less noisy dependency maintenance.

4. acquire-codebase-knowledge (skill)
- Source: `skills/acquire-codebase-knowledge/SKILL.md`
- Why: New contributors and AI sessions need fast structure grounding in this multi-service repo.
- Apply to: onboarding and large refactor kickoff prompts.
- Outcome: Faster context ramp-up and fewer wrong assumptions.

5. security-review (skill)
- Source: `docs/README.skills.md` entry for `security-review`
- Why: Connector auth, approvals, and audit evidence paths require periodic security sweeps.
- Apply to: `services/connector-gateway/`, `services/identity-service/`, `services/evidence-service/`, `.github/workflows/`.
- Outcome: Earlier detection of auth, secrets, and data-flow vulnerabilities.

6. azure-static-web-apps (skill)
- Source: `docs/README.skills.md` entry for `azure-static-web-apps`
- Why: Website deployment already uses Azure Static Web Apps.
- Apply to: `apps/website/`, `.github/workflows/website-swa.yml`.
- Outcome: Consistent SWA deployment guidance and fewer environment drift issues.

7. azure-cloud-development (plugin)
- Source: `plugins/azure-cloud-development/README.md`
- Why: Infrastructure folders indicate ongoing Azure infra evolution.
- Apply to: `infrastructure/control-plane/`, `infrastructure/runtime-plane/`.
- Outcome: Better Azure IaC consistency and pre-deployment hygiene.

8. refactor-plan (skill)
- Source: `skills/refactor-plan/SKILL.md`
- Why: Helpful for coordinated changes across apps, services, packages.
- Apply to: larger architectural modifications (for example queue contracts and service boundaries).
- Outcome: Cleaner, phase-based migrations with explicit rollback steps.

9. technical-spike (plugin)
- Source: `plugins/technical-spike/README.md`
- Why: Existing planning docs show active discovery work.
- Apply to: `planning/` for unknown-heavy decisions before implementation.
- Outcome: Better requirement clarity and fewer mid-implementation reversals.

10. typescript-mcp-development (plugin)
- Source: `plugins/typescript-mcp-development/README.md`
- Why: Useful if AgentFarm adds internal MCP servers for orchestration/control integrations.
- Apply to: future `tools/` or `apps/*` MCP-adapter initiatives.
- Outcome: Faster bootstrap of production-ready TypeScript MCP servers.

## Workspace Implementation Created

1. `.github/copilot-instructions.md`
- Global repo operating guidance for Copilot sessions.

2. `.github/instructions/typescript-monorepo.instructions.md`
- TypeScript and boundary rules scoped across apps/services/packages.

3. `.github/instructions/testing-quality-gates.instructions.md`
- Quality gate and test discipline aligned with existing root scripts and CI.

4. `.github/instructions/azure-swa.instructions.md`
- SWA-specific guidance for website and deployment workflow edits.

## Rollout Sequence

1. Keep the four new customization files active for all new AI-assisted work.
2. Install plugin shortlist in this order:
   - `testing-automation@awesome-copilot`
   - `azure-cloud-development@awesome-copilot`
   - `technical-spike@awesome-copilot`
3. Start using quality-playbook outputs under `operations/quality/`.
4. Add a monorepo dependabot configuration once branch policy owners approve update cadence.
5. Add a recurring monthly security-review pass on connector and identity paths.

## Success Metrics (30 days)
- Fewer review cycles caused by missing tests in PRs touching services.
- Reduced CI regressions from dependency churn via grouped update policy.
- Better consistency in SWA workflow and config updates.
- Faster onboarding time for new contributors using explicit Copilot repo guidance.

<!-- doc-sync: 2026-05-06 sprint-6 -->
> Last synchronized: 2026-05-06 (Sprint 6 hardening and quality gate pass).

<!-- doc-sync: 2026-05-06 full-pass-2 -->
> Last synchronized: 2026-05-06 (Full workspace sync pass 2 + semantic sprint-6 alignment).


## Current Implementation Pointer (2026-05-07)
1. For the latest built-state summary and file map, see planning/build-snapshot-2026-05-07.md.
