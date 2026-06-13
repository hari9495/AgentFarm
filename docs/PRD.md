# AgentFarm Product Requirements Document (PRD)

> **Created:** 2026-06-13 (full-repo audit) · **Basis:** implemented behavior in the repository at commit `3507f49`. This PRD documents the product *as built*; forward-looking requirements belong to the product owner. Companion: [BRD.md](BRD.md) (business requirements), [audit reports](audit/2026-06-13/README.md).
> Items the repository cannot prove are marked **Unknown – Requires clarification from the product owner or development team.**

---

## 1. Product Summary

AgentFarm lets a business hire **autonomous AI teammates**. Each agent has a fixed role, works inside the customer's real tools via connectors, asks a human before doing anything risky, leaves a complete evidence trail, and improves from feedback via a per-agent RAG lesson flywheel.

## 2. Users & Roles

| User | Primary surface | Evidence |
|---|---|---|
| Customer (buyer/owner) | Website signup → onboarding → customer dashboard (`apps/website/app/dashboard`, 25 pages) + portal | `apps/website/app/` |
| Operator / approver | Operator dashboard (`apps/dashboard`, 95 pages): approval queue, audit, governance | `apps/dashboard/app/` |
| Tenant admin | Team, tenant settings, branding, SSO/MFA config | `routes/auth/*`, `TenantSsoConfig`, `TenantBranding` |
| Developer (API consumer) | SDK (`AgentFarmClient`), `af` CLI, REST `/v1/*`, API keys | `packages/sdk`, `packages/cli` |
| AgentFarm staff (superadmin) | Admin provisioning, portal data, onboarding config | `routes/admin/*` |

## 3. Functional Requirements (implemented)

### FR-1 Agent catalog — 15 roles
developer, full-stack-developer, mobile, devops, tester, business-analyst, project-manager, corporate-assistant, sales-agent, marketing-specialist, content-writer, technical-writer, recruiter, customer-support-executive, agentfarm-support; meeting-agent as a voice-presence sub-agent. Each implements the standard RAG pattern (retriever + lesson pipeline + category taxonomy — see CLAUDE.md table).
*Evidence:* `apps/agent-runtime/src/agents/`.

### FR-2 Task lifecycle
Intake (UI/API/webhook/email/Slack/scheduler) → LLM planning → risk classification (LOW auto / MEDIUM-HIGH approval) → execution via action tiers → evidence + audit → billing metering → RAG ingestion.
*Evidence:* CLAUDE.md request flow; `routes/runtime/*`; `services/approval-service`.

### FR-3 Approvals & governance
Risk-routed approval queue with decision locking (409 on re-decision) and latency tracking; kill-switch with 30-second control window and incident reference to resume; circuit breakers; budget policies (daily/monthly caps, 80% warn, 90% throttle); plugin allowlist/killswitch; OPA policy evaluation; A/B testing framework.
*Evidence:* `routes/governance/*`, `services/policy-engine`, `services/approval-service`.

### FR-4 Connectors — 23 tools, 5 categories
Task trackers (Jira, Linear, Asana, Monday, Trello, ClickUp, generic), messaging (Teams, Slack, Discord, Google Chat, generic), code (GitHub, GitLab, Bitbucket, Azure DevOps, generic), email (Outlook, Gmail, Exchange, SMTP, generic), telephony (Twilio, Vonage, Amazon Connect, Genesys, generic). 34 normalized action types; OAuth2/api_key/basic/bearer/generic auth; token lifecycle workers; health monitoring; marketplace.
*Evidence:* `packages/connector-contracts/src/index.ts` (`CONNECTOR_REGISTRY`), `services/connector-gateway`.

### FR-5 LLM execution — 9 providers + auto
openai, azure_openai, github_models, anthropic, google, xai, mistral, together, deepseek; `auto` mode with 5-minute rolling health scores and per-profile priority lists; mock provider for tests.
*Evidence:* `apps/agent-runtime/src/llm-decision-adapter.ts:62`.

