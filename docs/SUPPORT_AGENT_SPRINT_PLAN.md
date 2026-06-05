# AgentFarm Support Agent — Sprint Plan

> **Document:** [SUPPORT_AGENT.md](SUPPORT_AGENT.md)
> **Starts:** Sprint 19
> **Ends:** Sprint 24 (6 sprints × 2 weeks = 12 weeks)
> **Previous sprint:** Sprint 18 complete

---

## Sprint Summary

| Sprint | Theme | Goal |
|---|---|---|
| Sprint 19 | Foundation | Agent core, platform diagnostics, Tier 1 config fixer |
| Sprint 20 | Text Channel | API routes + text chat bot (WebSocket) |
| Sprint 21 | Dashboard | Support dashboard page + all 5 panels |
| Sprint 22 | Voice Bot | Sarvam real-time STT/TTS + voice widget |
| Sprint 23 | Fix Tiers 2 & 3 | Developer agent dispatch + DevOps agent dispatch |
| Sprint 24 | Flywheel & Polish | RAG retriever, lesson pipeline, hardening, metrics |

---

## Sprint 19 — Foundation

**Theme:** Build the brain before the UI. Nothing visible to customer yet.

**Goal:** The support agent can ingest an issue, read the platform internals for a tenant, identify the root cause, and apply a Tier 1 config fix automatically.

### Deliverables

#### 1. Agent Profile
**File:** `apps/agent-runtime/src/agents/agentfarm-support/agent-profile.ts`

- Define `AGENTFARM_SUPPORT_ALLOWED_CONNECTORS`: github, slack, microsoft_teams, pagerduty, datadog, grafana
- Define `AGENTFARM_SUPPORT_ALLOWED_ACTIONS` (full list from SUPPORT_AGENT.md section 4.2)
- Role name: `agentfarm-support`

#### 2. Platform Diagnostics Module
**File:** `apps/agent-runtime/src/agents/agentfarm-support/platform-diagnostics.ts`

Functions to implement:
- `readTaskLogs(tenantId, timeWindowHours)` — query Task table, return last N tasks with status + error
- `readOtelTraces(tenantId, correlationId?)` — pull spans from observability package
- `readConnectorHealth(tenantId)` — call connector-gateway health endpoint, return per-connector status
- `readApprovalQueueState(tenantId)` — count pending approvals, flag jams (> 10 pending, > 30 min stale)
- `readBillingState(tenantId)` — query Subscription + BudgetPolicy tables
- `readProvisioningState(tenantId)` — query ProvisioningJob table, flag stuck jobs (pending > 30 min)
- `readAuditLog(tenantId, limit)` — recent audit entries
- `buildDiagnosisReport(tenantId)` — runs all the above via `Promise.all()`, returns structured report

#### 3. Config Fixer (Tier 1)
**File:** `apps/agent-runtime/src/agents/agentfarm-support/config-fixer.ts`

Fix functions to implement:
- `refreshConnectorToken(tenantId, connectorId)` — call connector-gateway refresh endpoint
- `markConnectorNeedsReconnect(tenantId, connectorId)` — update connector state, notify tenant
- `retryStuckProvisioningJob(tenantId, jobId)` — call provisioning worker retry endpoint
- `notifyTenantBillingLimit(tenantId)` — send notification to tenant admin
- `surfaceApprovalQueueJam(tenantId)` — flag queue state to tenant admin
- `applyTier1Fix(diagnosisReport)` — decides which fix(es) to apply based on report, returns fix result

#### 4. Action Handler (skeleton)
**File:** `apps/agent-runtime/src/agents/agentfarm-support/action-handler.ts`

- Implement `agentfarm_support_issue_ingest`
- Implement `agentfarm_support_diagnose` (calls `buildDiagnosisReport`)
- Implement `agentfarm_support_config_fix` (calls `applyTier1Fix`)
- Stub out remaining actions (Tier 2, Tier 3, voice, escalate) with `not-yet-implemented` returns

