# AgentFarm Auth System

> Last updated: May 10, 2026 | AgentFarm monorepo audit

Full reference for authentication and session management across the monorepo.

---

## Overview

AgentFarm uses a dual-store auth bridge:

1. **`apps/website`** — Next.js frontend; stores session in local SQLite (via better-sqlite3) for page rendering
2. **`apps/api-gateway`** — Fastify backend; stores session in PostgreSQL (via Prisma); issues HMAC-signed tokens

On login, the website writes to both stores and sets two cookies. Every downstream API call uses the token from the cookie.

---

## Session Token Format

**Algorithm:** HMAC-SHA256  
**Format:** `v1.{base64url_payload}.{hex_signature}`

**Payload (JSON, base64url-encoded):**
```json
{
  "userId": "string",
  "tenantId": "string",
  "workspaceIds": ["string"],
  "scope": "customer" | "internal",
  "expiresAt": 1234567890123
}
```

**Signing:**
```
signature = HMAC-SHA256(secret, "v1." + encoded_payload)
```

**Secret:** `API_SESSION_SECRET` env var (default: `agentfarm-dev-secret` — CHANGE IN PRODUCTION)

**TTL:** 8 hours (configurable via `ttlMs` parameter in `buildSessionToken`)

---

## Session Auth Functions

**File:** `apps/api-gateway/src/lib/session-auth.ts`

### `buildSessionToken(payload, ttlMs?)`
```typescript
buildSessionToken(
  payload: { userId, tenantId, workspaceIds[], scope?: 'customer' | 'internal' },
  ttlMs?: number  // default: 8 hours
): string
```
- Defaults `scope` to `'customer'` if not provided
- Returns `v1.{encoded}.{signature}`

### `verifySessionToken(token)`
```typescript
verifySessionToken(token: string): SessionPayload | null
```
- Validates format (must start with `v1.`, exactly 3 segments)
- **Timing-safe comparison** via `crypto.timingSafeEqual` — prevents timing attacks
- Validates `userId`, `tenantId`, `workspaceIds` are present
- Validates `scope` is either `'customer'` or `'internal'`
- Validates `expiresAt > Date.now()`
- Returns `null` on any failure (never throws)

---

## Scope System

| Scope | Access Level | Used For |
|---|---|---|
| `customer` | Regular user access | All customer-facing dashboard and agent features |
| `internal` | Admin/ops access | Admin provisioning routes, superadmin endpoints, internal dashboard |

The API gateway checks scope on restricted routes:
```typescript
if (session.scope !== 'internal') return reply.status(403).send(...)
```

---

## Cookie Strategy

| Cookie Name | Contents | Domain | SameSite | HttpOnly |
|---|---|---|---|---|
| `agentfarm_session` | API gateway HMAC token | All | `Lax` | `true` |
| `agentfarm_internal_session` | Website-local SQLite session | Website origin | `Strict` | `true` |

---

## Login Flow

**File:** `apps/website/app/api/auth/login/route.ts`

1. User POSTs `{email, password}` to website `/api/auth/login`
2. Website calls `POST /auth/internal-login` on api-gateway → validates email+password against `TenantUser.passwordHash` (bcrypt)
3. Website calls `POST /auth/login` on api-gateway → returns HMAC session token
4. Website sets `agentfarm_session` cookie (from api-gateway token)
5. Website creates local SQLite session → sets `agentfarm_internal_session` cookie
6. Redirects to `sanitizeFrom(from)` or `/dashboard`

### Open Redirect Protection (`sanitizeFrom`)
```typescript
function sanitizeFrom(from: string): string {
  // Rejects:
  //   - Does not start with '/'
  //   - Starts with '//'  (protocol-relative URL)
  //   - Contains ':'      (absolute URL or data: URI)
  // Returns '/' if rejected
}
```

---

## Signup Flow

1. POST `{email, password, name, tenantName}` to website `/api/auth/signup`
2. Creates `Tenant` record in PostgreSQL
3. Creates `TenantUser` with bcrypt-hashed password
4. Creates default `Workspace` for the tenant
5. Issues session token and logs user in

---

## Password Security

- Passwords hashed with **bcrypt** (cost factor: 10 or higher)
- `TenantUser.passwordHash` stores only the hash — plaintext never persisted
- Password reset via email token (forgot-password flow at `/api/auth/forgot-password`)

---

## Next.js Page Protection

**File:** `apps/website/middleware.ts` (NOT FOUND — needs investigation)

All protected pages check the `agentfarm_session` cookie in Next.js middleware and redirect to `/login` if missing or expired.

---

## API Gateway Session Reading

The gateway reads the session from:
1. `Authorization: Bearer <token>` header (primary)
2. `agentfarm_session` cookie (fallback)

`getSession(request): SessionPayload | null` is injected into all route registration functions.

---

## Ops Token (Internal Monitoring)

Routes under `/v1/observability` and `/v1/ops` accept:
```
X-Ops-Token: {OPS_MONITORING_TOKEN env var}
```
No session required — separate credential for monitoring dashboards.

---

## Internal Login Policy

**File:** `apps/api-gateway/src/routes/internal-login-policy.ts`

Controls which email patterns are allowed to obtain an `internal` scope token. If the email does not match the allow-list pattern, the scope falls back to `customer`.

---

## Security Notes

1. **Never expose `API_SESSION_SECRET` in client bundles** — it is server-side only
2. **Default dev secret is well-known** — always set `API_SESSION_SECRET` in production
3. **Tokens are not revocable** within their TTL — use short TTLs or implement a token blocklist for high-security scenarios
4. **CSRF protection** — `SameSite=Lax` on cookies provides baseline CSRF protection for same-origin requests
5. **Session payload is base64url-encoded, not encrypted** — do not store sensitive data in the payload
