# Sprint 15 — Corporate Assistant Role

**Status:** PLANNED
**Target start:** 2026-05-22
**Completed:** —
**Quality gate:** — (to be recorded on completion)

---

## Goal

Build the Corporate Assistant role from its current stub in
`apps/agent-runtime/src/role-profiles/index.ts` into a first-class runtime
role with domain task handlers, a dedicated role profile, persona defaults,
episodic hooks, and MCP provisioner — following the same structural pattern as
the Tester role (Sprint 7 Week 4).

By the end of this sprint the Corporate Assistant agent can:
- Compose and send emails through Gmail, Outlook, or SMTP.
- Schedule, check availability for, and cancel calendar events.
- Create and update internal documents in Google Drive or Confluence.
- Route escalation-required requests (legal, finance, HR) to the correct
  human principal with a structured handoff note.
- Record each task outcome as a typed episodic memory pattern.
- Produce a daily standup summary from recent episodic records.

---

## Deliverables

### New files — `apps/agent-runtime/src/`

| File | Purpose |
|---|---|
| `corporate-assistant-agent-profile.ts` | `CORPORATE_ASSISTANT_ROLE_ALLOWED_CONNECTORS`, `CORPORATE_ASSISTANT_ROLE_ALLOWED_LOCAL_ACTIONS`, `CORPORATE_ASSISTANT_BLOCKED_KEYWORDS` — mirrors `tester-agent-profile.ts` |
| `corporate-assistant-persona-defaults.ts` | `getCorporateAssistantDefaultPersona(botId, tenantId)` — returns an `AgentPersonaRecord` fallback; default display name "Corporate Assistant"; disclosure statement for internal ops context — mirrors `tester-persona-defaults.ts` |
| `corporate-assistant-episodic-hooks.ts` | `buildCorporateAssistantEpisodicPattern(task, result)` and `buildCorporateAssistantEpisodicSummary(task, result)` — typed pattern keys: `ca:calendar:scheduled`, `ca:calendar:cancelled`, `ca:email:sent`, `ca:email:routed`, `ca:document:created`, `ca:document:updated`, `ca:escalation:routed` — mirrors `tester-episodic-hooks.ts` |
| `corporate-assistant-mcp-provisioner.ts` | `provisionCorporateAssistantMcpSession(tenantId, gatewayUrl, token)` — fetches tenant MCP servers, auto-registers connectors with known env-var URLs (`MCP_GMAIL_URL`, `MCP_OUTLOOK_URL`, `MCP_GOOGLE_CALENDAR_URL`, `MCP_SLACK_URL`, `MCP_TEAMS_URL`, `MCP_GOOGLE_DRIVE_URL`, `MCP_CONFLUENCE_URL`) — mirrors `tester-mcp-provisioner.ts` |
| `corporate-assistant-standup-builder.ts` | `buildCorporateAssistantStandupSummary(recentMemory, config)` — derives yesterday / today / blockers from episodic records, returns `StandupSummary` — mirrors `tester-standup-builder.ts` |

### New files — `apps/agent-runtime/src/corporate-assistant/`