#### 5. MCP Provisioner
**File:** `apps/agent-runtime/src/agents/agentfarm-support/mcp-provisioner.ts`

- Map: github → `MCP_GITHUB_URL`, slack → `MCP_SLACK_URL`, pagerduty → `MCP_PAGERDUTY_URL`, datadog → `MCP_DATADOG_URL`, grafana → `MCP_GRAFANA_URL`
- Use existing `createMcpProvisioner` factory

### Tests
- `platform-diagnostics.test.ts` — mock DB + connector-gateway, assert correct report structure
- `config-fixer.test.ts` — mock connector-gateway + provisioning endpoints, assert correct fix chosen per diagnosis
- `action-handler.test.ts` — smoke test each implemented action

### Definition of Done
- [ ] `buildDiagnosisReport()` returns structured data for all 7 data sources
- [ ] Tier 1 fixes all pass unit tests with mocked dependencies
- [ ] Action handler routes to correct module without errors
- [ ] `pnpm --filter @agentfarm/agent-runtime typecheck` passes
- [ ] `pnpm --filter @agentfarm/agent-runtime test` passes (all new tests)

---

## Sprint 20 — Text Channel

**Theme:** First end-to-end flow: customer types an issue, agent responds via WebSocket.

**Goal:** A customer can open a WebSocket text session, describe their issue, and see the agent's diagnosis steps and resolution streamed back in real time.

### Deliverables

#### 1. API Routes (api-gateway)
**Directory:** `apps/api-gateway/src/routes/support/`

- `support-issue.ts`
  - `POST /v1/support/issues` — create new issue record
  - `GET /v1/support/issues` — list issues for tenant (SSE stream)
  - `GET /v1/support/issues/:id` — get issue with full diagnosis trace
  - `POST /v1/support/issues/:id/resolve` — mark resolved, trigger lesson ingest
  - All routes: `getSession()` required, `tenantId`-scoped

- `support-chat-session.ts`
  - `GET /v1/support/chat-session` — WebSocket upgrade
  - On connect: create or resume issue session
  - On message: forward to support agent action handler
  - On agent step: stream step back as JSON frame `{ type: 'step', text, status }`
  - On agent reply: stream back as `{ type: 'reply', text }`
  - On fix applied: stream back as `{ type: 'fix', tier, description }`

#### 2. Route Registry
**File:** `apps/api-gateway/src/route-registry.ts`

- Register support routes under `/v1/support`

#### 3. DB Schema
**File:** `packages/db-schema/prisma/schema.prisma`

New model: `SupportIssue`
```
id, tenantId, workspaceId, title, description, status,
severity, tier_reached, fix_applied, diagnosis_report (JSON),
resolution_notes, escalated_to, created_at, resolved_at
```

New model: `SupportDiagnosisStep`
```
id, issue_id, step_type, description, status, metadata (JSON), created_at
```

Run: `pnpm --filter @agentfarm/db-schema exec prisma migrate dev --name add_support_issue`

#### 4. Action Handler — Chat Reply
**File:** `apps/agent-runtime/src/agents/agentfarm-support/action-handler.ts`

- Implement `agentfarm_support_chat_reply` — formats agent response for chat channel
- Add diagnosis step streaming via callback pattern (same as SSE in other routes)

#### 5. Auth Regression Test
**File:** `apps/api-gateway/src/routes/auth-regression.test.ts`

- Add 401 tests for all new `/v1/support/*` routes (per CLAUDE.md pattern)

### Tests
- `support-issue.test.ts` — CRUD operations, SSE stream, auth checks
- `support-chat-session.test.ts` — WebSocket upgrade, message handling, step streaming
- Auth regression for all new routes

### Definition of Done
- [ ] `POST /v1/support/issues` creates a record, scoped to `tenantId`
- [ ] WebSocket chat session streams diagnosis steps in real time (verified with `wscat` or test client)
- [ ] Agent correctly routes through diagnose → config_fix → chat_reply in a single session
- [ ] All 401 regression tests pass
- [ ] DB migration runs clean
- [ ] `pnpm typecheck` passes across api-gateway + db-schema

