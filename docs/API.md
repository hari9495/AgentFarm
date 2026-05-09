# API Reference

> AgentFarm API Gateway — Fastify v5, port 3000 (default)
> All endpoints are prefixed `/v1` unless noted.
> Last updated: 2026-05-10

---

## Authentication

All protected endpoints require a valid session cookie (`agentfarm_session`) or an `Authorization: Bearer <token>` header containing an HMAC-SHA256 session token.

### Token Claims

```typescript
{
  userId: string;
  tenantId: string;
  workspaceIds: string[];
  scope: 'internal' | 'customer';
  expiresAt: string; // ISO 8601
}
```

- `scope: 'internal'` — admin/internal users; required for admin routes
- `scope: 'customer'` — regular customers; required for standard routes

---

## Auth Routes

### `POST /v1/auth/signup`
Create a new tenant, workspace, and bot atomically.

**Body:**
```json
{
  "email": "user@example.com",
  "password": "...",
  "tenantName": "Acme Corp",
  "workspaceName": "Engineering"
}
```

**Response `201`:**
```json
{
  "tenantId": "uuid",
  "workspaceId": "uuid",
  "botId": "uuid",
  "sessionToken": "..."
}
```

---

### `POST /v1/auth/login`
Authenticate and receive a session token.

**Body:**
```json
{ "email": "user@example.com", "password": "..." }
```

**Response `200`:** Sets `agentfarm_session` cookie + returns token.

---

### `POST /v1/auth/logout`
Invalidate session. Clears cookie.

---

## Billing Routes

### `GET /v1/billing/plans`
List available subscription plans.

**Auth:** Customer session required.

**Response `200`:**
```json
[
  {
    "id": "uuid",
    "name": "Starter",
    "priceInr": 2500,
    "priceUsd": 29,
    "agentSlots": 3,
    "features": ["approvals", "audit", "connectors"]
  }
]
```

---

### `POST /v1/billing/orders`
Create a new payment order.

**Auth:** Customer session required.

**Body:**
```json
{
  "planId": "uuid",
  "currency": "INR" | "USD",
  "provider": "razorpay" | "stripe"
}
```

**Response `201`:**
```json
{
  "orderId": "uuid",
  "externalOrderId": "razorpay_order_id_or_stripe_payment_intent_id",
  "amount": 2500,
  "currency": "INR",
  "provider": "razorpay"
}
```

---

### `POST /v1/billing/webhook/stripe`
Stripe webhook receiver. Verifies `Stripe-Signature` header using `STRIPE_WEBHOOK_SECRET`. No auth session required.

**Headers:**
- `stripe-signature` — Stripe signature header

**Events handled:**
- `payment_intent.succeeded` — marks order paid, creates invoice, triggers contract PDF + Zoho Sign submission

---

### `POST /v1/billing/webhook/razorpay`
Razorpay webhook receiver. Verifies `x-razorpay-signature` HMAC-SHA256. No auth session required.

**Headers:**
- `x-razorpay-signature` — HMAC-SHA256 of `order_id|payment_id` using `RAZORPAY_KEY_SECRET`

**Events handled:**
- `payment.captured` — marks order paid, creates invoice, triggers contract PDF + Zoho Sign submission

---

### `GET /v1/billing/orders`
List orders for the authenticated customer.

**Auth:** Customer session required.

**Response `200`:**
```json
[
  {
    "id": "uuid",
    "status": "paid",
    "signatureStatus": "signed",
    "contractSentAt": "2026-05-10T10:00:00Z",
    "signedAt": "2026-05-10T11:00:00Z"
  }
]
```

---

### `GET /v1/billing/invoices`
List invoices for the authenticated customer.

---

## Zoho Sign Webhook

### `POST /v1/webhooks/zoho-sign`
Zoho Sign completion webhook. No auth session — verified by token header.

**Headers:**
- `x-zoho-webhook-token` — must match `ZOHO_SIGN_WEBHOOK_TOKEN`

**Body:**
```json
{
  "requests": {
    "request_status": "completed",
    "request_id": "zoho_request_id"
  }
}
```

**Behavior:**
1. Verifies webhook token (401 on mismatch)
2. Ignores events with status != `completed`
3. Finds Order by `zohoSignRequestId`
4. Updates `signatureStatus = 'signed'`, `signedAt`
5. Creates `ProvisioningJob` with `triggeredBy = 'zoho_sign_webhook'` (idempotent)