| File | Purpose |
|---|---|
| `calendar-scheduler.ts` | `checkCalendarAvailability(params)` — queries calendar connectors for free slots. `scheduleCalendarEvent(params)` — creates event on calendar connector, returns event ID and join URL. `cancelCalendarEvent(params)` — cancels event by ID with optional cancellation note |
| `calendar-scheduler.test.ts` | Unit tests: availability check with no slots, availability check with slots, schedule success, schedule connector failure, cancel success, cancel event-not-found |
| `email-composer.ts` | `composeDraftEmail(params)` — builds subject + body from task description and persona. `sendComposedEmail(params)` — dispatches through the email provider resolved from connector config (gmail / outlook / smtp). `classifyEmailIntent(subject, body)` — returns `'reply' \| 'new_thread' \| 'forward'` to guide routing logic |
| `email-composer.test.ts` | Unit tests: composeDraftEmail with persona injection, sendComposedEmail success, sendComposedEmail provider failure, classifyEmailIntent for reply/new/forward |
| `document-preparer.ts` | `createInternalDocument(params)` — creates a document (Drive or Confluence) with structured title + body. `updateExistingDocument(params)` — appends or replaces sections in an existing document by ID. `formatAsAgenda(items)` — pure formatter: converts agenda item list into a meeting-ready plain-text block |
| `document-preparer.test.ts` | Unit tests: createInternalDocument success, createInternalDocument connector error, updateExistingDocument success, formatAsAgenda ordering and formatting |
| `escalation-router.ts` | `classifyEscalationDomain(taskDescription)` — returns `'legal' \| 'finance' \| 'hr' \| 'it' \| 'none'` based on keyword heuristics in task description. `buildEscalationNote(task, domain, persona)` — constructs a structured handoff note for the human principal, including task context, requester, urgency signal, and agent identity |
| `escalation-router.test.ts` | Unit tests: legal keyword triggers legal domain, finance keyword triggers finance domain, HR keyword triggers hr domain, benign task returns none, buildEscalationNote includes all required fields |

### New file — `apps/agent-runtime/src/role-profiles/`

| File | Purpose |
|---|---|
| `corporate-assistant-role-profile.ts` | `CORPORATE_ASSISTANT_BLOCKED_ACTIONS` (Set\<string\>) — hard-blocks developer-class actions (create_pr, review_code, run_tests, search_candidates, etc.). `CORPORATE_ASSISTANT_BLOCKED_KEYWORDS` (string[]) — signals for task classifier. `CORPORATE_ASSISTANT_APPROVAL_THRESHOLDS` — send_email to external domain = medium risk; schedule_meeting with external attendees = low risk; create_document with external share = medium risk — mirrors `developer-role-profile.ts` structure |

### Modified files

| File | Change |
|---|---|
| `apps/agent-runtime/src/role-profiles/index.ts` | Import `CORPORATE_ASSISTANT_ROLE_ALLOWED_CONNECTORS` and `CORPORATE_ASSISTANT_ROLE_ALLOWED_LOCAL_ACTIONS` from `../corporate-assistant-agent-profile.js`; replace inline arrays in `corporate_assistant` profile entry with these imports |
| `apps/agent-runtime/src/runtime-server.ts` | Add import of `getCorporateAssistantDefaultPersona` from `./corporate-assistant-persona-defaults.js` and `provisionCorporateAssistantMcpSession` from `./corporate-assistant-mcp-provisioner.js`; wire into the bot-startup path alongside existing tester wiring |
| `apps/agent-runtime/src/task-classifier.ts` | Import `CORPORATE_ASSISTANT_BLOCKED_KEYWORDS` from `./role-profiles/corporate-assistant-role-profile.js`; add to the classifier's role-keyword guard |

---

## Design Decisions

### Email provider reuse
`email-composer.ts` does not reimplement email sending — it resolves the correct
`IEmailProvider` from the same `email-provider-factory.ts` that the Sales Rep
role already uses. This keeps all email transports (Gmail, Outlook, SMTP, SendGrid,
Mailgun) in a single place.

### Escalation router — keyword heuristics only (no LLM call)
`classifyEscalationDomain` is a pure keyword function, not an LLM call, to keep
latency and cost near zero for the common case. If no domain keyword is matched,
the task proceeds normally. The LLM classification in `task-classifier.ts` handles
the broader "should this task be escalated at all?" question separately.

### Calendar connector abstraction
`calendar-scheduler.ts` targets the MCP calendar connector interface. It does not
call Google Calendar or Outlook Calendar APIs directly. If `MCP_GOOGLE_CALENDAR_URL`
is unset, that connector is simply unavailable for the session (same pattern as
`tester-mcp-provisioner.ts`).

---

## Test Targets

| Package | Target pass count |
|---|---|
| `@agentfarm/agent-runtime` | +35 tests above current baseline |

Validation commands:
```
pnpm --filter @agentfarm/agent-runtime typecheck
pnpm --filter @agentfarm/agent-runtime test
pnpm quality:gate
```
