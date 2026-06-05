# AgentFarm Support Agent

> **Status:** Planned — Sprint 19 start
> **Type:** Internal platform agent (not a customer product feature)
> **Sprint Plan:** [SUPPORT_AGENT_SPRINT_PLAN.md](SUPPORT_AGENT_SPRINT_PLAN.md)

---

## 1. Overview

The AgentFarm Support Agent is an autonomous internal agent that resolves issues customers raise about the AgentFarm platform itself. It is not a feature sold to customers — it is AgentFarm dogfooding its own product to support its own product.

When a customer reports that their agent is broken, a connector is failing, or a VM is down, the Support Agent reads the platform internals, diagnoses the root cause, and fixes it — automatically where safe, and with human approval where the fix touches code or infrastructure.

**The customer interacts with it through:**
- A text chat widget in the dashboard
- A Sarvam AI voice call ("Begin Call" button) — speaks in 10 Indian languages + English

**The AgentFarm team sees everything it does through:**
- A live support dashboard showing every active issue, diagnosis trace, and fix timeline

---

## 2. Problem It Solves

| Without Support Agent | With Support Agent |
|---|---|
| Customer raises ticket → human support triages → escalates to engineering → fix in hours/days | Customer describes issue → agent reads logs + config in seconds → auto-fixes or raises PR |
| Support engineer needs to know the whole codebase to diagnose | Agent reads OTEL traces, task history, connector health, billing state automatically |
| Every issue handled from scratch | Agent learns from every resolved issue — after 50 cases, Tier 1 fix rate is very high |
| English-only support | Customer can speak in Hindi, Tamil, Telugu, Kannada, Malayalam, Marathi, Bengali, Gujarati, Punjabi, English |

---

## 3. How It Is Different from the Existing Customer Support Agent

| | `customer-support-executive` agent | `agentfarm-support` agent |
|---|---|---|
| **Who uses it** | A customer's own business to support their customers | AgentFarm to support its own tenants |
| **What it knows** | Customer's Zendesk, CRM, orders | AgentFarm's own codebase, logs, DB, infra |
| **What it fixes** | Customer complaints, refunds, tickets | Platform bugs, config errors, infra failures |
| **Access level** | Customer's external SaaS connectors | AgentFarm internal services (tenantId-scoped) |
| **Fix capability** | Responds and escalates | Actually fixes — Tier 1 auto, Tier 2 code PR, Tier 3 infra |

---

## 4. Architecture

### 4.1 High-Level Flow

```
Customer (dashboard chat or Sarvam voice call)
        │
        ▼
Support Chat / Voice Widget  ──WebSocket──▶  api-gateway
        │                                          │
        │                                  support-chat-session.ts
        │                                  support-voice-session.ts
        │                                          │
        ▼                                          ▼
Sarvam Real-Time STT                     Agent Runtime
(browser mic → WebSocket)          agentfarm-support agent
        │                                          │
        │                         ┌────────────────┤
        │                         ▼                ▼
        │                  platform-diagnostics   RAG retriever
        │                  reads:                 past issues +
        │                  - Task logs            lessons
        │                  - OTEL traces
        │                  - Connector health
        │                  - Billing state
        │                  - VM/provisioning
        │                  - Audit log
        │                         │
        │                         ▼
        │                   Fix Decision
        │              ┌──────────┴──────────┐────────────────┐
        │              ▼                     ▼                ▼
        │         Tier 1                Tier 2            Tier 3
        │         Config fix            Code fix          Infra fix
        │         (auto-apply)          → developer       → devops
        │                               agent PR          agent
        │                               + approval        + approval
        │                         │
        ▼                         ▼
Sarvam Real-Time TTS      Response streams
(audio back to browser)   back to customer
```

### 4.2 Component Map

