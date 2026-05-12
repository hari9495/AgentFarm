# Dashboard

The Dashboard is the operator control center for AgentFarm. It provides real-time visibility into agent activity, approval queues, audit logs, governance metrics, billing, and all platform configuration.

**Port**: 3001
**Framework**: Next.js 15, React 19
**Pages**: 51
**API proxy routes**: 159

---

## Architecture

The Dashboard never calls the API Gateway directly from the browser. Every API call goes through a server-side Next.js route handler in `app/api/`, which appends the internal `X-Dashboard-Token` header before proxying to the Gateway. This keeps the gateway token out of the browser.

```
Browser request
  └─▶ app/api/[...path]/route.ts  (server-side)
        └─▶ Adds X-Dashboard-Token header
              └─▶ Forwards to API Gateway /v1/*
                    └─▶ Response relayed to browser
```

---

## Development

```bash
# From the repo root
pnpm --filter @agentfarm/dashboard dev

# Typecheck
pnpm --filter @agentfarm/dashboard typecheck

# Build
pnpm --filter @agentfarm/dashboard build
```

---

## Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DASHBOARD_API_BASE_URL` | yes | `http://localhost:3000` | Base URL for API Gateway |
| `DASHBOARD_API_TOKEN` | yes | — | Internal token added to all proxied requests |

---

## Pages

51 pages in `app/`. Each page has a corresponding `app/api/` route tree with 159 total route handlers.

| URL | Description |
|-----|-------------|
| `/` | Root dashboard home |
| `/ab-tests` | A/B test management |
| `/activity` | Activity event feed |
| `/adapters` | Adapter registry |
| `/agent-chat` | Real-time agent chat |
| `/agents` | Agent list and management |
| `/analytics` | Performance and cost analytics |
| `/audit` | Audit log viewer |
| `/audit/session-replay` | Session replay for audit events |
| `/billing` | Billing and invoices |
| `/budget` | Budget policy and cost limits |
| `/chat` | Multi-turn chat sessions |
| `/ci` | CI failure triage |
| `/connector-marketplace` | Browse and install connectors |
| `/connectors` | Active connector management |
| `/cost-dashboard` | Cost breakdown and trends |
| `/desktop` | Desktop action governance |
| `/docs` | In-app documentation |
| `/env` | Environment profile reconciler |
| `/governance` | Governance overview |
| `/governance/kpis` | Governance KPI metrics |
| `/governance/plugins` | Plugin governance |
| `/handoffs` | Agent handoff management |
| `/health` | Platform health and status |
| `/internal/skills` | Internal skill browser |
| `/knowledge-graph` | Repository knowledge graph |
| `/live` | Real-time live task feed (SSE) |
| `/login` | Login page |
| `/loops` | Autonomous loop management |
| `/marketplace` | Agent marketplace |
| `/meetings` | Meeting session management |
| `/memory` | Agent memory browser |
| `/notifications` | Notifications center |
| `/onboarding` | Customer onboarding wizard |
| `/orchestration` | Orchestration runs |
| `/pipelines` | Skill pipeline management |
| `/pr-drafts` | PR draft management |
| `/provisioning` | Provisioning job status |
| `/quality` | Quality signals dashboard |
| `/retention` | Retention policy management |
| `/scheduled-reports` | Scheduled report configuration |
| `/settings` | API keys, circuit breakers, task queue |
| `/signup` | Signup page |
| `/skill-search` | Skill search |
| `/snapshots` | Bot capability snapshots |
| `/tasks` | Task history |
| `/team` | Team management |
| `/tenant-settings` | Tenant configuration |
| `/webhooks` | Outbound webhook management |
| `/webhooks-ops` | Webhook DLQ and replay |
| `/work-memory` | Work memory viewer |

---

## Navigation and workspace switching

- URL query params control dashboard context: `/?workspaceId=ws_&tab=overview`
- The workspace selector in the top bar and sidebar preserves the current tab on switch.
- Last selected workspace is persisted in localStorage: `agentfarm.dashboard.activeWorkspaceId`
- Last selected tab is persisted per workspace: `agentfarm.dashboard.activeTab.<workspaceId>`
- On load, if URL omits `workspaceId` or `tab`, stored values are restored automatically.

### Deep links
All pages support copy-link actions for the current view context. Item-level deep links include:
- Approvals: `?approvalId=<id>`
- Audit events: `?correlationId=<id>`

---

## Approval queue

The `/approvals` page is the primary governance interface:

- Pending approvals grouped by risk level (HIGH, MEDIUM)
- Each item shows: action summary, risk reason, impacted scope, proposed rollback
- Structured packet fields: `lint_status`, `test_status`, `packet_complete`
- Detail drawer for full structured packet inspection without cluttering the table
- Approve / reject with reason capture
- Decision latency shown per item
- Escalation timer visible for items approaching SLA

---

## Session and auth

- Login: `POST /v1/auth/login` via `app/api/auth/login/route.ts`
- Internal login: `POST /v1/auth/internal-login` — requires matching domain or role policy
- All API proxy routes enforce the `DASHBOARD_API_TOKEN` header before forwarding
- Session cookie is set by the API Gateway and forwarded transparently
