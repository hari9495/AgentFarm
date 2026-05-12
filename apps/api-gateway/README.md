# API Gateway

The API Gateway is the control-plane entry point for AgentFarm. All authenticated requests from the Dashboard and all inter-service callbacks from the Agent Runtime pass through this service.

**Port**: 3000
**Framework**: Fastify 5 with TypeScript
**Tests**: 898 tests, 57 suites

---

## Responsibilities

- Session-based authentication for all `/v1/*` routes
- Tenant and workspace isolation (all records carry `tenantId` + `workspaceId`)
- Rate limiting: per-IP (180 req/min general, 20 req/min auth) and per-tenant (600 req/min)
- Security headers via `@fastify/helmet`
- Approval intake and decision recording (immutable, latency-tracked)
- Audit event log (append-only, no update/delete path)
- Budget policy enforcement (daily/monthly limits, hard-stop)
- Subscription guard (grace period, suspension wall)
- Billing webhook handling (Stripe, Razorpay, Zoho Sign)
- Connector auth lifecycle (OAuth 2.0, API key, basic auth, token refresh/revoke)
- Plugin allowlist and kill-switch governance
- SSE live task feed with auto-recovery

---

## Development

```bash
# From the repo root
pnpm --filter @agentfarm/api-gateway dev

# Typecheck
pnpm --filter @agentfarm/api-gateway typecheck

# Tests
pnpm --filter @agentfarm/api-gateway test
```

---

## Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | yes | — | PostgreSQL connection string |
| `REDIS_URL` | yes | — | Redis connection string |
| `API_SESSION_SECRET` | yes | — | Session cookie signing secret |
| `DASHBOARD_API_TOKEN` | yes | — | Token expected on requests from the Dashboard |
| `AGENTFARM_APPROVAL_INTAKE_SHARED_TOKEN` | yes | — | HMAC token for approval intake from Agent Runtime |
| `AGENTFARM_RUNTIME_DECISION_SHARED_TOKEN` | yes | — | Token for runtime decision callbacks |
| `AGENTFARM_CONNECTOR_EXEC_SHARED_TOKEN` | yes | — | Token for connector execution callbacks |
| `AGENTFARM_RUNTIME_TASK_SHARED_TOKEN` | yes | — | Token for runtime task observability push |
| `AGENTFARM_RUNTIME_DISPATCH_SHARED_TOKEN` | yes | — | Token for dispatching tasks to the runtime |
| `ALLOWED_ORIGINS` | no | `''` | Comma-separated CORS allowlist |
| `PORT` | no | `3000` | HTTP listen port |
| `API_INTERNAL_LOGIN_ALLOWED_DOMAINS` | no | `''` | CSV email domains allowed to use internal login |
| `API_INTERNAL_LOGIN_ADMIN_ROLES` | no | `''` | CSV role values allowed to use internal login |

---

## Authentication

All `/v1/*` routes require a valid `agentfarm_session` cookie. Public endpoints explicitly excluded from auth:

- `GET /health`
- `POST /v1/auth/login`
- `POST /v1/auth/signup`
- `GET /v1/auth/internal-login-policy` (requires internal scope)

### Session scopes
- `customer` — default scope for customer-facing flows
- `internal` — required for internal diagnostics and admin APIs

### Internal login policy
Internal login (`POST /v1/auth/internal-login`) uses deny-by-default policy. Access is granted when either:
1. User's email domain is in `API_INTERNAL_LOGIN_ALLOWED_DOMAINS`
2. User's role is in `API_INTERNAL_LOGIN_ADMIN_ROLES`

Otherwise returns HTTP 403 with `error: internal_access_denied`.

---

## Route summary

62 route files in `src/routes/`. Each file exports a Fastify plugin registered at `/v1/<domain>`.

**Auth and identity**: `auth.ts`, `workspace-session.ts`, `roles.ts`, `internal-login-policy.ts`

**Agents and bots**: `agents.ts`, `bot-versions.ts`, `agent-control.ts`, `agent-dispatch.ts`, `agent-feedback.ts`

**Task execution**: `runtime-tasks.ts`, `task-queue.ts`, `sse-tasks.ts`, `runtime-llm-config.ts`, `repro-packs.ts`, `schedules.ts`, `skill-scheduler.ts`