---

## Sprint 21 — Dashboard

**Theme:** Make the agent's work visible. Every step the agent takes should be readable by the AgentFarm team.

**Goal:** The support dashboard page is live with all 5 panels. The team can watch an issue being diagnosed and fixed in real time.

### Deliverables

#### 1. Support Dashboard Page
**File:** `apps/dashboard/app/support/page.tsx`

- Auth check: `getSessionPayload()`, redirect to `/login` if no session
- Two-column layout (same grid system as other dashboard pages)
- Renders all 5 panels

#### 2. Issue Feed Panel
**File:** `apps/dashboard/app/components/support-issue-feed.tsx`

- SSE consumer: polls `GET /api/support/issues` (via dashboard proxy)
- Renders list: severity badge, issue summary, status pill, tenant name, time open
- Severity colours: critical = red, high = orange, medium = yellow, low = grey
- Status pills: diagnosing (blue spinner), fixing (purple), escalated (red), resolved (green)
- Click an issue to select it → updates Diagnosis Trace and Fix Timeline panels

#### 3. Diagnosis Trace Panel
**File:** `apps/dashboard/app/components/support-diagnosis-trace.tsx`

- Shows steps for the selected issue from `GET /api/support/issues/:id`
- Each step row: icon (spinner / check / cross), step type label, description, timestamp
- Step types: `reading`, `found`, `applying`, `fixed`, `failed`, `escalating`
- Auto-scrolls to latest step
- Empty state: "Select an issue to view its diagnosis trace"

#### 4. Fix Timeline Panel
**File:** `apps/dashboard/app/components/support-fix-timeline.tsx`

- Shows fix progress for selected issue
- Tier 1 row: auto-fix description + result
- Tier 2 row (if reached): PR link, approval status badge, deploy status
- Tier 3 row (if reached): runbook link, approval status, completion
- Tier 4 row (if reached): escalation recipient, time sent
- Resolution time shown once issue is resolved

#### 5. Chat Widget Panel
**File:** `apps/dashboard/app/components/support-chat-widget.tsx`

- Standard chat thread UI (follow `chat-sessions-panel.tsx` pattern)
- WebSocket to `GET /api/support/chat-session`
- Agent diagnosis steps shown inline as collapsible grey blocks
- Customer messages on right, agent messages on left
- Input field with Enter-to-send
- Shows "Agent is diagnosing..." typing indicator while processing

#### 6. Dashboard Proxy Routes (api-gateway forwarding)
**File:** `apps/dashboard/app/api/support/[...path]/route.ts`

- Proxy all `/api/support/*` to `api-gateway /v1/support/*` (same pattern as `app/api/[...path]/route.ts`)
- Pass `X-Dashboard-Token` header

#### 7. Navigation
**File:** `apps/dashboard/app/components/` (nav component)

- Add "Support" nav item to sidebar under a new "Platform" section (or alongside existing items)

### Tests
- Visual test: snapshot of `support-issue-feed.tsx` with mock data
- Visual test: snapshot of `support-diagnosis-trace.tsx` with mock steps
- `pnpm --filter @agentfarm/dashboard typecheck` passes

### Definition of Done
- [ ] `/support` page loads without errors (empty state is handled)
- [ ] Issue Feed populates via SSE when there are active issues
- [ ] Diagnosis Trace updates in real time as agent works
- [ ] Fix Timeline shows correct tier reached for each issue
- [ ] Chat widget sends and receives messages via WebSocket
- [ ] Dashboard proxy correctly forwards to api-gateway
- [ ] Nav item for Support is visible in sidebar

---

## Sprint 22 — Voice Bot

**Theme:** Customer speaks, agent responds. Full real-time voice loop via Sarvam AI.

