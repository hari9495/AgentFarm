# AgentFarm Sales Automation Domain

> **Created:** 2026-06-13 (full-repo audit) · First documentation of the sales domain, which post-dates the Sprint-18 doc set. Evidence: `apps/api-gateway/src/routes/sales/` (13 route files), `schema.prisma` sales models, `apps/agent-runtime/src/agents/sales-agent/`, CLAUDE.md webhook table.

---

## 1. Purpose

End-to-end sales automation operated by the `sales-agent` role: prospecting → outreach → deals → proposals/negotiation → contract signature → calls → post-sale NPS and win/loss analysis.

## 2. Data Model (verified in schema.prisma)

| Model | Role |
|---|---|
| `SalesAgentConfig` | Per-tenant sales agent configuration; secrets (Twilio/HubSpot/Salesforce tokens) encrypted AES-256-GCM at rest |
| `Prospect`, `Lead` | Top-of-funnel records (`ProspectStatus` enum) |
| `NurtureSequenceEntry`, `SalesSequenceEntry` | Sequenced outreach |
| `SalesDeal`, `SalesActivity` | Pipeline (`DealStage`, `SalesActivityType` enums) |
| `SalesProposal`, `SalesNegotiation` | Late-stage deal artifacts |
| `CallRecord` | Telephony calls (connector actions incl. recordings, DTMF) |
| `BookingEvent` | Meeting bookings (inbound webhook) |
| `ContractEvent` | Contract lifecycle (ZohoSign) |
| `NpsResponse`, `WinLossEvent` | Post-sale feedback and outcome analysis |
| `BrowserTask` | Browser-automation tasks driven from sales flows |

## 3. API Routes (`routes/sales/`, registered in route-registry.ts)

`leads.ts`, `prospects.ts`, `deals.ts`, `outreach.ts`, `sales-config.ts`, `kpi.ts`, `browser-tasks.ts`, plus inbound webhooks: `booking-webhook.ts`, `contract-webhook.ts`, `calls-webhook.ts`, `nps-webhook.ts`, `twilio-webhook.ts`, `zoho-sign-webhook.ts`.

All webhooks follow the **fail-closed** pattern (secret set ⇒ signature required via `timingSafeEqual`; unset ⇒ 503): `BOOKING_WEBHOOK_SECRET`, `CONTRACT_WEBHOOK_SECRET`, `CALLS_WEBHOOK_SECRET`, `ZOHO_SIGN_WEBHOOK_TOKEN` (reference implementations per CLAUDE.md: `zoho-sign-webhook.ts`, `calls-webhook.ts`).

## 4. Agent Integration

- `sales-agent` (`apps/agent-runtime/src/agents/sales-agent/`) with RAG retriever + lesson pipeline (`sales:lesson:` prefix; categories: email_personalization, objection_handling, proposal_quality, timing, closing_technique, follow_up, discovery — CLAUDE.md taxonomy).
- Telephony via connector contracts (Twilio/Vonage/Amazon Connect/Genesys): `initiate_call` … `send_dtmf` actions.
- CRM adapters: `packages/crm-service` (Salesforce, HubSpot types/clients).
- Disclosure: outbound messages pass the `outbound-disclosure.ts` compliance chokepoint.

## 5. Open Items

- End-to-end production usage of the sales pipeline (real tenant data): **Unknown – Requires clarification from the product owner.**
- ZohoSign account/template configuration steps: covered partially in [PAYMENTS.md](PAYMENTS.md) contract flow; full setup guide not found in repo.
