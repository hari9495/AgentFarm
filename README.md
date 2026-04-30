# AgentFarm

> Operate AI agents with enterprise control gates — human approval, audit trails, and governed autonomy from day one.

AgentFarm is a TypeScript pnpm monorepo that delivers a production-grade AI agent platform. The MVP launches one high-quality Developer Agent role with four live connectors, risk-based autonomy, and a full evidence path for compliance.

---

## Full Documentation

→ **[read.md](read.md)** — complete technical overview, architecture, flows, quality posture, and quick start

---

## Architecture at a Glance

```
apps/
  api-gateway/          ← control-plane API (auth, approvals, audit, connector execution)
  agent-runtime/        ← per-tenant execution engine (risk classification, action dispatch)
  dashboard/            ← operator UI (approval queue, evidence, runtime health)
  website/              ← onboarding and product surface
  orchestrator/         ← multi-agent workflow coordinator

services/
  provisioning-service/ ← Azure VM lifecycle and state machine
  approval-service/     ← approval enforcement and kill-switch
  connector-gateway/    ← OAuth, token refresh, adapter dispatch
  policy-engine/        ← policy routing and governance rules
  evidence-service/     ← append-only audit and evidence records
  identity-service/     ← tenant, workspace, user lifecycle
  notification-service/ ← approval and ops notifications

packages/
  shared-types/         ← shared TypeScript contracts and enums
  connector-contracts/  ← normalized connector action types
  queue-contracts/      ← queue event type definitions
  db-schema/            ← Prisma schema and migrations
  observability/        ← structured telemetry helpers
```

---

## Quick Start

```bash
# Install dependencies
pnpm install

# Run API gateway in dev mode
pnpm dev

# Run all tests
pnpm test

# Run typechecks across workspace
pnpm typecheck

# Full quality gate
pnpm quality:gate

# E2E smoke lane
pnpm smoke:e2e
```

Copy `.env.example` to `.env` and fill in values before running.

---

## Key Workflows

| Flow | Description |
|------|-------------|
| **Signup → Provisioning** | User signs up, tenant and workspace are created, bot runtime is provisioned on Azure and tracked through an 11-step state machine |
| **Connector Action** | Runtime requests a normalized action (Jira, Teams, GitHub, email), risk is classified, low-risk executes immediately, medium/high requires an approved approval record |
| **Approval Lifecycle** | Risky actions enter approval intake, immutable approval records are created, approvers decide with optional runtime webhook fanout, escalation enforced by timeout policy |
| **Audit and Evidence** | All actions and decisions write append-only audit events, query API supports filtering and cursor pagination, compliance export to CSV/JSON from dashboard |

---

## Planning and Operations

| Document | Purpose |
|----------|---------|
| [mvp/mvp-scope-and-gates.md](mvp/mvp-scope-and-gates.md) | MVP scope, gates, and success metrics |
| [planning/sprint-1-execution-task-list.md](planning/sprint-1-execution-task-list.md) | Sprint 1 task tracking with status and evidence |
| [planning/architecture-decision-log.md](planning/architecture-decision-log.md) | Architecture decisions (ADR-001 through ADR-007) |
| [planning/product-architecture.md](planning/product-architecture.md) | Full product architecture narrative |
| [planning/engineering-execution-design.md](planning/engineering-execution-design.md) | Engineering execution design |
| [operations/quality/8.1-quality-gate-report.md](operations/quality/8.1-quality-gate-report.md) | Latest quality gate report (all checks passing) |
| [operations/runbooks/website-swa-runbook.md](operations/runbooks/website-swa-runbook.md) | Website SWA deployment runbook |
| [infrastructure/control-plane/README.md](infrastructure/control-plane/README.md) | Control-plane IaC notes |
| [infrastructure/runtime-plane/README.md](infrastructure/runtime-plane/README.md) | Runtime-plane IaC notes |

---

## Quality Posture

- 209 API gateway tests passing, typecheck clean
- 118 agent-runtime tests passing, typecheck clean
- Coverage thresholds enforced on critical backend modules (≥80% line coverage)
- Quality gate runs 30+ checks across all workspace boundaries
- E2E smoke lane validates auth, session, and protected route flows end-to-end

---

## Security Principles

- No connector secrets stored in relational records; only Key Vault references are persisted
- Workspace and tenant scoping enforced at session and route level
- Approval immutability and kill-switch governance built in
- Least-privilege assumptions for all identity and connector paths
- Fail-safe defaults and explicit validation on all inbound payloads

---

## Who This Is For

- **Platform engineers** building governed AI agent systems
- **AI runtime engineers** implementing controlled autonomy with human oversight
- **Security and compliance teams** requiring auditable decision and execution traces
- **Product and operations leads** preparing a pilot-ready enterprise deployment