### FR-6 Memory — 4 layers
Short-term (7-day TTL), long-term lessons (TTL + relevance), episodic per-person (pgvector 1536-dim, dual-indexed, GDPR delete), semantic knowledge base (cosine similarity, pre-task recall).
*Evidence:* `packages/memory-service`, memory routes, schema models.

### FR-7 Voice, meetings, telephony
Meeting join/transcribe/speak lifecycle; STT (whisper/voicebox), TTS (kokoro, xtts, mms-tts, voxcpm); FreeSWITCH telephony; Zoom video sidecar + Teams media bot; 12 role voice profiles; EU AI Act Art. 52 disclosure on first utterance.
*Evidence:* `docker-compose.yml`, `docker/`, `services/meeting-agent`.

### FR-8 Desktop & browser automation
Playwright browser actions; containerized desktop VM (Xvfb + x11vnc + noVNC) with screenshot→LLM→action vision loop; dashboard stream panel; desktop action governance.
*Evidence:* `services/browser-actions`, `services/desktop-agent`, `docker/desktop-agent`.

### FR-9 Sales automation domain
Prospects, leads, deals, activities, nurture/sales sequences, proposals, negotiations, calls (records, DTMF), bookings, contracts (ZohoSign webhook), NPS, win/loss.
*Evidence:* `routes/sales/*` (9 files), 13+ Prisma models.

### FR-10 Customer support domain
Support issues with severity/source, diagnosis steps, CSAT, support chat + voice sessions; served by the `agentfarm-support` agent.
*Evidence:* `routes/support/*`, `SupportIssue*` models.

### FR-11 Identity, tenancy, white-label
Multi-tenant (tenant → workspace → user); signed-cookie sessions (customer/internal scopes); SSO; MFA; roles; API keys; separate portal account system; tenant branding.
*Evidence:* `routes/auth/*`, schema models.

### FR-12 Billing
Tenant + per-agent subscriptions; grace/suspension lifecycle with daily sweep; Stripe + Razorpay webhooks; checkout sessions; invoices/orders; $0.10/task metering; budget enforcement.
*Evidence:* `routes/platform/billing.ts`, subscription models, README.
Public pricing tiers: **Unknown – confirm with product owner** (page exists at `apps/website/app/pricing`).

### FR-13 Observability & developer tooling
OTEL + Azure Monitor; SSE live task feed; analytics + CSV export; outbound webhooks (HMAC-signed, DLQ + replay); scheduled reports; CI failure triage; repro packs; PR drafts; IDE state sync; env reconciler; knowledge graph.
*Evidence:* `routes/platform/*`, `routes/workspace/*`, `routes/connectors/outbound-webhooks.ts`.

## 4. Non-Functional Requirements (as implemented)

| NFR | Implementation |
|---|---|
| Security | See [SECURITY.md](SECURITY.md) — fail-closed CORS/webhooks, HMAC inter-service auth, helmet, dual-layer rate limits, AES-256-GCM field encryption, log redaction |
| Compliance | EU AI Act Art. 52 / FTC / CA SB 1001 disclosure; GDPR episodic delete; append-only audit; compliance export (365/730-day retention) |
| Scalability | Multi-tenant Postgres + Redis; per-tenant rate limits; worker delegation (`AF_WORKERS_DISABLED`); Azure VM-per-workspace provisioning |
| Reliability | Healthchecks on all runtime containers; circuit breakers; provider auto-failover; task lease/retry; webhook DLQ |
| Targets (uptime %, latency, tasks/day) | Stated in BRD; **measurement not implemented — Unknown** |

## 5. Out of Scope / Not Implemented (verified absences)

- No mobile app for operators (mobile *agent role* exists; an operator mobile client does not).
- No on-prem/self-hosted distribution packaging beyond docker-compose (no Helm charts found).
- No SOC 2 / ISO artifacts in repo — certification status **Unknown**.

## 6. Open Product Questions

1. Pricing tier definitions and packaging (per-agent vs per-task balance).
2. Which of the 15 agents are *sold* today vs internal/beta — IMPLEMENTATION_STATUS history suggests staged rollout; current sellable list **Unknown**.
3. Production tenancy/customer status — **Unknown**.
4. Voice-model licensing for commercial use — **Unknown**.