```
apps/
  api-gateway/
    src/routes/support/
      ├── support-issue.ts            REST: CRUD issues, SSE stream
      ├── support-chat-session.ts     WebSocket: text chat
      └── support-voice-session.ts    WebSocket: voice session bridge

  agent-runtime/
    src/agents/agentfarm-support/
      ├── agent-profile.ts            connectors + allowed actions
      ├── action-handler.ts           dispatches all support actions
      ├── platform-diagnostics.ts     reads logs, traces, configs
      ├── config-fixer.ts             Tier 1: auto config fixes
      ├── code-fix-dispatcher.ts      Tier 2: developer agent delegation
      ├── infra-fix-dispatcher.ts     Tier 3: devops agent delegation
      ├── rag-retriever.ts            past issue similarity search
      └── lesson-pipeline.ts          classifyFeedback + flywheel

  dashboard/
    app/support/
      ├── page.tsx                    main support dashboard page
      └── components/
          ├── support-issue-feed.tsx        live issue list (SSE)
          ├── support-diagnosis-trace.tsx   real-time step trace
          ├── support-fix-timeline.tsx      Tier progress + PR links
          ├── support-voice-widget.tsx      "Begin Call" voice button
          └── support-chat-widget.tsx       text chat panel

services/
  meeting-agent/src/
    ├── sarvam-realtime-stt.ts        WebSocket STT streaming client
    └── sarvam-realtime-tts.ts        HTTP streaming TTS client
```

---

## 5. The Three Fix Tiers

### Tier 1 — Auto Config Fix (no approval required)

Applied immediately without human sign-off. These are reversible, low-blast-radius changes.

| Issue | Auto-Fix |
|---|---|
| Connector OAuth token expired | Trigger token refresh in connector-gateway |
| Connector token revoked | Mark connector as needs-reconnect, notify tenant |
| Budget limit hit (90% threshold) | Notify tenant, suggest upgrade, throttle gracefully |
| Provisioning job stuck (status = pending > 30 min) | Retry the stuck step via azure-provisioning-steps |
| Approval queue jammed (> 10 pending, no operator activity) | Surface to tenant admin with escalation nudge |
| Agent VM health check failing | Restart container, re-register runtime |
| Redis connection lost (transient) | Force reconnect, clear stale session keys |

### Tier 2 — Code Fix (developer agent + approval)

The Support Agent asks the existing `developer` agent to write a PR. The PR goes through the `approval-service` before merge. The Support Agent tracks the PR and notifies the customer when deployed.

When used:
- Reproducible bug in an action handler
- Edge case in a provisioner or connector
- Broken MCP server response parsing
- Logic error in billing or audit code

### Tier 3 — Infra Fix (devops agent + approval)

The Support Agent delegates to the existing `devops` agent with full context. DevOps agent creates a runbook and executes with approval gate.

When used:
- Container crash loop in a service
- Redis OOM or memory pressure
- Stuck k8s pod in a bad state
- VM health check consistently failing (hardware/network issue)
- Database migration stuck

### Escalation (Tier 4)

If Tiers 1–3 all fail or the issue requires judgment beyond the agent's scope:
- Agent compiles a full diagnosis report (logs, traces, configs, what was tried)
- Sends to AgentFarm team via Slack / PagerDuty
- Human takes over with full context already assembled — no investigation needed

---

## 6. Voice Bot (Sarvam AI)

### Why Sarvam AI

The existing platform already uses Sarvam AI for meeting agent STT/TTS. Sarvam is optimised for Indian languages and provides:
- WebSocket real-time STT: `wss://api.sarvam.ai/speech-to-text/transcribe/ws`
- HTTP streaming TTS: `POST /text-to-speech/convert-stream`
- 10 Indian languages + English
- Telephony-optimised models (Saarika, Saaras)

### Voice Session Flow

```
1. Customer clicks "Begin Call" in dashboard
2. Browser opens WebSocket to GET /v1/support/voice-session
3. Browser mic captures audio → chunks stream to server
4. Server forwards audio chunks → Sarvam WebSocket STT
5. Partial transcripts stream back to browser (shown on screen)
6. On silence/pause → transcript sent to support agent
7. Agent diagnoses → forms text response
8. Text response → Sarvam HTTP streaming TTS
9. Audio chunks stream back → browser plays immediately (no wait)
10. Customer hears response; agent shows transcript of its own reply
```

