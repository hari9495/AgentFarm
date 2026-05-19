# Sprint 13 — Billing Invoice Generation + Checkout Flow + AI Disclosure Compliance

**Status:** COMPLETED
**Target start:** 2026-05-20
**Completed:** 2026-05-18
**Quality gate:** PASS — `operations/quality/14.1-quality-gate-report.md`

---

## Goal

Ship the Stripe-hosted checkout flow, invoice download endpoint, and the AI disclosure
compliance layer (EU AI Act Art. 52, FTC AI guidelines, CA SB 1001) — so customers
can self-serve upgrade their plans and every agent's outbound messages carry the correct
AI identity disclosure.

---

## Deliverables

### Backend — api-gateway

| File | Change |
|---|---|
| `src/services/payment-service.ts` | Added `createStripeCheckoutSession()` — creates Stripe Checkout sessions with tenant metadata |
| `src/routes/billing.ts` | Added `POST /v1/billing/checkout-session` and `GET /v1/billing/invoices/:invoiceId/download` |
| `src/routes/disclosure.ts` | **New file** — 4 routes: GET/PATCH `/v1/disclosure/:botId`, POST `/v1/disclosure/:botId/ack`, GET `/v1/disclosure/:botId/audit` |
| `src/main.ts` | Registered `registerDisclosureRoutes` after persona routes |

### Backend — agent-runtime

| File | Change |
|---|---|
| `src/disclosure-guard.ts` | **New file** — pure string module: `isDisclosurePresent`, `formatDisclosure`, `enforceDisclosure`, `buildDisclosureAuditNote`. Channel-specific formatting for email/slack/pr/meeting/chat |

### Dashboard — pages

| File | Change |
|---|---|
| `app/billing/checkout/page.tsx` | **New file** — plan selector + email input → POST checkout-session → redirect to Stripe |
| `app/components/disclosure-settings-panel.tsx` | **New file** — compliance badge, jurisdiction pills, statement editor, email preview, audit trail |
| `app/settings/disclosure/page.tsx` | **New file** — server component wrapping `DisclosureSettingsPanel` with session guard |

### Dashboard — API proxies

| File | Change |
|---|---|
| `app/api/billing/checkout-session/route.ts` | **New file** — POST proxy injecting tenantId from session |
| `app/api/disclosure/[botId]/route.ts` | **New file** — GET + PATCH proxy for disclosure config |
| `app/api/disclosure/[botId]/audit/route.ts` | **New file** — GET proxy forwarding page/page_size |

### Tests

| File | Tests |
|---|---|
| `apps/api-gateway/src/routes/disclosure.test.ts` | 13 tests — GET 404/200, PATCH 400/404/200, POST ack 401/400/201/all-channels, GET audit 401/200 |
| `apps/api-gateway/src/routes/billing.test.ts` | +8 tests — checkout-session 401/403/400/404, invoice download 401/404/200 |
| `apps/agent-runtime/src/disclosure-guard.test.ts` | 18 tests — isDisclosurePresent, formatDisclosure per channel, enforceDisclosure, buildDisclosureAuditNote |

---

## Design Decisions

### Disclosure audit trail — no new Prisma model
Disclosure acknowledgements are stored as `AuditEvent` records with `eventType = 'audit_event'`
and `[DISCLOSURE_ACK]` prefix in the `summary` field. This avoids a schema migration in Sprint 13.
The prefix is stripped from API responses. A future migration can add a dedicated `DisclosureAck`
table with the marker as a query predicate.

### Invoice PDF
`Invoice.pdfUrl` is stored by the Stripe webhook handler. The download route returns the stored
URL rather than generating a PDF on-the-fly. If `pdfUrl` is null (webhook not yet processed),
the response includes `pdfUrl: null`.

### Stripe checkout — amount field
Plan pricing uses `priceUsd` (integer, cents) on the `Plan` model — passed directly to Stripe
`unit_amount`. Razorpay (INR) checkout is out-of-scope for this sprint.

---

## Compliance Coverage

| Regulation | Mechanism |
|---|---|
| EU AI Act Art. 52 | Disclosure statement required; `enforceDisclosure` injects if absent; `ack` endpoint records delivery |
| FTC AI Guidelines | Disclosure footer on all agent-authored emails and chat messages |
| CA SB 1001 | Disclosure statement validated min 10 chars; audit trail of all delivery channels |

---

## Test Counts

| Package | Pass | Fail |
|---|---|---|
| `@agentfarm/api-gateway` | 1225 | 0 |
| `@agentfarm/agent-runtime` | 1096 | 0 |
| `@agentfarm/dashboard` | typecheck ✓ | — |