**Goal:** A customer can click "Begin Call", speak their issue in any supported language, and hear the agent's response within 2 seconds of finishing speaking.

### Deliverables

#### 1. Sarvam Real-Time STT Client
**File:** `services/meeting-agent/src/sarvam-realtime-stt.ts`

- Class `SarvamRealtimeSttClient`
- Opens WebSocket to `wss://api.sarvam.ai/speech-to-text/transcribe/ws`
- Method `startSession(onPartialTranscript, onFinalTranscript)` — opens WS, sets up handlers
- Method `sendAudioChunk(chunk: ArrayBuffer)` — forwards mic audio to Sarvam
- Method `endSession()` — closes WS cleanly
- Auto-detects language from `language_code` in response
- Handles reconnection on WS drop (max 3 retries)

#### 2. Sarvam Real-Time TTS Client
**File:** `services/meeting-agent/src/sarvam-realtime-tts.ts`

- Class `SarvamRealtimeTtsClient`
- Uses HTTP streaming endpoint: `POST /text-to-speech/convert-stream`
- Method `synthesizeStream(text, languageCode)` — returns `AsyncIterable<ArrayBuffer>`
- Streams audio chunks back as they arrive (no waiting for full audio)
- Uses same `SPEAKER_MAP` as existing `sarvam-tts-client.ts`

#### 3. Voice Session Route (api-gateway)
**File:** `apps/api-gateway/src/routes/support/support-voice-session.ts`

- `GET /v1/support/voice-session` — WebSocket upgrade
- On connect: auth check (session cookie), create voice session, spin up `SarvamRealtimeSttClient`
- On binary message: forward audio chunk to Sarvam STT
- On partial transcript: send `{ type: 'transcript_partial', text }` back to browser
- On final transcript: send to support agent, get response text
- Response text → `SarvamRealtimeTtsClient.synthesizeStream()` → stream audio chunks back as binary WS frames
- On disconnect: close STT session cleanly

#### 4. Voice Widget
**File:** `apps/dashboard/app/components/support-voice-widget.tsx`

- "Sarvam Voice Assistant" header + bot icon (matches screenshot)
- "Begin Call" button with phone icon
- On click: `getUserMedia({ audio: true })`, open WebSocket to `/api/support/voice-session`
- Active call state:
  - "Listening..." / "Agent is responding..." status indicator
  - Live transcript display (partial transcripts update in real time)
  - Detected language badge (e.g., "hi-IN")
  - Mute button (stops sending audio chunks, keeps WS open)
  - End Call button (closes WS)
- Handles browser permissions: shows "Microphone access needed" if denied
- Audio playback: `AudioContext` + `AudioWorklet` or `MediaSource` to play streaming chunks

#### 5. Action Handler — Voice Reply
**File:** `apps/agent-runtime/src/agents/agentfarm-support/action-handler.ts`

- Implement `agentfarm_support_voice_reply`
- Formats response text appropriate for speech (no markdown, shorter sentences)
- Returns text to voice session route for TTS synthesis

### Tests
- `sarvam-realtime-stt.test.ts` — mock WebSocket, assert chunk forwarding + transcript callbacks
- `sarvam-realtime-tts.test.ts` — mock fetch streaming, assert chunk iteration
- `support-voice-session.test.ts` — mock WS upgrade, assert binary frame handling

### Definition of Done
- [ ] Voice session WebSocket opens and closes cleanly
- [ ] Browser mic audio reaches Sarvam STT (verified with real API key in dev)
- [ ] Partial transcripts display on screen while speaking
- [ ] Agent response plays back as audio within 2 seconds of finishing speaking
- [ ] Language auto-detection works for at least Hindi and English
- [ ] Mute and End Call work correctly
- [ ] No audio chunk memory leak (session cleaned up on disconnect)
- [ ] All new unit tests pass

---

## Sprint 23 — Fix Tiers 2 & 3

**Theme:** The agent can now fix actual bugs and infra issues, not just config problems.

