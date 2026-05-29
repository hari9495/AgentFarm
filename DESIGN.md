# AgentFarm — Design Principles

AgentFarm is a multi-tenant AI agent orchestration platform. This document captures the architectural design principles, UX philosophy, and system design decisions that guide how the platform is built and operated.

---

## Core Design Principles

### 1. Human control is non-negotiable
Every action above LOW risk requires explicit human approval before execution. The kill-switch can halt all risky execution within a 30-second control window. Approval records are immutable — re-deciding returns HTTP 409. These constraints are not configurable by tenants.

### 2. Role-first architecture
Agents are not generic assistants. Every agent is scoped to a single role (Developer, Tester, Content Writer, etc.) that determines:
- Which connectors the agent may use
- Which local workspace actions are permitted
- Which LLM model profile is active
- What the agent's persona, voice, and disclosure statement look like

The role enforcer (`role-enforcer.ts`) hard-blocks out-of-role tasks before any LLM call is made.

### 3. Audit by default
Every action produces an evidence trail. Audit events are append-only inserts — no update or delete paths exist in application code. Evidence bundles, compliance packs (JSON/CSV), and the full approval decision history are always available for export.

### 4. Identity as a first-class feature
Agents have real identities (persona name, email, avatar, communication style, disclosure statement). Outbound communication via any channel (email, Slack, PR comment, meeting, chat) must disclose the AI nature of the sender per EU AI Act Art. 52 / FTC / CA SB 1001. The disclosure chokepoint is enforced in the connector dispatcher and all direct send-sites.

### 5. Isolation at every boundary
- **Workspace isolation**: all records carry `tenantId` + `workspaceId`
- **Filesystem sandbox**: `safeChildPath` enforces workspace-scoped paths on all file and shell operations
- **Credential isolation**: connector OAuth tokens are stored as `kv://` Key Vault references only — never as plaintext in the database
- **Session isolation**: cookie-based session tokens are scoped to tenant + workspace; dashboard requests never carry the gateway token to the browser

### 6. Fail-safe defaults
- Unknown risk → escalate to medium (confidence < 0.6 triggers approval routing)
- Missing LLM provider → health-score-ordered failover across all 9 providers
- Connector token expired → auto-refresh before expiry (5-minute window); re-consent routing on failure
- Budget exceeded → hard stop; all new agent actions blocked until admin clears

---

## System Architecture Philosophy

### Single control-plane entry point
All traffic enters through the API Gateway. The Agent Runtime and Trigger Service communicate back via HMAC shared tokens. No browser code ever holds gateway credentials.

### Dashboard server-side proxy
The Dashboard uses Next.js `app/api/` route handlers as a server-side proxy layer. The internal token is added server-side. The browser sees only the gateway's public session cookie.

### Risk-gated execution
```
Action classified → LOW: execute immediately
                  → MEDIUM / HIGH: approval record created (immutable) → operator decides → resume
                  → MEDIUM / HIGH + kill-switch active: blocked (30-second control window)
```

### LLM provider abstraction
`LlmDecisionAdapter` abstracts 9 providers behind a single interface. Auto mode uses a 5-minute rolling health score (error rate + latency weighted composite: `score = availability_penalty × 0.6 + quality_penalty × 0.4`). Every decision emits a `ProviderFailoverTraceRecord[]` for observability.

### Memory hierarchy
```
Task context (in-request, ephemeral)
  └─ Short-term memory (7-day TTL, per-workspace, Prisma-backed)
  └─ Episodic memory (pgvector 1536-dim, per-person dual-index by workspaceId + personKey)
  └─ Semantic knowledge base (pgvector 1536-dim, cosine similarity search, top-5 pre-task recall)
  └─ Long-term behavioral memory (persistent, TTL + relevance ranking)
```

### Desktop operator abstraction
The `DesktopOperator` interface (`packages/shared-types/src/desktop-operator.ts`) is **frozen** — only adapters change. Two implementations:
- `MockDesktopOperator`: always returns `{ ok: true }`, used in CI and local dev
- `NativeDesktopOperator`: dispatches to the desktop-agent Flask service (noVNC + Xvfb)

---

## UX Philosophy (Dashboard)

### Operator-first, not agent-first
The Dashboard is an operator control center, not an agent chat interface. The primary UI surfaces are the approval queue, audit log, governance KPIs, and cost dashboard. Agents are secondary — operators decide what agents can and cannot do.

