# API Gateway Authentication and Internal Access Notes

This document summarizes customer vs internal authentication behavior and the internal login policy controls.

## Authentication Endpoints

- POST /auth/signup
  - Creates tenant bootstrap records and returns a customer-scoped session token.

- POST /auth/login
  - Returns a customer-scoped session token.

- POST /auth/internal-login
  - Returns an internal-scoped session token only when policy checks pass.

- POST /auth/logout
  - Clears session cookie.

## Session Scope Model

Session tokens include a scope field.

- customer
  - Default scope for customer authentication flows.

- internal
  - Required for internal dashboard APIs and diagnostics.

## Internal Login Policy Controls

Internal login uses deny-by-default policy enforcement.

- API_INTERNAL_LOGIN_ALLOWED_DOMAINS
  - CSV list of email domains allowed to use /auth/internal-login.
  - Example: agentfarm.com,corp.agentfarm.com

- API_INTERNAL_LOGIN_ADMIN_ROLES
  - CSV list of TenantUser.role values that are allowed to use /auth/internal-login.
  - Example: internal_admin,platform_admin,owner

Internal login access is granted when either condition matches:

1. Email domain is in API_INTERNAL_LOGIN_ALLOWED_DOMAINS.
2. User role is in API_INTERNAL_LOGIN_ADMIN_ROLES.

Otherwise /auth/internal-login returns:

- HTTP 403
- error code: internal_access_denied

## Startup Validation Warning

At api-gateway startup, a warning is emitted if both policy lists are empty.

- This indicates internal login remains deny-by-default until policy values are configured.

## Internal-Only Policy Diagnostics Endpoint

- GET /v1/auth/internal-login-policy
  - Internal session required (scope must be internal).
  - Returns sanitized effective policy values and counters.

Response fields include:

- allowed_domains
- admin_roles
- allowed_domains_count
- admin_roles_count
- deny_all_mode

## Quick Policy Smoke Command

Run focused policy checks only:

- pnpm --filter @agentfarm/api-gateway test:internal-login-policy

This command validates:

1. Domain-based internal login allow path.
2. Role-based internal login allow path.
3. Customer denial path.
4. Internal diagnostics endpoint allow/deny behavior.
5. deny_all_mode behavior when policy config is empty.

---

## SSE Task Stream

Real-time task events delivered over Server-Sent Events (SSE), implemented in `src/routes/sse-tasks.ts`.

### Endpoint

```
GET /sse/tasks/:botId
```

- Establishes a persistent SSE connection per `botId`.
- On connect, any queued events for that bot are immediately drained to the client.
- Heartbeat comment (`: heartbeat`) sent every 30 seconds to keep the connection alive.

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

Last quality gate run: **2026-05-04 — EXIT_CODE=0 (PASS)**

