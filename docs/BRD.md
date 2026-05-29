> **Status:** Sprint 18 complete. See [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) for the authoritative status tracker.
# AgentFarm Business Requirements Document (BRD)

> Last updated: 2026-05-29 (Sprint 18)

---

## Executive Summary

AgentFarm is a multi-tenant AI agent platform that deploys specialized autonomous agents (bots) into enterprise workspaces. Each bot operates within a defined role â€” developer, tester, recruiter, sales rep, and nine others â€” executing tasks autonomously, seeking human approval for high-risk actions, and producing an immutable evidence trail for every change it makes.

The platform is designed for software teams, operations teams, and enterprise organizations that need to scale human capacity through trustworthy automation. Unlike general-purpose AI chat tools, AgentFarm agents are:
- **Role-scoped:** Each agent has a fixed role with explicit goals, priorities, and constraints.
- **Approval-gated:** High-risk and medium-risk actions require human approval before execution.
- **Evidence-backed:** Every action produces screenshots, diffs, test results, and audit logs.
- **Multi-provider:** Agents use the best available LLM automatically, with health-score failover.

---

## Business Objectives

| # | Objective | Metric | Target |
|---|---|---|---|
| 1 | Deploy autonomous agents that complete real engineering tasks without human prompting | Tasks completed per agent per day | â‰¥ 10 per workspace |
| 2 | Maintain enterprise trust through approval-gated high-risk actions | Approval bypass rate | 0% |
| 3 | Provide full evidence trail for every agent action | Evidence completeness rate | 100% of actions |
| 4 | Support multi-tenant SaaS with tenant isolation | Cross-tenant data leakage incidents | 0 |
| 5 | Enable self-service onboarding in < 10 minutes | Time to first deployed bot | < 10 minutes |
| 6 | Reach 99.9% uptime for agent execution pipeline | Monthly uptime | â‰¥ 99.9% |
| 7 | Support 12 agent roles covering all major enterprise functions | Role coverage | 12 roles live |
| 8 | Integrate with 9+ external connectors out of the box | Connector count | â‰¥ 9 live |

---

## Stakeholders

| Role | Responsibility | Interaction Point |
|---|---|---|
| **Tenant Admin** | Configures workspaces, assigns bots, sets approval policies | Admin panel (`/admin`) |
| **Operator / Reviewer** | Reviews and approves/rejects agent actions | Dashboard approval queue |
| **Developer (Bot User)** | Bot assigned to their repo â€” reviews PRs, fixes bugs | GitHub integration + dashboard |
| **Platform Engineer** | Deploys and maintains the AgentFarm infrastructure | Runbooks, `pnpm quality:gate`, Azure IaC |
| **Superadmin** | Full platform access â€” manages all tenants, billing, fleet | `/admin/superadmin` |
| **Finance / Legal** | Reviews billing, contract signing (ZohoSign), compliance exports | Billing panel + ZohoSign |
| **Compliance Officer** | Reviews audit logs, evidence bundles, retention policies | Audit log + evidence viewer |

---

## Functional Requirements

### FR-01: Agent Execution Pipeline

| Requirement | Status |
|---|---|
| Agent receives task via HTTP, queue, webhook, Slack, or email | âœ… Done |
| Agent scouts workspace before editing code (`pre-task-scout`) | âœ… Done |
| Agent selects the best LLM provider via health-score failover | âœ… Done |
| Agent executes actions classified by risk level | âœ… Done |
| High-risk actions require approval before execution | âœ… Done |
| Agent runs post-task quality gate (build + lint + test) | âœ… Done |
| Agent generates structured approval packet after each task | âœ… Done |
| Agent escalates after â‰¥ 3 retries or â‰¥ 2 rejected approvals | âœ… Done |
| Agent persists memory across tasks (short-term + long-term) | âœ… Done |
| Agent can spawn sub-agents for parallel execution | âœ… Done |

### FR-02: Approval and Evidence System

| Requirement | Status |
|---|---|
| Approval queue visible in dashboard with structured packet fields | âœ… Done |
| Approval packet includes: change_summary, impacted_scope, risk_reason, proposed_rollback, lint_status, test_status | âœ… Done |
| Evidence bundle includes: screenshots (before/after), diffs, test results | âœ… Done |
| Evidence viewer with pagination in dashboard | âœ… Done |
| Compliance export (CSV/JSON) for audit regulators | âœ… Done |
| Batch approval for bulk review | âœ… Done |
| Governance workflow routing based on risk/role | âœ… Done |
| Retention policy per session (never_delete / auto_delete / manual) | âœ… Done |

### FR-03: Connector System