### Languages Supported

| Language | STT Speaker | TTS Voice |
|---|---|---|
| Hindi (hi-IN) | Saarika | meera |
| Tamil (ta-IN) | Saarika | pavithra |
| Telugu (te-IN) | Saarika | arvind |
| Kannada (kn-IN) | Saarika | arvind |
| Malayalam (ml-IN) | Saarika | arvind |
| Marathi (mr-IN) | Saarika | amol |
| Bengali (bn-IN) | Saarika | meera |
| Gujarati (gu-IN) | Saarika | meera |
| Punjabi (pa-IN) | Saarika | meera |
| English (en-IN) | Saarika | meera |

Language is auto-detected from the first 3 seconds of speech. Agent responds in the same language.

### Difference from Existing Voice Pipeline

| | Existing `VoicePipeline` (meeting-agent) | New Support Voice |
|---|---|---|
| **Mode** | Batch: record full utterance then transcribe | Real-time: stream chunks as spoken |
| **STT API** | POST /speech-to-text (REST, full file) | WebSocket /speech-to-text/transcribe/ws |
| **TTS API** | POST /text-to-speech (REST, wait for full audio) | POST /text-to-speech/convert-stream (chunked) |
| **Latency** | 2–5 second delay | Sub-second first audio |
| **Use case** | Meeting transcription and summaries | Live conversation |

---

## 7. Support Dashboard

### Page: `/support`

Four-panel layout:

```
┌─────────────────────────────┬────────────────────────────────┐
│  Issue Feed                 │  Diagnosis Trace               │
│                             │                                │
│  • ISSUE-001 — diagnosing   │  ✓ Read task logs (tenant X)  │
│  • ISSUE-002 — fixed (T1)   │  ✓ OTEL trace found           │
│  • ISSUE-003 — PR raised    │  → Connector token expired     │
│  • ISSUE-004 — escalated    │  → Applying Tier 1 fix...      │
│                             │                                │
├─────────────────────────────┼────────────────────────────────┤
│  Fix Timeline               │  Chat / Voice                  │
│                             │                                │
│  ISSUE-001                  │  ┌──────────────────────────┐  │
│  10:32 Tier 1 applied ✓     │  │  Sarvam Voice Assistant  │  │
│  Token refreshed            │  │                          │  │
│                             │  │    ☎  Begin Call         │  │
│  ISSUE-003                  │  └──────────────────────────┘  │
│  10:41 PR #847 raised       │                                │
│  10:52 PR approved ✓        │  ── or type below ──           │
│  11:03 Deployed ✓           │  [ Describe your issue...  ]   │
└─────────────────────────────┴────────────────────────────────┘
```

### Panel Descriptions

**Issue Feed (`support-issue-feed.tsx`)**
- Real-time list via SSE stream from `GET /v1/support/issues`
- Each row: severity badge, issue summary, status (diagnosing / fixing / escalated / resolved), time open, tenant name

**Diagnosis Trace (`support-diagnosis-trace.tsx`)**
- Streams the agent's internal steps in real time
- Each step: icon (reading / found / applying / done / failed), description, timestamp
- Looks like a terminal log but human-readable — no raw JSON

**Fix Timeline (`support-fix-timeline.tsx`)**
- Shows which Tier was reached for each issue
- Tier 2: shows PR link, approval status, deploy status
- Tier 3: shows devops runbook link, approval status
- Tier 4: shows escalation recipient and time

**Voice Widget (`support-voice-widget.tsx`)**
- The "Begin Call" button (matches the screenshot)
- On active call: shows live transcript, mute button, end call
- Shows detected language badge

**Chat Widget (`support-chat-widget.tsx`)**
- Standard chat thread
- Agent's diagnosis steps appear inline as collapsible blocks
- Customer sees: "Checking your connector health... Found: token expired. Fixing now."

---

## 8. RAG Flywheel

Same pattern as all other agents. Lesson key prefix: `support:lesson:`

