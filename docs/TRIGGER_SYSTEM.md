# AgentFarm Trigger System

> Last updated: May 10, 2026 | AgentFarm monorepo audit

Full reference for the trigger service in `apps/trigger-service`.

---

## Overview

The trigger service is a standalone Fastify server that receives inbound events from external systems (Slack, Email, Webhooks) and routes them to the correct agent runtime. It is the entry point for all external-to-agent communication.

**Port:** `TRIGGER_SERVICE_PORT` env var (default: 3002)

---

## Architecture

```
External Event
      │
      ▼
TriggerSource (Slack / Email / Webhook)
      │  raw event: { id, source, from, subject?, body }
      ▼
TriggerEngine.handleEvent()
      │
      ├─→ TriggerRouter.route(body, from)
      │       Single tenant → direct shortcut
      │       Multi tenant → LLM routing (claude-haiku)
      │           → { tenantId, agentId, reason }
      │
      ├─→ TriggerDispatcher.dispatch(event)
      │       POST {agentRuntimeUrl}/run-task
      │           { task, tenantId, agentId, triggerId, source }
      │
      └─→ ReplyDispatcher.reply(event, dispatchResult)
              Sends success/error reply back to originating channel
```

---

## TriggerEngine

**File:** `apps/trigger-service/src/trigger-engine.ts`

Orchestrates all `TriggerSource` adapters. On startup, calls `source.start(onEvent)` for each registered source.

```typescript
class TriggerEngine {
  constructor(config: TriggerServiceConfig, sources: TriggerSource[])
  async start(): Promise<void>   // Starts all sources
  async stop(): Promise<void>    // Graceful shutdown
  private async handleEvent(raw: RawEvent): Promise<void>
}
```

---

## TriggerRouter

**File:** `apps/trigger-service/src/trigger-router.ts`

Routes raw events to the correct tenant and agent.

### Single-Tenant Mode
- When exactly 1 tenant is configured, routes directly to `tenant.defaultAgentId` — no LLM call.

### Multi-Tenant Mode
- Uses `claude-haiku-4-5-20251001` via Anthropic API
- System prompt lists all tenants and their agents with descriptions
- Returns `{tenantId, agentId, reason}` as JSON
- Falls back to the first tenant if Anthropic API key is missing or call fails

### Config
```typescript
type TriggerServiceConfig = {
  tenants: Array<{
    tenantId: string;
    name?: string;
    defaultAgentId: string;
    agents: Array<{ agentId: string; description: string }>;
  }>;
  agentRuntimeUrl: string;
  anthropicApiKey?: string;
  anthropicApiVersion?: string;
}
```

---

## TriggerDispatcher

**File:** `apps/trigger-service/src/trigger-dispatcher.ts`

Sends the routed event to the agent runtime.

```typescript
class TriggerDispatcher {
  constructor(agentRuntimeUrl: string)
  async dispatch(event: TriggerEvent): Promise<DispatchResult>
}
```

**POST** `{agentRuntimeUrl}/run-task` with:
```json
{
  "task": "[subject] body",
  "tenantId": "...",
  "agentId": "...",
  "triggerId": "event.id",
  "source": "slack|email|webhook"
}
```

**DispatchResult:**
```typescript
type DispatchResult = {
  ok: boolean;
  taskRunResult?: unknown;
  error?: string;
}
```

---

## ReplyDispatcher

**File:** `apps/trigger-service/src/reply-dispatcher.ts`

Sends a reply back to the channel that originated the event.

- Slack events → reply via Slack connector
- Email events → reply via Email connector
- Webhook events → no reply (fire and forget)
- Failed dispatches → logs error, optionally notifies via fallback channel

---

## Trigger Sources

### WebhookTriggerSource
**File:** `apps/trigger-service/src/sources/webhook-trigger.ts`

- Listens on `POST /webhook` (Fastify route)
- **HMAC-SHA256 verification:** `X-Hub-Signature-256: sha256=<hex>` header
  - Timing-safe comparison — rejects if missing or invalid
  - Shared secret from `WEBHOOK_SECRET` env
- Payload parsed as JSON `{id, from, subject?, body}`

### SlackTriggerSource
**File:** `apps/trigger-service/src/sources/slack-trigger.ts`

- Handles Slack Events API (`type: "event_callback"`)
- Slack URL verification challenge response
- Filters `message` event subtypes; ignores bot messages
- Parses `text`, `user`, `channel` from Slack event
- Verifies `X-Slack-Signature` using Slack signing secret

### EmailTriggerSource
**File:** `apps/trigger-service/src/sources/email-trigger.ts`

- IMAP-based polling of configured inbox
- Parses subject → `event.subject`, body text → `event.body`
- `from` field extracted from email sender
- Polling interval: `EMAIL_POLL_INTERVAL_MS` env (default: 60000)

---

## TriggerEvent Type

```typescript
type TriggerEvent = {
  id: string;           // Unique event ID
  source: 'slack' | 'email' | 'webhook';
  from: string;         // Sender identifier (email, Slack user ID, etc.)
  subject?: string;     // Email subject or Slack channel name
  body: string;         // Message text
  tenantId: string;     // Resolved by TriggerRouter
  agentId: string;      // Resolved by TriggerRouter
}
```

---

## Environment Variables

| Variable | Purpose | Required |
|---|---|---|
| `TRIGGER_SERVICE_PORT` | HTTP port | No (default: 3002) |
| `AGENT_RUNTIME_URL` | Base URL of agent-runtime | Yes |
| `ANTHROPIC_API_KEY` | For multi-tenant LLM routing | Only for multi-tenant |
| `WEBHOOK_SECRET` | HMAC secret for webhook verification | Yes for webhooks |
| `SLACK_SIGNING_SECRET` | Slack signature verification | Yes for Slack |
| `EMAIL_POLL_INTERVAL_MS` | Email poll frequency | No (default: 60000) |
| `IMAP_HOST` | IMAP server host | Yes for email |
| `IMAP_PORT` | IMAP port | No (default: 993) |
| `IMAP_USER` | IMAP username | Yes for email |
| `IMAP_PASSWORD` | IMAP password | Yes for email |

---

## Tests

| File | Tests |
|---|---|
| `trigger-router.test.ts` | Multi/single-tenant routing, LLM fallback |
| `trigger-dispatcher.test.ts` | Dispatch success/failure, payload format |
| `reply-dispatcher.test.ts` | Reply routing per source type |