| Requirement | Status |
|---|---|
| GitHub connector: issues, PRs, commits, workflow runs | âœ… Done |
| Slack connector: messages, channels | âœ… Done |
| Azure DevOps connector: work items, PRs | âœ… Done |
| Confluence connector: pages | âœ… Done |
| Email connector: IMAP/SMTP | âœ… Done |
| Linear connector: issues | âœ… Done |
| Notion connector: pages | âœ… Done |
| PagerDuty connector: incidents, alerts | âœ… Done |
| Sentry connector: error issues | âœ… Done |
| OAuth token lifecycle (auto-refresh before expiry) | âœ… Done |
| PII filtering on all connector responses | âœ… Done |
| mTLS verification for enterprise connectors | âœ… Done |

### FR-04: Authentication and Session

| Requirement | Status |
|---|---|
| HMAC-SHA256 session tokens (format: `v1.{payload}.{sig}`) | âœ… Done |
| Timing-safe token comparison | âœ… Done |
| Cookie-based session with httpOnly / sameSite | âœ… Done |
| Dual session cookies: `agentfarm_session` + `agentfarm_internal_session` | âœ… Done |
| Internal login policy (IP/MFA restrictions) | âœ… Done |
| Open redirect protection on login `?from=` parameter | âœ… Done |
| Argon2 password hashing | âœ… Done |

### FR-05: Provisioning

| Requirement | Status |
|---|---|
| Self-service signup creates tenant + workspace | âœ… Done |
| VM provisioning via Azure ARM API | âœ… Done |
| State-machine provisioning job (pending â†’ running â†’ complete / failed) | âœ… Done |
| Provisioning retry on failure | âœ… Done |
| Admin-triggered re-provisioning | âœ… Done |
| Provisioning health monitoring with alerts | âœ… Done |

### FR-06: Billing and Payments

| Requirement | Status |
|---|---|
| Plan management: Starter / Professional / Enterprise | âœ… Done |
| Stripe payment processing | âœ… Done |
| Razorpay payment processing | âœ… Done |
| Order â†’ Invoice lifecycle | âœ… Done |
| ZohoSign contract e-signature for Enterprise plans | âœ… Done |
| Webhook handlers for payment events | âœ… Done |
| Webhook handler for ZohoSign signature completion | âœ… Done |

### FR-07: Multi-Language Support

| Requirement | Status |
|---|---|
| Unicode-based language detection (ja, ko, ar, hi, en) | âœ… Done |
| Language cascade: audio â†’ text â†’ user â†’ workspace â†’ tenant â†’ default | âœ… Done |
| Per-workspace and per-tenant language overrides | âœ… Done |

### FR-08: Desktop and Browser Automation

| Requirement | Status |
|---|---|
| Mock desktop operator for dev/CI | âœ… Done |
| Playwright browser operator for production | âœ… Done |
| Before/after screenshot capture for every action | âœ… Done |
| Screenshot upload to Azure Blob Storage | âœ… Done |
| Correctness scoring from screenshot diffs | âœ… Done |
| Full audit trail per browser session and action | âœ… Done |
| Session recording (MP4) with signed URL | âœ… Done |

### FR-09: Trigger System

| Requirement | Status |
|---|---|
| Webhook trigger source (HMAC-SHA256 verified) | âœ… Done |
| Slack trigger source (Events API + challenge verification) | âœ… Done |
| Email trigger source (IMAP polling) | âœ… Done |
| LLM-based multi-tenant event routing | âœ… Done |
| Single-tenant shortcut bypasses LLM routing | âœ… Done |
| Agent reply routing back to source channel | âœ… Done |

### FR-10: MCP (Model Context Protocol)

| Requirement | Status |
|---|---|
| Tenant MCP server registry | âœ… Done |
| Agent runtime discovery of MCP tools | âœ… Done |
| MCP tool invocation from agent execution engine | âœ… Done |
| Voicebox registered as MCP tool | âœ… Done |

### FR-11: Observability

| Requirement | Status |
|---|---|
| Structured telemetry emission per action | âœ… Done |
| Runtime observability dashboard panel | âœ… Done |
| Governance KPI panel (approval rates, time-to-approve, risk scores) | âœ… Done |
| SSE-based real-time task progress stream | âœ… Done |
| LLM quality tracking per provider | âœ… Done |

---

## Non-Functional Requirements