**Goal:** For a code-level bug, the agent creates a PR via the developer agent. For an infra failure, the agent dispatches to the devops agent. Both go through the approval service.

### Deliverables

#### 1. Code Fix Dispatcher (Tier 2)
**File:** `apps/agent-runtime/src/agents/agentfarm-support/code-fix-dispatcher.ts`

- `buildCodeFixRequest(diagnosisReport, issueDescription)` — formats context for developer agent
  - Includes: error message, stack trace, relevant file paths from diagnosis report, reproduction steps
- `dispatchToDeveloperAgent(codeFixRequest)` — creates a task in the developer agent's queue
  - Uses internal HMAC token (`RUNTIME_TASK_SHARED_TOKEN`) to create the task
  - Task goal: "Fix [issue description]. Context: [diagnosis report]. Create a PR."
- `pollPrStatus(taskId)` — polls task status until PR is raised or fails (max 30 min)
- `notifyCustomerPrRaised(issueId, prUrl)` — sends chat/voice update to customer

#### 2. Infra Fix Dispatcher (Tier 3)
**File:** `apps/agent-runtime/src/agents/agentfarm-support/infra-fix-dispatcher.ts`

- `buildInfraFixRequest(diagnosisReport)` — formats context for devops agent
  - Includes: failing service name, error type, recent deploy history, resource metrics
- `dispatchToDevopsAgent(infraFixRequest)` — creates task in devops agent queue
  - Same HMAC pattern as code fix dispatcher
  - Task goal: "Investigate and fix [service] failure. Context: [diagnosis report]."
- `pollRunbookStatus(taskId)` — polls until runbook executed or fails (max 60 min)
- `notifyCustomerInfraFixed(issueId, runbookSummary)` — sends update to customer

#### 3. Escalation Handler
**File:** `apps/agent-runtime/src/agents/agentfarm-support/escalation-handler.ts`

- `buildEscalationReport(diagnosisReport, triedTiers)` — compiles full context document
  - What was tried (Tier 1, 2, 3 results), what failed, what data was found
  - Ready for a human to pick up with zero additional investigation
- `sendEscalation(escalationReport, channel)` — sends to Slack channel or PagerDuty
  - Uses `MCP_SLACK_URL` or `MCP_PAGERDUTY_URL` from provisioner
- `updateIssueEscalated(issueId, escalationDetails)` — updates DB record

#### 4. Action Handler — Wire Up Tiers 2, 3, Escalation
**File:** `apps/agent-runtime/src/agents/agentfarm-support/action-handler.ts`

- Implement `agentfarm_support_code_fix_dispatch` (calls code-fix-dispatcher)
- Implement `agentfarm_support_infra_fix_dispatch` (calls infra-fix-dispatcher)
- Implement `agentfarm_support_escalate` (calls escalation-handler)
- Implement `agentfarm_support_resolve` (marks issue resolved, triggers lesson ingest stub)
- Full tier decision logic: Tier 1 → if fails → Tier 2 → if fails → Tier 3 → if fails → Tier 4

#### 5. Approval Integration
- Tier 2 and 3 dispatched tasks automatically go through existing `approval-service`
- No new approval code needed — developer and devops agents already have approval gates
- Support agent polls task status and surfaces approval decision to customer via chat/voice

### Tests
- `code-fix-dispatcher.test.ts` — mock developer agent task creation + PR status polling
- `infra-fix-dispatcher.test.ts` — mock devops agent task creation + runbook polling
- `escalation-handler.test.ts` — mock Slack/PagerDuty MCP, assert report structure
- Integration: full tier decision flow (mock all 3 tiers failing → assert escalation fires)

### Definition of Done
- [ ] Tier 2 creates a developer agent task with correct context (verified via mock)
- [ ] Tier 3 creates a devops agent task with correct context (verified via mock)
- [ ] Escalation sends report to configured channel with complete context
- [ ] Full tier waterfall: 1 → 2 → 3 → escalate (happy path + failure path tests)
- [ ] Customer is notified at each tier transition via chat
- [ ] Fix Timeline dashboard panel shows Tier 2/3 PR and runbook links correctly
- [ ] `pnpm typecheck` and `pnpm test` pass across agent-runtime