### Structured approval packets
Every pending approval shows: action summary, risk reason, impacted scope, proposed rollback, lint status, test status, packet completeness score. Operators have enough context to make informed decisions without reading raw code diffs.

### Deep link everything
Every approval, audit event, and agent action supports a deep link. Operators can share exact views with colleagues. Item-level links include `?approvalId=`, `?correlationId=`.

### Workspace context persistence
The active workspace ID and selected tab are persisted in `localStorage`. On load, if the URL omits context, stored values are restored automatically. This prevents operators from losing context on page refresh.

---

## Security Design

| Control | Mechanism |
|---------|-----------|
| Session auth | HMAC-signed cookie; all `/v1/*` routes require valid session |
| Rate limiting | Per-IP (180/20 req/min), per-tenant (600 req/min), Redis-backed |
| CORS | `ALLOWED_ORIGINS` allowlist; 403 on unlisted origin |
| Webhook verification | `x-hub-signature-256` or `x-signature` HMAC on all inbound webhooks |
| Body limit | 1 MB max request body |
| Security headers | `@fastify/helmet` — CSP, HSTS, X-Frame-Options, Referrer-Policy, Permissions-Policy |
| Password hashing | scrypt via `@agentfarm/auth-utils` |
| Plugin trust | Cryptographic signature verification before allowlisting external plugins |
| OAuth CSRF | Nonce validation on all OAuth callback flows; replay rejection |
| Path traversal | `safeChildPath` sandbox on all file and shell workspace operations |
| Token budget | Warning at 80%, hard throttle at 90%, configurable per workspace |
| Audit integrity | Append-only `AuditEvent` table — no update/delete paths |

---

## Quality Standards

- **Test coverage**: ≥80% line coverage on all critical modules (enforced by quality gate)
- **Test framework**: `node:test` + `node:assert/strict` — no Jest, no Vitest
- **Type safety**: TypeScript strict mode, NodeNext module resolution — no unguarded `any`
- **Contract versioning**: `CONTRACT_VERSIONS` object in `@agentfarm/shared-types` — all pinned at `'1.0.0'`
- **Quality gate**: 47 automated checks (typecheck, test suites, coverage gates, regression lanes) — must all PASS before sprint close
- **Import boundaries**: internal packages import by package name (`@agentfarm/shared-types`), not relative paths across boundaries

---

## Agent Role Design Pattern

Each agent role follows a consistent vertical architecture:

```
Profile layer       agent-runtime/src/<role>-agent-profile.ts
                    — connector allowlist, local action allowlist, blocked actions array

Role-profile layer  agent-runtime/src/role-profiles/<role>-role-profile.ts
                    — Set<string> blocked actions, approval thresholds, blocked keywords

Persona layer       agent-runtime/src/<role>-persona-defaults.ts
                    — default AgentPersonaRecord (name, email, avatar, style, disclosure)

Memory layer        agent-runtime/src/<role>-episodic-hooks.ts
                    — pgvector episodic pattern/summary builders for memory crystallization

MCP layer           agent-runtime/src/<role>-mcp-provisioner.ts
                    — lazy MCP client provisioning per connector type

Standup layer       agent-runtime/src/<role>-standup-builder.ts
                    — StandupSummary type + daily summary builder

Handler layer       agent-runtime/src/<role>/
                    — domain-specific action handlers (e.g. brief-parser, draft-builder, fact-checker)

Runtime wiring      agent-runtime/src/runtime-server.ts
                    — connector policy, action policy, blocked-action guard, MCP pre-warm,
                      episodic + semantic memory write blocks

Classifier wiring   agent-runtime/src/task-classifier.ts
                    — positive keywords + blocked keyword heuristics for LLM membership check
```

**Currently implemented roles (Sprint 18):**
| Role | Status |
|------|--------|
| `developer` | Full — 12-tier actions, autonomous loop, PR review, CI triage, DB migration |
| `tester` | Full — 18 connectors, 62 actions, Tier 20 testing tools (Selenium/Cypress/Appium/Playwright/k6/ZAP) |
| `technical_writer` | Full — documentation workflows |
| `content_writer` | Full — 10 capability modules: prose, research, SEO, CMS, images, tone, revisions, brand voice, scheduling |
| `corporate_assistant` | Full — corporate coordination workflows |
| `fullstack_developer` | Profile defined |
| `business_analyst` | Profile defined |
| `project_manager_product_owner_scrum_master` | Profile defined |
| `sales_rep` | Profile defined |
| `marketing_specialist` | Profile defined |
| `recruiter` | Profile defined |
| `customer_support_executive` | Profile defined |