| Requirement | Target | Status |
|---|---|---|
| **Availability** | 99.9% monthly uptime for agent pipeline | NOT FOUND â€” needs investigation (no SLO monitoring configured yet) |
| **Latency** | Task submission to first action < 2s | NOT FOUND â€” needs investigation |
| **Security** | Zero hardcoded credentials; all secrets via env/vault | âœ… Enforced by security rules |
| **Security** | OWASP Top 10 compliance | âœ… Coding standard |
| **Isolation** | Strict tenant isolation at DB and API level | âœ… Enforced via tenantId on all queries |
| **Scalability** | Horizontal scale of agent-runtime via container replicas | âœ… Azure Container Instances / AKS supported |
| **Auditability** | Immutable audit log for every agent action | âœ… Done |
| **Data Retention** | Configurable retention per session (never / N days / manual) | âœ… Done |
| **TypeScript Strict** | `strict: true` enforced across all packages | âœ… Enforced in tsconfig.base.json |
| **Test Coverage** | Minimum coverage enforced by `scripts/coverage-threshold-check.mjs` | âœ… Done |
| **Import Boundaries** | No cross-domain imports enforced by ESLint plugin | âœ… Done |

---

## Current System Status

### âœ… Complete and Production-Ready

- Agent execution pipeline (all 12 roles, 8+ LLM providers, health failover)
- Approval and evidence system (structured packets, evidence viewer, compliance export)
- All 9 connectors with OAuth lifecycle
- Authentication and session management
- Provisioning pipeline (VM + state machine)
- Billing: Stripe + Razorpay + ZohoSign
- Trigger system (webhook + Slack + email)
- Desktop/browser automation (mock + Playwright)
- Multi-language support (5 languages + cascade)
- MCP server registry
- Skill system (skills registry, pipeline, scheduler, DAG)
- Multi-agent orchestration
- Memory system (short-term + long-term + repo knowledge)
- Notification system (5 channels)
- Governance workflows and KPIs
- Retention policy system
- Compliance export

### ðŸ”„ In Progress

- Azure Static Web App deployment verification (`scripts/website-swa-verify.mjs`)
- Superadmin fleet management UI
- Session replay player in dashboard (components exist, backend integration status: NOT FOUND â€” needs investigation)

### âŒ Known Gaps / TODO

| Gap | Notes |
|---|---|
| SLO monitoring (uptime, latency) | No alerting infrastructure configured |
| Real-time fleet health dashboard | `proactive-signal-detector.ts` exists but full fleet view not wired |
| E2E test automation in CI | Playwright E2E tests exist but CI pipeline integration status: NOT FOUND â€” needs investigation |
| Disaster recovery / backup runbook | NOT FOUND â€” needs investigation |
| Rate limiting on all public endpoints | `rate-limit.ts` and `rate-limit-v2.ts` exist; not confirmed applied to all routes |
| SOC 2 compliance report | NOT FOUND â€” needs investigation |

---

## Glossary

| Term | Definition |
|---|---|
| **Tenant** | An organization using AgentFarm. Maps to the `Tenant` DB model. |
| **Workspace** | An isolated working environment within a tenant. Agents operate per workspace. |
| **Bot** | An agent instance with a fixed role deployed to a workspace. |
| **Role** | One of 12 predefined agent function types (developer, tester, recruiter, etc.). |
| **Approval Packet** | Structured output of agent task: change summary, risk reason, evidence links, test/lint status. |
| **Evidence Bundle** | Screenshots, diffs, test results attached to an approval for human review. |
| **Connector** | Integration adapter for an external tool (GitHub, Slack, Linear, etc.). |
| **Trigger** | An external event (webhook, Slack message, email) that starts an agent task. |
| **MCP** | Model Context Protocol â€” allows agents to discover and call external tool servers. |
| **GOAP** | Goal-Oriented Action Planning â€” multi-step planner used by the orchestrator. |
| **HNSW** | Hierarchical Navigable Small World â€” vector search algorithm used in evidence search. |
| **LLM Provider** | One of 8+ AI model APIs: OpenAI, Anthropic, Azure OpenAI, Google, xAI, Mistral, Together, GitHub Models. |
| **Provisioning** | The automated process of creating and configuring a VM + workspace for a new tenant. |
| **Escalation** | When an agent cannot complete a task and hands it to a human operator. |
| **Scout** | Pre-task workspace reconnaissance to reduce hallucination before code changes. |
| **Quality Gate** | Post-task automated check: build + lint + test must pass before task is marked complete. |
| **Session Token** | HMAC-SHA256 stateless auth token in format `v1.{base64url_payload}.{hex_signature}`. |
| **Internal Scope** | Session scope for AgentFarm staff with elevated platform access. |
| **Customer Scope** | Session scope for external tenants with workspace-scoped access. |
| **Retention Policy** | Rule governing when session recordings and evidence are auto-deleted. |
| **ZohoSign** | E-signature provider used for Enterprise plan contract signing. |
| **SSE** | Server-Sent Events â€” real-time push from server to browser for task progress. |
| **DAG** | Directed Acyclic Graph â€” used for skill dependency ordering. |