---

## Sprint 24 — Flywheel & Polish

**Theme:** Make the agent smarter over time and production-ready.

**Goal:** RAG retriever and lesson pipeline are live. Agent uses past case history. All edge cases handled. Metrics dashboard shows resolution stats. Ready for internal rollout.

### Deliverables

#### 1. RAG Retriever
**File:** `apps/agent-runtime/src/agents/agentfarm-support/rag-retriever.ts`

Three retrieval paths (same pattern as all other agents):
- `retrieveSimilarCases(workspaceId, issueDescription)` — past resolved issues (sourceType ≠ support_template)
- `retrieveSupportTemplates(workspaceId, category)` — standard fix playbooks (sourceType = support_template)
- `retrieveSupportLessons(workspaceId)` — long-term memory patterns (prefix: support:lesson:)
- `buildSupportRagContext(workspaceId, issueDescription)` — runs all three via `Promise.all()`, returns `contextBlock`

Prepend `ragContext.contextBlock` to support agent system prompt before LLM generation.

#### 2. Lesson Pipeline
**File:** `apps/agent-runtime/src/agents/agentfarm-support/lesson-pipeline.ts`

- `classifyFeedback(feedbackText)` — regex-based category detection (no LLM call)
  - Categories: `config_error`, `code_bug`, `infra_failure`, `billing_issue`, `connector_failure`, `provisioning_error`, `user_error`
  - Default: `config_error`
- `ingestApprovedCase(issueId, tenantId, workspaceId, resolution)` — writes to AgentKnowledgeBase
- `ingestSupportFeedback(issueId, feedbackText, workspaceId)` — classifies + writes to AgentLongTermMemory
- `buildSupportEpisodicPattern(lessonId, category, lesson)` — formats lesson record
- `buildSupportSummary(workspaceId)` — aggregates lesson counts by category

Wire up in `action-handler.ts`: call `ingestApprovedCase` in `agentfarm_support_resolve`, call `ingestSupportFeedback` when Tier 2/3 fix fails.

#### 3. Resolution Stats Panel
**File:** `apps/dashboard/app/components/support-stats-panel.tsx`

Add a 5th panel to the support dashboard:
- Total issues this week / month
- Breakdown by tier reached (donut chart)
- Average resolution time by tier
- Top 3 most common issue categories
- Tier 1 auto-fix rate (target ≥ 60%)
- API: `GET /v1/support/stats` → new route in support-issue.ts

