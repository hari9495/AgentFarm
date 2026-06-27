# Security Review Audit

> **STATUS (2026-06-13): REMEDIATED.** All four lead findings below were re-verified against the current tree and are fixed: the `agentfarm-dev-secret` fallback no longer exists; `tenant-branding.ts` uses parameterized queries; the blanket `/portal/*` auth bypass was replaced with an explicit path allowlist (`server.ts:33-51`); CORS now fails closed when `ALLOWED_ORIGINS` is unset (`server.ts:130-138`). Residual items (per-handler portal session checks, `/health/detail` rate limit) are tracked in [docs/audit/2026-06-13/06-TECHNICAL-DEBT-REPORT.md](docs/audit/2026-06-13/06-TECHNICAL-DEBT-REPORT.md). This file is retained as historical record. Current security reference: [docs/SECURITY.md](docs/SECURITY.md).

> Generated from direct source analysis of `apps/api-gateway/src/`

## Summary

**2 HIGH · 2 MEDIUM · 2 LOW/INFO findings** *(historical — see status above)*

---

## Findings

### HIGH

---

**[HIGH] Hardcoded fallback session secret**
- **File:** `apps/api-gateway/src/lib/session-auth.ts` line 14
- **Code:** `const getSecret = (): string => process.env.API_SESSION_SECRET ?? 'agentfarm-dev-secret';`
- **Issue:** If `API_SESSION_SECRET` is not set (misconfigured deploy, missing secret injection), the HMAC signing key silently falls back to `'agentfarm-dev-secret'`. An attacker who knows this default (it is in the source code) can forge valid session tokens for any `userId`/`tenantId`.
- **Risk:** Full authentication bypass — forge sessions for any tenant or admin user. The `v1.{encoded}.{signature}` format is public, so forging is trivial.
- **Fix:** Throw at startup instead of falling back:
  ```ts
  const getSecret = (): string => {
    const s = process.env.API_SESSION_SECRET;
    if (!s || s.length < 32) throw new Error('API_SESSION_SECRET must be set (≥32 chars)');
    return s;
  };
  ```

---

**[HIGH] SQL injection via manual string interpolation in `$executeRawUnsafe`**
- **File:** `apps/api-gateway/src/routes/platform/tenant-branding.ts` lines 135–148
- **Code:**
  ```ts
  updates.push(`"companyName" = ${companyName === null ? 'NULL' : `'${companyName.replace(/'/g, "''")}'`}`);
  // ... repeated for logoUrl, primaryColor, portalTitle, faviconUrl
  await prisma.$executeRawUnsafe(`UPDATE "TenantBranding" SET ${updates.join(', ')} WHERE "tenantId" = $1`, session.tenantId);
  ```
