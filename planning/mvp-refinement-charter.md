# AgentFarm MVP Refinement Charter

## Purpose
Keep all current work strictly inside approved MVP boundaries.

## Active Focus (Locked)
1. Keep only MVP documentation refinement.
2. Do not add any feature beyond current MVP boundaries.
3. Create execution tasks only for already approved MVP items.

## Approved MVP Boundary
### Role
1. Developer Agent only.

### Connectors
1. Jira
2. Microsoft Teams
3. GitHub
4. Company email

### Mandatory MVP Capabilities
1. Role-based task handling.
2. Human approval flow for medium and high-risk actions.
3. Action and approval audit evidence.
4. Runtime provisioning visibility and health status.
5. Connector activation and connector health visibility.

### Explicitly Out of Scope
1. Multi-role orchestration.
2. Live meeting voice participation.
3. HR interview automation mode.
4. Advanced multi-region scaling.
5. New connectors beyond approved four.

## Documentation Refinement Rules
1. Refine wording, completeness, and consistency only.
2. Resolve contradictions across planning docs on the same day.
3. Do not insert new product promises without ADR approval.
4. Keep release-gate language unchanged unless formally approved.
5. Keep architecture model unchanged: shared control plane plus isolated runtime.

## Execution Task Creation Rules
1. Every task must map to an approved section in current docs.
2. Every task must include a source reference path.
3. If a task cannot be mapped to an approved section, reject it as out of scope.
4. No task may introduce new role, connector, or surface area.
5. Security and evidence controls are required acceptance criteria where applicable.

## Change Control Guardrail
Any proposal that changes scope, release gates, or architecture boundaries must be parked and reviewed through ADR plus risk register update before entering active work.

## Review Cadence
1. Scope check in Sunday planning sync.
2. Drift check in Friday demo and review.
3. Monthly reconfirmation of MVP boundary before roadmap changes.

## Owner Accountability
1. Product Lead: scope integrity.
2. Engineering Lead: execution task discipline.
3. Security and Safety Lead: risk and control integrity.
4. Architecture Owner: architecture consistency across documents.

## Current State
1. Charter status: Active.
2. Effective date: 2026-04-19.
3. Next review date: 2026-05-03.