**Orchestration and skills**: `orchestration.ts`, `autonomous-loops.ts`, `skill-pipelines.ts`, `skill-composition-execute.ts`, `handoffs.ts`

**Governance and audit**: `approvals.ts`, `audit.ts`, `governance-kpis.ts`, `governance-workflows.ts`, `budget-policy.ts`, `retention-policy.ts`, `circuit-breakers.ts`, `snapshots.ts`, `ab-tests.ts`, `plugin-loading.ts`, `ci-failures.ts`

**Billing**: `billing.ts`, `zoho-sign-webhook.ts`

**Connectors**: `connector-actions.ts`, `connector-auth.ts`, `connector-health.ts`, `adapter-registry.ts`, `marketplace.ts`

**Observability**: `analytics.ts`, `observability.ts`, `activity-events.ts`

**Voice and meetings**: `meetings.ts`, `language.ts`

**Memory and knowledge**: `memory.ts`, `work-memory.ts`, `knowledge-graph.ts`

**Notifications**: `notifications.ts`, `questions.ts`

**Developer tools**: `api-keys.ts`, `webhooks.ts`, `outbound-webhooks.ts`, `scheduled-reports.ts`, `pull-requests.ts`, `ide-state.ts`, `desktop-actions.ts`, `desktop-profile.ts`, `env-reconciler.ts`, `mcp-registry.ts`, `zoho-sign-webhook.ts`, `admin-provision.ts`, `chat.ts`, `team.ts`

---

## SSE task stream

Real-time task events over Server-Sent Events, implemented in `src/routes/sse-tasks.ts`.

```
GET /sse/tasks/:botId
```

- Establishes a persistent SSE connection per `botId`.
- On connect, any queued events for that bot are immediately drained to the client.
- Heartbeat comment (`: heartbeat`) sent every 30 seconds to keep the connection alive.
- Auto-recovery: queued events are buffered during disconnects and delivered on reconnect.

---

## Approvals

Approval records are immutable. The lifecycle is:

1. Agent Runtime posts to `POST /v1/approvals/intake` with a shared HMAC token.
2. Gateway creates an `Approval` record (pending).
3. Operator retrieves pending approvals via `GET /v1/approvals`.
4. Operator posts a decision via `POST /v1/approvals/:id/decide`.
5. Re-deciding an already-decided approval returns HTTP 409.
6. `decisionLatencySeconds` is recorded on every decision.

---

## Health check

```
GET /health
```

Returns `200 {"status":"ok"}` when the service is ready. The Docker healthcheck polls this endpoint every 15 seconds.

### SseTaskQueue

Each `botId` maintains a `SseTaskQueue` (ring buffer, max 512 events).

- Events pushed via `queue.push(event)` from task-execution route handlers.
- On reconnect, `queue.drain()` sends all buffered events before streaming live events.
- If the buffer fills, oldest events are dropped (LRU eviction).

### Event Format

```
id: <eventId>
event: <eventType>
data: <JSON payload>
```

Event types: `task_created`, `task_assigned`, `task_completed`, `task_failed`, `task_cancelled`.

### Auto-Recovery

- If a client disconnects and reconnects within the buffer window, no events are lost.
- `channelKey(botId)` and `getOrCreateQueue(botId)` are exported for testing and integration.

### Tests

Covered in the api-gateway 351-test suite under `src/routes/sse-tasks.test.ts`.

---

## Test Summary

| Suite | Tests |
|-------|-------|
| Auth / Session | covered |
| Approvals | covered |
| Audit | covered |
| Connectors | covered |
| Budget policy | covered |
| Governance workflows | covered |
| SSE task stream | covered |
| **Total** | **351 passing** |

Last quality gate run: **2026-05-06 — EXIT_CODE=0 (PASS)**

Sprint 6 coordination note:
1. Website connector scope hardening now returns HTTP 400 for invalid workspace/bot context requests.
2. This improves deterministic behavior when api-gateway actions are triggered from connector-backed website flows.


<!-- doc-sync: 2026-05-06 sprint-6 -->
> Last synchronized: 2026-05-06 (Sprint 6 hardening and quality gate pass).

<!-- doc-sync: 2026-05-06 full-pass-2 -->
> Last synchronized: 2026-05-06 (Full workspace sync pass 2 + semantic sprint-6 alignment).