#### 4. Error Handling & Edge Cases
- Voice session: graceful degradation if Sarvam API is down → fall back to text channel, show message
- Diagnosis: if a data source times out (OTEL, connector-gateway), skip it and note in report, don't fail whole diagnosis
- Tier 2 dispatch: if developer agent queue is full, queue the task and notify customer of delay
- Tier 3 dispatch: if devops agent is busy with another critical issue, escalate immediately (don't wait)
- WebSocket reconnect: if browser WebSocket drops mid-session (network blip), auto-reconnect within 5 seconds and resume session

#### 5. CLAUDE.md Update
**File:** `CLAUDE.md`

Add `agentfarm-support` to the Agent RAG Coverage table with:
- RAG Retriever: `agentfarm-support-rag-retriever.ts`
- Lesson Pipeline: `agentfarm-support-lesson-pipeline.ts`
- Lesson Key Prefix: `support:lesson:`

#### 6. Env Vars
**File:** `.env.example`

Add:
```
SUPPORT_AGENT_WORKSPACE_ID=
SUPPORT_AGENT_BOT_ID=
SUPPORT_SLACK_CHANNEL=
SUPPORT_PAGERDUTY_KEY=
```

### Tests
- `rag-retriever.test.ts` — mock vector search, assert all 3 paths run in parallel, contextBlock format
- `lesson-pipeline.test.ts` — classifyFeedback for all 7 categories, ingest functions
- `support-stats.test.ts` — stats route with mock issue data

### Definition of Done
- [ ] RAG context is prepended to system prompt before every LLM call
- [ ] `classifyFeedback()` correctly categorises all 7 issue types (unit tested)
- [ ] Lesson is written to AgentLongTermMemory after every resolved issue
- [ ] Stats panel shows correct numbers from DB
- [ ] Voice session gracefully falls back to text if Sarvam is unavailable
- [ ] Diagnosis continues with partial data if one source times out
- [ ] `CLAUDE.md` table updated
- [ ] `.env.example` updated with all new vars
- [ ] `pnpm typecheck` passes across all packages
- [ ] `pnpm test` passes across all packages (no regressions)
- [ ] Internal demo: raise a real issue via voice, watch dashboard trace, see Tier 1 fix apply

---

## Cross-Sprint: Files Created Per Sprint

| Sprint | New Files | Modified Files |
|---|---|---|
| 19 | `agent-profile.ts`, `action-handler.ts`, `platform-diagnostics.ts`, `config-fixer.ts`, `mcp-provisioner.ts` + 3 test files | none |
| 20 | `support-issue.ts`, `support-chat-session.ts` + 2 test files, `auth-regression.test.ts` (add cases) | `route-registry.ts`, `schema.prisma` |
| 21 | `support/page.tsx`, 5 panel components, `app/api/support/[...path]/route.ts` | nav component |
| 22 | `sarvam-realtime-stt.ts`, `sarvam-realtime-tts.ts`, `support-voice-session.ts` + 3 test files | `action-handler.ts` |
| 23 | `code-fix-dispatcher.ts`, `infra-fix-dispatcher.ts`, `escalation-handler.ts` + 3 test files | `action-handler.ts` |
| 24 | `rag-retriever.ts`, `lesson-pipeline.ts`, `support-stats-panel.tsx` + 3 test files | `CLAUDE.md`, `.env.example`, `action-handler.ts` |

**Total new files: ~30 files across 6 sprints**

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Sarvam WebSocket STT latency too high for voice UX | Medium | High | Benchmark in Sprint 22 Week 1; if > 500ms, fall back to Deepgram for STT |
| Browser mic audio format incompatible with Sarvam WS | Medium | High | Test PCM 16kHz mono (Sarvam's expected format) before building voice widget UI |
| Platform diagnostics queries are too slow (timeout) | Low | Medium | Add 5-second timeout per source; skip and note in report, don't fail whole flow |
| Developer agent PR quality for auto-generated fixes | Medium | Medium | Scope Tier 2 to only clearly-defined bug patterns initially; expand scope over time |
| Tenant data access — support agent reads too broadly | Low | High | All queries filtered by `tenantId` from session; code-reviewed in Sprint 19 PR |
| Voice session memory leak (audio buffers) | Low | Medium | Explicit cleanup on WS close event; tested with 20-minute call simulation |

---

## Dependencies on Existing Platform

| Dependency | Sprint | Notes |
|---|---|---|
| `createMcpProvisioner` factory | Sprint 19 | Already exists — just pass env map |
| `connector-gateway` token refresh endpoint | Sprint 19 | Verify endpoint exists, add if missing |
| `approval-service` | Sprint 23 | Used indirectly via developer/devops agent tasks — no new integration |
| `developer` agent action handler | Sprint 23 | `RUNTIME_TASK_SHARED_TOKEN` HMAC call |
| `devops` agent action handler | Sprint 23 | Same pattern as developer agent |
| `VoicePipeline` existing code | Sprint 22 | New clients are separate files — no modification to existing pipeline |
| `AgentKnowledgeBase` + `AgentLongTermMemory` Prisma models | Sprint 24 | Already in schema — no migration needed |
| `memory-service` write/search functions | Sprint 24 | Already exists — same imports as other agents |