### Lesson Categories

| Category | Triggers When |
|---|---|
| `config_error` | Connector misconfigured, env var wrong, token stale |
| `code_bug` | Bug found and fixed via Tier 2 PR |
| `infra_failure` | Container/VM/Redis issue fixed via Tier 3 |
| `billing_issue` | Budget exceeded, subscription lapsed |
| `connector_failure` | Connector health check failing, OAuth broken |
| `provisioning_error` | VM provisioning stuck or failed |
| `user_error` | Customer was using the platform incorrectly (docs gap) |

### How It Improves Over Time

```
Issue resolved → ingestApprovedCase() → AgentKnowledgeBase
Issue failed fix → ingestSupportFeedback() → classifyFeedback()
                → AgentLongTermMemory (prefix: support:lesson:<category>)

Next similar issue:
  retrieveSimilarCases()    → "3 months ago, same connector error, fixed by token refresh"
  retrieveSupportTemplates() → "standard token refresh playbook"
  retrieveSupportLessons()   → "token refresh alone not enough if client_id also changed"

After 50 resolved issues → Tier 1 auto-fix rate is very high
After 200 resolved issues → agent predicts fix before customer finishes describing
```

---

## 9. Security and Access Model

### What the Support Agent Can Read (all tenantId-scoped)
- Task execution history (`Task` table, filtered by `tenantId`)
- OTEL traces from `packages/observability`
- Connector health status from `connector-gateway`
- Approval queue from `approval-service`
- Billing and subscription state
- VM provisioning job state
- Audit log entries for the tenant

### What Tier 1 Can Write (auto, no approval)
- Trigger connector token refresh (connector-gateway API)
- Update provisioning job status to retry
- Send notification to tenant admin

### What Tiers 2 and 3 Always Require
- `approval-service` approval before any code is merged or infra is changed
- Every action logged in audit-storage with `correlationId`
- Support agent never writes directly to the database — all writes go through the existing API routes with their own validation

### What the Support Agent Cannot Do
- Access data from one tenant while working on another tenant's issue
- Modify billing records directly
- Delete any data
- Execute arbitrary shell commands (no `workspace_shell_exec` in action list)

---

## 10. Inbound Channels

The trigger-service handles all inbound issue intake:

| Channel | How | File |
|---|---|---|
| Dashboard chat widget | WebSocket → `/v1/support/chat-session` | new `support-chat-session.ts` |
| Dashboard voice widget | WebSocket → `/v1/support/voice-session` | new `support-voice-session.ts` |
| Email to support address | IMAP → trigger-service | existing `email-trigger.ts` |
| Slack DM | Slack trigger → trigger-service | existing `slack-trigger.ts` |
| Webhook (customer monitoring) | POST `/webhooks/ingest/support` | existing `webhook-trigger.ts` |

---

## 11. New Environment Variables Required

| Variable | Purpose | Required |
|---|---|---|
| `SARVAM_API_KEY` | Already in use by meeting-agent | Yes (already set) |
| `SUPPORT_AGENT_WORKSPACE_ID` | Internal AgentFarm workspace ID for the support agent | Yes |
| `SUPPORT_AGENT_BOT_ID` | Bot ID for the support agent instance | Yes |
| `SUPPORT_SLACK_CHANNEL` | Slack channel for Tier 4 escalations | Optional |
| `SUPPORT_PAGERDUTY_KEY` | PagerDuty key for Tier 4 infra escalations | Optional |

---

## 12. Success Metrics

| Metric | Target |
|---|---|
| Tier 1 auto-fix rate | ≥ 60% of issues after 100 resolved cases |
| Median time to resolution (Tier 1) | < 30 seconds |
| Median time to resolution (Tier 2) | < 4 hours (depends on PR review) |
| Customer satisfaction (voice + chat) | ≥ 4.0 / 5.0 |
| Escalation rate to human (Tier 4) | ≤ 15% of issues |
| Issues where root cause was identified | ≥ 95% |
| Voice session completion rate | ≥ 80% (call not dropped mid-session) |