- **Issue:** The UPDATE path manually escapes strings with `.replace(/'/g, "''")` instead of using parameterized queries. This naive escape is insufficient — it does not handle backslash sequences (`\`), Unicode normalization attacks, or multi-byte encoding tricks that can bypass single-quote escaping in PostgreSQL.
- **Contrast:** The INSERT path on the same file correctly uses the safe `$executeRaw\`...\`` tagged template with parameterized values. The UPDATE path was written inconsistently.
- **Risk:** Authenticated SQL injection in the tenant branding endpoint. Impact is limited to the authenticated tenant's `TenantBranding` row but could be escalated.
- **Fix:** Replace the `$executeRawUnsafe` UPDATE path with a Prisma safe tagged template using individual parameters, or use `prisma.tenantBranding.update()` directly.

---

### MEDIUM

---

**[MEDIUM] CORS allows all origins when `ALLOWED_ORIGINS` is not set**
- **File:** `apps/api-gateway/src/server.ts` lines 107–108
- **Code:**
  ```ts
  if (!allowedOriginsEnv || !origin) {
    callback(null, true); // ← allows ALL origins
    return;
  }
  ```
- **Issue:** When `ALLOWED_ORIGINS` env var is absent (common in dev/staging), the CORS policy is `*` with `credentials: true`. Browsers allow credentialed cross-origin requests only when the server explicitly reflects the request origin, not with a literal `*` — but Fastify CORS with `callback(null, true)` does reflect it. This means any origin can make authenticated requests using the victim's session cookie.
- **Risk:** CSRF / session hijacking from any origin in environments where `ALLOWED_ORIGINS` is not configured. Staging and internal deployments are typically the highest risk.
- **Fix:** Fail closed — if `ALLOWED_ORIGINS` is not set, default to a safe list (e.g., `localhost:3001`) or deny all cross-origin requests rather than permitting all.

---

**[MEDIUM] Portal paths are fully exempt from authentication middleware**
- **File:** `apps/api-gateway/src/server.ts` line 43
- **Code:** `path.startsWith('/portal/')`
- **Issue:** ALL `/portal/*` paths bypass the global auth `preHandler`. This includes data-bearing endpoints registered in `portal-data.ts`:
  - `GET /portal/data/agents` — lists all tenant agents
  - `GET /portal/data/agents/:botId` — agent details
  - `GET /portal/data/usage` — usage metrics
  - `GET /portal/data/billing/subscription` — subscription info
  - `GET /portal/data/billing/invoices` — invoice data
  - `GET /portal/data/billing/orders` — order history
  - `GET /portal/data/connectors` — connector config
  - `PATCH /portal/data/profile` — mutates user profile
- **These routes implement their own auth via portal session cookies** — but the enforcement is per-handler rather than enforced at the middleware level. Any new portal route added without remembering to check the portal session is silently unauthenticated.
- **Risk:** Developer error — a new `/portal/data/*` route that forgets session validation is publicly accessible with no safety net.
- **Fix:** Remove `path.startsWith('/portal/')` from the auth bypass list. Move the portal session resolution logic into a dedicated `fastify-plugin` that handles the portal auth pattern uniformly, then register it on the portal route group.

---

### LOW / INFO

---

**[LOW] `$executeRawUnsafe` with numeric interpolation in agent-budget.ts**
- **File:** `apps/api-gateway/src/routes/agents/agent-budget.ts` lines 163–168
- **Code:**
  ```ts
  setClauses.push(`"dailyLimitUsd" = ${dailyLimit === null ? 'NULL' : dailyLimit}`);
  await prisma.$executeRawUnsafe(`UPDATE "AgentBudgetConfig" SET ${setClauses.join(', ')} WHERE "botId" = $1 AND "tenantId" = $2`, botId, session.tenantId);
  ```
- **Issue:** `dailyLimit` and `monthlyLimit` are interpolated directly. If the upstream route handler validates them as numbers before this point, injection is not possible (numbers cannot carry SQL syntax). However, the type safety depends entirely on that upstream validation.
- **Risk:** Low — numeric values cannot inject SQL. Risk exists only if type coercion allows a string through.
- **Fix:** Replace with `$executeRaw`` tagged template and individual params to be safe and consistent.

---

**[INFO] `GET /health/detail` leaks internal metrics without rate limiting**
- **File:** `apps/api-gateway/src/server.ts`
- **Issue:** The `/health/detail` endpoint requires `scope: 'internal'` but is not rate-limited separately. It exposes heap memory usage, uptime, and DB connectivity status. Not a direct vulnerability but useful for reconnaissance.
- **Risk:** Low — restricted to internal scope sessions. Minor information disclosure.
- **Fix:** No urgent action needed, but consider adding a stricter rate limit (5 req/min) to this endpoint.

---

## What Looks Good

- **Session token signing** — Uses HMAC-SHA256 with timing-safe comparison (`timingSafeEqual`). Token format is `v1.{encoded}.{signature}` with expiry embedded.
- **Rate limiting** — Dual-layer: per-IP (180 req/min general, 20 req/min auth) and per-tenant (600 req/min). Redis-backed. Headers returned on responses.
- **Helmet** — CSP `defaultSrc: "none"`, `frameAncestors: "none"`, `frameguard: deny`. Solid baseline.
- **Log redaction** — All sensitive fields (`authorization`, `cookie`, `password`, `api_key`, tokens) are redacted in Pino logs before they reach Azure Monitor.
- **Field encryption** — AES-256-GCM at-rest for SalesAgentConfig secrets (Twilio, HubSpot, Salesforce tokens). HMAC-derived key, random IV, auth tag.
- **Admin routes** — Properly guarded with `scope !== 'internal'` check (`POST /v1/admin/provision` etc.).
- **HMAC inter-service auth** — `verifyHmacSha256` uses `timingSafeEqual` on both the comparison and length check. No timing oracle.
- **Global error handler** — Never leaks stack traces (`500` returns generic message). Status codes ≥500 are logged server-side only.
- **Body limit** — 1 MB cap on all requests prevents large-payload DoS.
- **Webhook verification** — Constant-time HMAC comparison in `webhook-verify.ts`. Correct.
