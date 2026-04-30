# AgentFarm

AgentFarm is a TypeScript pnpm monorepo for operating AI agents with enterprise control gates.

The MVP delivers one production-grade role first (Developer Agent), then expands safely.

## What We Built

### MVP Outcome
- One high-quality Developer Agent role
- Four production connectors for action execution
  - Jira
  - Microsoft Teams
  - GitHub
  - Company email workflow
- Risk-based autonomy model
  - Low-risk actions execute directly
  - Medium and high-risk actions are routed through human approval
- Full audit and evidence path
  - Action events
  - Approval decisions
  - Query and export capabilities for compliance

### Core Product Capabilities
- Tenant and workspace onboarding with authenticated sessions
- Runtime provisioning lifecycle and monitoring
- Connector authentication, token lifecycle, and health remediation
- Normalized connector action execution API
- Approval intake, queue, decisions, escalation, and decision webhooks
- Append-only audit ingestion, query, retention cleanup
- Evidence and compliance dashboard views
- Website and dashboard user experience for operators and approvers

## Product Goals and Gates

The MVP is intentionally governance-first.

### Included in MVP
- Role-based task handling
- Identity setup behavior standards
- Human approval flow for risky actions
- Action logs and audit trail
- Weekly quality reporting
- Connector contracts for Jira, Teams, GitHub, and company email
- Evidence records for active release gates

### Explicitly Not Included in MVP
- Multi-role launch at once
- Deep enterprise customizations
- Large analytics suite
- Advanced multi-region scaling
- Live meeting voice participation
- HR interview automation mode

### Launch Gate Themes
- Identity realism
- Role fidelity and task quality
- Autonomy with human approval
- No critical security issues
- Pilot readiness
- Architecture gate approvals
- Architecture exit criteria complete

## System Architecture

AgentFarm is organized into control-plane, runtime-plane, and evidence-plane concerns.

### Monorepo Boundaries
- apps
  - Deployable app surfaces and runtime entrypoints
- services
  - Domain services for identity, provisioning, approvals, policies, connectors, evidence, notifications
- packages
  - Shared types, contracts, schema, and observability
- infrastructure
  - Azure control-plane and runtime-plane IaC

### Main Applications
- apps/api-gateway
  - Primary API surface
  - Auth, session scope, route orchestration, connector execution, approvals, audit endpoints
- apps/agent-runtime
  - In-runtime execution engine for the Developer Agent
  - Risk classification and action orchestration
- apps/dashboard
  - Operator and governance interface
  - Approval queue, evidence views, runtime and deployment visibility
- apps/website
  - Product and onboarding web experience
- apps/orchestrator
  - Workflow coordination layer for multi-agent/runtime orchestration

### Domain Services
- services/identity-service
  - Tenant/workspace/user lifecycle
- services/provisioning-service
  - Provisioning state machine, bootstrap, cleanup, SLA checks
- services/approval-service
  - Approval enforcement and kill-switch governance
- services/policy-engine
  - Policy routing and governance checks
- services/connector-gateway
  - Connector auth and adapter flows
- services/evidence-service
  - Evidence and KPI governance events
- services/notification-service
  - Approval and ops notifications

### Shared Packages
- packages/shared-types
  - Shared contracts and enums
- packages/connector-contracts
  - Connector action and result contract definitions
- packages/queue-contracts
  - Queue event contracts
- packages/db-schema
  - Prisma schema and migrations
- packages/observability
  - Structured telemetry and observability helpers

## Key Runtime Flows

### 1. Signup to Operational Workspace
1. User signs up
2. Tenant and workspace entities are created
3. Provisioning job is enqueued
4. Runtime resources move through state transitions
5. Dashboard reflects live provisioning status and remediation hints on failure

### 2. Connector Action Execution with Governance
1. Runtime requests action execution through API gateway
2. Role policy and connector policy are checked
3. Action risk is classified
4. For medium/high actions, approval is required when approval enforcement is configured
5. Approved actions execute and write success audit events
6. Failed actions write failure audit events with mapped severity and reason

### 3. Approval Lifecycle
1. Risky action enters approval intake
2. Approval record is created and remains immutable for guarded fields
3. Approver decides approve/reject/timeout reject with required rationale on rejecting outcomes
4. Decision can notify runtime by webhook
5. Escalation endpoint marks overdue pending approvals according to timeout policy

### 4. Audit and Evidence
1. Events are appended to audit storage
2. Query API supports filtering and cursor pagination
3. Retention cleanup supports dry-run and delete execution
4. Dashboard supports freshness tracking, filtering, and export for compliance

## Security and Reliability Posture

- No connector secrets stored directly in relational records; references are persisted and resolved through secret storage flows
- Workspace and tenant scoping enforced through session and route checks
- Approval immutability and kill-switch patterns included
- Error classification for connector failures (permission, timeout, provider limits, transient failures)
- Retry and backoff paths for transient execution errors
- State-machine cleanup and rollback handling for provisioning failures

## Quality and Test Discipline

### Monorepo Quality Commands
- pnpm build
- pnpm test
- pnpm typecheck
- pnpm quality:gate
- pnpm smoke:e2e
- pnpm verify:website:prod

### Current Validation Profile
- Dedicated quality gate report with broad checks across API gateway, runtime, dashboard, website, services, contracts, and policy modules
- Coverage thresholds enforced on critical backend targets
- E2E smoke lane validates core auth/session and protected route behavior

## Repository Quick Start

### Prerequisites
- Node.js LTS
- pnpm (workspace package manager)
- Optional local database/runtime dependencies for full integration paths

### Install
1. pnpm install

### Run Common Workflows
- API gateway dev mode
  - pnpm dev
- Full workspace test sweep
  - pnpm test
- Workspace typecheck
  - pnpm typecheck
- Release quality gate
  - pnpm quality:gate

## Environment and Configuration Notes

- Use .env.example as baseline for environment setup
- Keep secrets out of source files and environment examples
- Follow least-privilege assumptions for connector credentials and identity paths
- Keep app to service boundaries explicit through shared contracts in packages

## Deployment and Operations

- Infrastructure is separated by control-plane and runtime-plane boundaries
- Website includes static web app deployment workflow and production verification script
- Operations runbooks and quality reports are maintained under operations

## Current Delivery Snapshot

- Most MVP build tracks are complete and validated in local quality gates
- Remaining launch-readiness work is primarily release-operations execution and external platform steps (production deployment wiring, domain and DNS, and final security/load/evidence signoff artifacts)

## Who This Repository Is For

- Platform engineers building controlled AI agent systems
- AI runtime engineers implementing governed autonomy
- Security and compliance teams requiring auditable decision and execution traces
- Product and operations leads preparing pilot-ready enterprise delivery

---

If you want, the next step is to add a concise README.md that links to this detailed read.md plus a docs index for Architecture, Runbooks, and Quality Evidence.