**Response `200`:** `{ "ok": true }`

---

## Approval Routes

### `GET /v1/approvals`
List approval records.

**Auth:** Internal session required.

**Query params:**
- `status` — `pending | approved | rejected`
- `workspaceId` — filter by workspace
- `limit` — max records (default 50)
- `cursor` — pagination cursor

**Response `200`:**
```json
{
  "approvals": [
    {
      "id": "uuid",
      "workspaceId": "uuid",
      "botId": "uuid",
      "riskLevel": "HIGH",
      "actionSummary": "...",
      "changeSummary": "...",
      "impactedScope": "...",
      "riskReason": "...",
      "proposedRollback": "...",
      "lintStatus": "pass",
      "testStatus": "pass",
      "packetComplete": true,
      "status": "pending",
      "createdAt": "2026-05-10T10:00:00Z"
    }
  ],
  "nextCursor": "..."
}
```

---

### `GET /v1/approvals/:id`
Get a single approval record including full approval packet.

---

### `POST /v1/approvals/:id/approve`
Approve an action. Decision is immutable — returns 409 if already decided.

**Auth:** Internal session required.

**Body:**
```json
{ "reason": "Reviewed and approved." }
```

---

### `POST /v1/approvals/:id/reject`
Reject an action.

**Body:**
```json
{ "reason": "Scope too broad. Revise and resubmit." }
```

---

## Audit Routes

### `GET /v1/audit/events`
Query audit log (append-only).

**Auth:** Internal session required.

**Query params:**
- `actorEmail`
- `action`
- `tenantId`
- `from` — ISO 8601 start datetime
- `to` — ISO 8601 end datetime
- `limit`

**Response `200`:**
```json
{
  "events": [
    {
      "id": "uuid",
      "tenantId": "uuid",
      "actorId": "uuid",
      "actorEmail": "user@example.com",
      "action": "CONNECTOR_ACTION_EXECUTED",
      "target": "jira:PROJ-123",
      "metadata": {},
      "createdAt": "2026-05-10T10:00:00Z"
    }
  ]
}
```

---

### `GET /v1/audit/export`
Export audit log as CSV or JSON compliance pack.

**Query params:**
- `format` — `csv | json`
- `from`, `to` — date range

---

## Connector Routes

### `GET /v1/connectors`
List connectors with auth status for the current workspace.

### `POST /v1/connectors/:connectorId/auth/start`
Start OAuth 2.0 flow for a connector. Returns redirect URL.

### `GET /v1/connectors/:connectorId/auth/callback`
OAuth callback handler. Exchanges code, stores token.

### `DELETE /v1/connectors/:connectorId/auth`
Revoke connector auth for the current workspace.

### `GET /v1/connectors/:connectorId/health`
Probe connector health (token valid, scopes present).

### `POST /v1/connectors/:connectorId/actions`
Execute a normalized action against a connector.

**Body:**
```json
{
  "actionType": "create_issue",
  "params": {
    "project": "PROJ",
    "title": "Fix login bug",
    "description": "...",
    "priority": "high"
  }
}
```

**Response `200`:**
```json
{
  "actionId": "uuid",
  "status": "completed",
  "result": { "issueId": "PROJ-456", "url": "https://..." }
}
```

---

## Admin Provisioning Routes

### `POST /v1/admin/provision`
Manually trigger provisioning for an order (internal admin only).

**Auth:** Internal scope required.

**Body:**
```json
{
  "orderId": "uuid",
  "tenantId": "uuid",
  "workspaceId": "uuid",
  "runtimeTier": "standard",
  "roleType": "developer"
}
```

---

### `GET /v1/admin/provision/jobs`
List provisioning jobs with status and SLA metrics.

---

## Runtime Task Routes

### `POST /v1/tasks`
Submit a task to the agent runtime.

**Body:**
```json
{
  "workspaceId": "uuid",
  "botId": "uuid",
  "task": "Implement JIRA-456: add pagination to the users API",
  "context": { "connectors": ["jira", "github"] }
}
```

**Response `202`:**
```json
{ "taskId": "uuid", "status": "queued" }
```

---

### `GET /v1/tasks/:taskId`
Get task execution status and result.

---

