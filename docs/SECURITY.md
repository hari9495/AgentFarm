# AgentFarm Security Documentation

> **Created:** 2026-06-13 (full-repo audit) · Consolidated from verified source. Auth-flow detail lives in [AUTH_SYSTEM.md](AUTH_SYSTEM.md); this doc is the platform-wide security reference.

---

## 1. Trust Boundaries

```
Browser ──(cookie session)──► Dashboard/Website (Next.js)
                                   │  X-Dashboard-Token (server-side only)
                                   ▼
                             API Gateway :3000  ◄──(HMAC shared tokens)── agent-runtime / trigger-service / orchestrator
                                   │
                             PostgreSQL / Redis (no direct external access)
```

- The browser never calls the gateway directly — all UI traffic goes through Next.js proxy routes that attach `X-Dashboard-Token` (`apps/dashboard/app/api/[...path]/route.ts`).
- The gateway is the only writer of record for control-plane data.

## 2. Authentication

| Mechanism | Details | Source |
|---|---|---|
| Session cookies | HMAC-SHA256 signed `v1.{payload}.{sig}`, `API_SESSION_SECRET` (≥32 chars, **no fallback — startup requirement**), expiry embedded, timing-safe verification | `apps/api-gateway/src/lib/session-auth.ts` |
| Scopes | `customer` (browser/SSO users) vs `internal` (machine-to-machine only); admin routes check `scope === 'internal'` | `server.ts`, `routes/admin/*` |
| Portal accounts | Separate `TenantPortalAccount`/`TenantPortalSession`; public paths are an **explicit allowlist** (`server.ts:33-51`) — `/portal/*` is *not* blanket-bypassed; each `/portal/data/*` handler enforces portal session (⚠ per-handler — see Known Risks) | `routes/auth/portal-auth.ts`, `routes/admin/portal-data.ts` |
| SSO / MFA | `routes/auth/sso.ts`, `routes/auth/mfa.ts`; SSO users receive `customer` scope | route sources |
| API keys | SHA-256 hashed, `af_` prefix | `routes/auth/api-keys.ts` |
| Inter-service | Per-route-group HMAC shared tokens (`APPROVAL_INTAKE_SHARED_TOKEN`, `RUNTIME_TASK_SHARED_TOKEN`, `RUNTIME_DISPATCH_SHARED_TOKEN`, `RUNTIME_DECISION_SHARED_TOKEN`, `CONNECTOR_EXEC_SHARED_TOKEN`), all compared with `timingSafeEqual` (`task-notify.ts` is the reference) | CLAUDE.md, route sources |

## 3. Inbound Webhook Security (fail-closed)

Pattern (reference implementations `zoho-sign-webhook.ts`, `calls-webhook.ts`):
- Secret env var **set** → valid signature required (`timingSafeEqual`, never `===`).
- Secret env var **absent** → endpoint returns 503 (not configured), never pass-through.

Protected endpoints and their secrets: `ZOHO_SIGN_WEBHOOK_TOKEN`, `BOOKING_WEBHOOK_SECRET`, `CONTRACT_WEBHOOK_SECRET`, `CALLS_WEBHOOK_SECRET`, `SLACK_WEBHOOK_SECRET`, `TEAMS_WEBHOOK_SECRET`, `MEMORY_WEBHOOK_SECRET`, `WEBHOOK_INGEST_SECRET` (full table in CLAUDE.md).

## 4. Network & HTTP Hardening

- **CORS:** fails **closed** — `ALLOWED_ORIGINS` unset ⇒ 403 on all cross-origin requests (`server.ts:130-138`).
- **Helmet:** CSP `default-src 'none'`, `frame-ancestors 'none'`, frameguard deny, HSTS, Referrer-Policy strict-origin-when-cross-origin; Permissions-Policy disables geolocation/mic/camera.
- **Rate limiting (Redis):** 180 req/min/IP general · 20 req/min/IP auth · 600 req/min/tenant; limit headers on responses.
- **Body limit:** 1 MB.
- **Error handling:** global handler never leaks stack traces; ≥500 logged server-side only.

## 5. Data Protection

- **Field encryption:** AES-256-GCM at rest for connector/sales secrets (Twilio, HubSpot, Salesforce tokens) — HMAC-derived key, random IV, auth tag.
- **Log redaction:** authorization, cookies, passwords, api keys, tokens redacted in Pino before Azure Monitor export.
- **Tenant isolation:** every query scoped to `session.tenantId`; tenantId never accepted from request bodies; 401 regression tests required for new routes (`routes/auth-regression.test.ts` convention).
- **GDPR:** episodic memory per-person browse + delete (`clearPerson`, `/v1/episodic-memory`).
- **Retention:** evidence bundle TTLs, retention policies + `services/retention-cleanup`, compliance export 365/730-day windows.

## 6. Supply Chain & CI Security

CI (`.github/workflows/ci.yml`) runs: `secret-scan` (gitleaks, config `.gitleaks.toml`), `dependency-audit` (SCA), `sast` (Semgrep). pnpm overrides pin vulnerable transitive deps (`fast-uri`, `protobufjs`, `vitest` in root `package.json`). Plugin loading is gated by signed manifests (`computePluginManifestSignature`/`verifyPluginManifestSignature` in connector-contracts), trusted-publisher rules, allowlist + killswitch.

## 7. Governance Controls

Kill-switch (30-second control window, incident ref to resume) · circuit breakers · OPA policy engine (8181) · approval queue with decision locking · append-only audit log · evidence bundles · disclosure enforcement (EU AI Act Art. 52 / FTC / CA SB 1001) via `outbound-disclosure.ts` chokepoint.

## 8. Security Audit History

- **2026-05 (`audit_security.md`, root):** 2 HIGH / 2 MEDIUM findings.
- **2026-06-13 re-verification:** all four lead findings **remediated** — dev-secret fallback removed, tenant-branding SQL parameterized, portal blanket bypass replaced with explicit allowlist, CORS fail-closed. Evidence in [audit report §11](audit/2026-06-13/01-REPOSITORY-AUDIT-REPORT.md).

## 9. Known Residual Risks (tracked in [Technical Debt Report](audit/2026-06-13/06-TECHNICAL-DEBT-REPORT.md))

1. Portal data routes use per-handler session checks — no middleware safety net for newly added routes.
2. `apps/website/.auth.sqlite*` appears tracked by git.
3. `/health/detail` exposes internal metrics to `internal` scope without a dedicated stricter rate limit (LOW).
4. Customer owners saw INTERNAL admin nav in 2026-06-12 QA (presentation-layer; backend reachability unverified).

## 10. Reporting

No `SECURITY.md` disclosure policy / security contact found in repo — **Unknown – Requires clarification from the product owner** (recommend adding a vulnerability-disclosure section once ownership is decided).