### `GET /sse/tasks/:botId`
Server-Sent Events stream for real-time task updates.

**Headers:**
- `Accept: text/event-stream`

**Events:**
```
event: task_started
data: {"taskId":"uuid","startedAt":"..."}

event: task_progress
data: {"taskId":"uuid","message":"Running tests...","progress":0.6}

event: task_completed
data: {"taskId":"uuid","result":{...},"completedAt":"..."}
```

---

## Meeting Routes

### `POST /v1/meetings/sessions`
Start a meeting transcription session.

**Body:**
```json
{
  "workspaceId": "uuid",
  "meetingProvider": "teams | zoom | google_meet",
  "meetingUrl": "https://..."
}
```

---

### `GET /v1/meetings/sessions/:sessionId`
Get meeting session state (joining, active, transcribing, completed).

### `DELETE /v1/meetings/sessions/:sessionId`
End and close a meeting session.

---

## Governance & Budget Routes

### `GET /v1/governance/workflows`
List governance workflows.

### `POST /v1/governance/workflows`
Create a governance workflow rule.

### `GET /v1/budget/limits`
Get budget limits for the current workspace.

### `PUT /v1/budget/limits`
Update budget limits (daily/monthly caps in USD).

---

## MCP Registry Routes

### `GET /v1/mcp/servers`
List registered MCP tool servers for the current tenant.

### `POST /v1/mcp/servers`
Register a new MCP tool server.

```json
{
  "name": "custom-tool-server",
  "url": "https://tools.example.com/mcp",
  "tenantId": "uuid"
}
```

---

## Language Routes

### `GET /v1/language/config`
Get effective language config (user → workspace → tenant → default).

### `PUT /v1/language/workspace/:workspaceId`
Set workspace language override.

---

## Observability Routes

### `GET /v1/observability/health`
Health check endpoint.

**Response `200`:**
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "db": "connected",
  "redis": "connected"
}
```

### `GET /v1/observability/metrics`
Prometheus-compatible metrics endpoint.

---

## Memory Routes

### `GET /v1/memory/:agentId`
Get all memory entries for an agent.

### `POST /v1/memory/:agentId`
Write a memory entry.

```json
{
  "type": "short_term | long_term | repo_knowledge",
  "content": "...",
  "ttlSeconds": 3600
}
```

---

## Error Responses

All errors follow:

```json
{
  "error": "HUMAN_READABLE_CODE",
  "message": "Descriptive error message.",
  "statusCode": 400
}
```

| Code | Status | Meaning |
|---|---|---|
| `UNAUTHORIZED` | 401 | Missing or invalid session |
| `FORBIDDEN` | 403 | Valid session but insufficient scope |
| `NOT_FOUND` | 404 | Resource does not exist |
| `CONFLICT` | 409 | Resource already exists or decision already made |
| `VALIDATION_ERROR` | 422 | Request body failed validation |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

---

## Rate Limiting

All public endpoints are rate-limited. Response headers:
- `X-RateLimit-Limit` — requests per window
- `X-RateLimit-Remaining` — remaining in current window
- `X-RateLimit-Reset` — window reset timestamp

Webhook endpoints use per-IP limits with higher ceilings (100 req/min default).

---

## Website API Routes (Next.js 15, port 3002)

The website exposes proxy API routes that forward to the api-gateway. All routes live under `apps/website/app/api/`.

| Route Group | Path | Forwards to |
|---|---|---|
| auth | `/api/auth/*` | `/v1/auth/*` |
| billing | `/api/billing/*` | `/v1/billing/*` |
| approvals | `/api/approvals/*` | `/v1/approvals/*` |
| audit | `/api/audit/*` | `/v1/audit/*` |
| connectors | `/api/connectors/*` | `/v1/connectors/*` |
| admin | `/api/admin/*` | `/v1/admin/*` |
| provisioning | `/api/provisioning/*` | `/v1/admin/provision/*` |
| webhooks/zoho-sign | `/api/webhooks/zoho-sign` | `/v1/webhooks/zoho-sign` |
| webhooks | `/api/webhooks/*` | `/v1/webhooks/*` |
| onboarding | `/api/onboarding/*` | `/v1/onboarding/*` |
| marketplace | `/api/marketplace/*` | Internal (SQLite-backed) |
| superadmin | `/api/superadmin/*` | `/v1/admin/*` (internal scope) |
