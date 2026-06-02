# Operations — Detailed Reference

> **Section:** Operations (root route `/`)
> **Auth:** All pages require a valid `agentfarm_internal_session` cookie. Unauthenticated requests redirect to `/login?next=<path>`.
> **Tab persistence:** The active tab is stored in `localStorage` under the key `agentfarm:dashboard:tab:<workspaceId>` and restored on next visit.

---

## Table of Contents

1. [Overview Tab](#1-overview-tab)
   - [KPI Animated Counters](#kpi-animated-counters)
   - [Operational Signal Timeline](#operational-signal-timeline)
   - [Workspace Budget Panel](#workspace-budget-panel)
   - [Developer Agent Panels](#developer-agent-panels)
   - [Connector Config Panel](#connector-config-panel)
   - [Agent Memory Pattern Panel](#agent-memory-pattern-panel)
   - [Agent Question Panel](#agent-question-panel)
   - [Governance KPI Panel](#governance-kpi-panel)
2. [Approvals Tab](#2-approvals-tab)
   - [Approval Packet Fields](#approval-packet-fields)
   - [Decision Workflow](#decision-workflow)
   - [Filtering and Sorting](#filtering-and-sorting)
   - [Batch Decisions](#batch-decisions)
3. [Observability Tab](#3-observability-tab)
   - [Runtime Health Card](#runtime-health-card)
   - [Runtime Logs Panel](#runtime-logs-panel)
   - [Task Execution Transcripts](#task-execution-transcripts)
   - [Interview Events](#interview-events)
4. [Evidence Tab](#4-evidence-tab)
   - [Event Table Schema](#event-table-schema)
   - [Filters and Export](#filters-and-export)
   - [Plan Gate](#plan-gate)
5. [Activity Page](#5-activity-page)
   - [Event Categories](#event-categories)
   - [Acknowledge Workflow](#acknowledge-workflow)

---

## 1. Overview Tab

**Route:** `/?tab=overview` (default)
**Server component:** `apps/dashboard/app/page.tsx`

The Overview tab is the primary command-centre view. It is **server-rendered** on every page load — no client-side caching. All data is fetched in parallel from the API gateway before the page HTML is sent to the browser.

### API Data Sources

| Endpoint | Data Returned |
|---|---|
| `GET /v1/dashboard/summary` | Tenant-level totals: plan name, active bot count, degraded workspace count, pending approval count |
| `GET /v1/dashboard/workspace/:workspaceId` | Per-workspace slice: provisioning job, connector summaries, recent approvals, recent events |
| `GET /v1/workspaces/:workspaceId/budget/state` | Daily and monthly spend vs limit with hard-stop flag |
| `GET /v1/dashboard/workspace/:workspaceId/historical-metrics?window=12h&bucket=1h` | 12 signal buckets, one per hour, for the past 12 hours |
| `GET /api/v1/workspaces/:workspaceId/questions/pending` | Unanswered agent questions awaiting human input |

All endpoints have a fallback data structure defined in the page component so that partial API failures degrade gracefully rather than breaking the whole page.

---

### Kill-Switch Banner

A sticky red warning banner is rendered at the very top of the overview (above all other panels) whenever a **kill switch is active** for the selected workspace. The banner includes:

- The text "Kill switch active for this workspace" with a timestamp of when it was activated.
- A link directly to `/governance` (the Governance hub, Kill Switches tab) to deactivate it.
- The banner is rendered conditionally based on the `workspace.killSwitchActive` boolean in the workspace slice.

When active, **no new tasks are dispatched** by the agent runtime for the workspace. Existing in-flight tasks are cancelled within the 30-second control window.

---

### KPI Animated Counters

Six KPI tiles are rendered in a horizontal grid. Each tile has:

- A **label** (e.g., "Active Bots").
- An **animated counter** that counts up from 0 to the current value on page load.
- A **colour-coded status badge**: green (low), amber (warn), red (high) — thresholds are hard-coded per metric.
- A **sparkline chart** showing the last 12 data points.
- A **description tooltip** explaining what the metric means.

| Tile | Source Field | Status Thresholds |
|---|---|---|
| Active Bots | `summary.activeBotCount` | low: ≤5, warn: 6–20, high: >20 |
| Pending Approvals | `summary.pendingApprovalCount` | low: 0, warn: 1–5, high: >5 |
| Action Count | `workspace.actionCount` (last 24h) | low: <100, warn: 100–500, high: >500 |
| Estimated Cost | `workspace.estimatedCostUsd` (today) | low: <$5, warn: $5–$25, high: >$25 |
| Connector Errors | `workspace.connectorErrorCount` | low: 0, warn: 1–3, high: >3 |
| Runtime Restarts | `workspace.runtimeRestartCount` (today) | low: 0, warn: 1, high: >1 |

---

### Operational Signal Timeline

A **12-hour bar chart** rendered below the KPI tiles. Each bar represents one hour (12 bars total, newest on the right). Bar height is proportional to the signal count in that bucket.

- Data source: `GET /v1/dashboard/workspace/:workspaceId/historical-metrics?window=12h&bucket=1h`
- The Y-axis auto-scales to the maximum bucket count.
- Bars are colour-coded: blue for normal signal volume, amber for elevated, red for spike.
- Hovering a bar shows a tooltip with the exact timestamp and signal count.
- Clicking a bar opens the full Audit Log (Evidence tab) filtered to that hour.

---

### Workspace Budget Panel

Shows daily and monthly spend progress bars side by side.

- **Daily bar:** Current day spend (USD) / daily limit (USD). Percentage displayed.
- **Monthly bar:** Current month spend (USD) / monthly limit (USD).
- **Hard-stop indicator:** If the monthly limit is exceeded, a red "Hard Stop Active" badge replaces the progress bar and all further task dispatch is blocked.
- Budget state is fetched from `GET /v1/workspaces/:workspaceId/budget/state`.
- A "Manage Limits" link leads to `/budget` for adjusting thresholds.

---

### Developer Agent Panels

Two panels are dedicated to the primary developer agent configured for the workspace.

#### Developer Agent Overview Panel
- Agent name, role emoji, LLM provider badge.
- Task stats: total tasks, succeeded, failed, pending, success rate.
- Heartbeat age: "last seen X seconds ago" with a pulsing green dot if recent.
- Current task description (truncated to 80 characters) with a "View full task" link to `/tasks?tab=live`.

#### Developer Agent Status Panel
A **provisioning step tracker** for the agent VM lifecycle. Each step shows a check (completed), spinner (in-progress), or clock (queued):

1. Queued
2. Validating
3. Creating resources
4. Bootstrapping VM
5. Starting container
6. Registering runtime
7. Health-checking
8. Completed

When a step has been in-progress for longer than its SLA (configurable, default 5 minutes per step), an amber "SLA breach" flag appears next to that step. The current provisioning job ID and start time are shown in the panel footer.

---

### Connector Config Panel

Health status cards for every connector configured in the workspace:

| Connector | Auth Method | Actions Available |
|---|---|---|
| Jira | OAuth 2.0 | Re-authorise, Test connection |
| GitHub | OAuth 2.0 | Re-authorise, Test connection |
| Microsoft Teams | OAuth 2.0 | Re-authorise, Test connection |
| Email | API Key / SMTP | Edit credentials, Test SMTP |
| Custom API | API Key / Bearer / Basic | Edit, Test |

Each card shows:
- Current status: `connected` (green), `token_expired` (amber), `degraded` (red), `not_configured` (grey).
- Last healthcheck timestamp.
- Last error class (if any).
- Remediation hint (from the API gateway connector health response).

Clicking "Re-authorise" for OAuth connectors opens the OAuth consent flow in a new tab. Clicking "Test connection" sends a test ping to the connector and shows the result inline.

---

### Agent Memory Pattern Panel

Displays the most recently reinforced memory patterns for the active agent. Each pattern card shows:

- Pattern key (e.g., `fsd:lesson:code_quality:ws_primary_001:<lessonId>`).
- Pattern category (e.g., "code_quality", "testing_strategy").
- Confidence score (0.0–1.0) from the last lesson pipeline classification.
- Last reinforced timestamp.
- A short excerpt of the lesson content.

Clicking "View all patterns" navigates to `/memory?tab=patterns`.

---

### Agent Question Panel

Unanswered questions from the agent that are blocking task execution. Each question card shows:

- Question text (from the agent's clarification request).
- Task ID and task description the question relates to.
- Time waiting (how long since the question was raised).
- A free-text **Answer** input field and submit button.

Submitting an answer posts to `POST /api/v1/workspaces/:workspaceId/questions/:questionId/answer` and removes the card. Tasks blocked on the question then resume automatically.

---

### Governance KPI Panel

Four real-time governance metrics:

| Metric | Description |
|---|---|
| Approval Rate | Percentage of actions that were approved (vs auto-rejected or timed out). |
| P95 Decision Latency | 95th percentile of the time between approval creation and operator decision, in seconds. |
| SLA Compliance Rate | Percentage of approvals decided within the SLA window (default 15 minutes). |
| Auto-Approval Rate | Percentage of approvals that were resolved automatically by policy rules without operator input. |

Data is derived from the workspace slice's `governance` field, which the API gateway computes from the approval log at request time.

---

## 2. Approvals Tab

**Route:** `/?tab=approvals`
**Sidebar badge:** Red count badge visible when `pendingApprovalCount > 0`.
**Component:** `ApprovalQueuePanel` in `apps/dashboard/app/components/approval-queue-panel.tsx`

The Approvals tab is the primary **human-in-the-loop decision interface**. Any agent action classified as **medium or high risk** by the policy engine is held here pending an operator decision before execution proceeds.

### Approval State Machine

```
PENDING → approved  → [agent executes action]
        → rejected  → [agent receives rejection, may propose alternative]
        → timed_out → [treated as rejection after SLA window]
        → cancelled → [task was cancelled before decision]
```

Once a decision is made on an approval, it is **locked** — attempting to re-decide returns HTTP 409 Conflict. This prevents race conditions when multiple operators are viewing the same queue.

---

### Approval Packet Fields

Each pending approval contains a structured packet. The **Approval Detail Drawer** (opened by clicking any pending row) renders these fields:

| Field | Type | Description |
|---|---|---|
| `change_summary` | string | Human-readable description of what the agent wants to do (e.g., "Delete 14 test fixture files in `/tests/fixtures/legacy/`"). |
| `impacted_scope` | string | Files, services, or systems affected (e.g., "tests/fixtures/legacy/*.json"). |
| `risk_reason` | string | Why the policy engine flagged this action as medium/high risk. |
| `proposed_rollback` | string | How the change can be undone if the decision is later regretted. |
| `lint_status` | "pass" \| "fail" \| "skip" | Result of the pre-execution lint gate (if applicable). |
| `test_status` | "pass" \| "fail" \| "skip" | Result of the pre-execution test gate (if applicable). |
| `packet_complete` | boolean | Whether all required packet fields were populated. Incomplete packets get an amber warning. |
| `gate_type` | string | Which gate type triggered the approval (e.g., "destructive_action", "external_api_write"). |
| `gate_category` | string | Sub-category of the gate (e.g., "file_delete", "email_send"). |
| `approval_id` | string | UUID of the approval record. |
| `risk_level` | "high" \| "medium" \| "low" | Risk classification from the policy engine. |
| `requested_at` | ISO timestamp | When the approval was created. |
| `task_id` | string | Parent task that triggered the approval. |
| `action_type` | string | The specific action type (e.g., `delete_files`, `send_email`, `git_push`). |

---

### Decision Workflow

#### Making a Decision

1. Click a pending approval row to open the **Approval Detail Drawer**.
2. Review the change summary, impacted scope, risk reason, and rollback plan.
3. Check lint/test gate status badges.
4. Choose a **Decision Reason** from the preset list or type a free-text reason.
5. Click **Approve** or **Reject**.
6. Decision is posted to `POST /api/approvals/:approvalId/decision` with `{ decision: 'approved' | 'rejected', reason: string }`.
7. The approval row disappears from the pending list and moves to the **Recent Decisions** panel.

#### Decision Reason Presets

Common reasons are offered as quick-select chips:
- "Change is safe and well-scoped"
- "Rollback plan is acceptable"
- "Tested and verified in staging"
- "Scope too broad — restrict to specific files"
- "Risk level too high for current sprint"
- "Requires additional review before approval"

A free-text field is always available alongside the presets.

---

### What-If Options

For certain approval types, the agent pre-generates **alternative safe options** — a set of lower-risk ways to achieve the same goal. These are shown as cards in the drawer below the main approval details:

- Each alternative shows: description, risk level badge, estimated completion time.
- Clicking "Approve Alternative" posts the decision with the alternative's payload override.
- Not all approval types have what-if options — only those where the agent runtime supports it.

---

### Filtering and Sorting

**Saved Views (tab strip):**
- **All** — All pending approvals regardless of risk.
- **Pending High Risk** — Filter to `risk_level = 'high'` only.
- **Aging 15m+** — Filter to approvals pending longer than 15 minutes (approaching SLA breach).
- **My Team** — Filter to approvals raised by agents assigned to the current operator's team (requires team membership data).

**Sort Controls:**
- Requested (Newest) — Default.
- Requested (Oldest) — Surfaces the most time-pressured decisions first.
- Risk Level — High risk first.

**Pagination:** Offset-based, default 20 per page.

---

### Batch Decisions

When multiple approvals share the same `task_id`, they are grouped into a **Batch Decision Card**:

- Shows how many approvals are in the batch.
- Actions: **Approve All**, **Reject All**, or **Review Individually**.
- Approve All / Reject All sends a single batch request to avoid N API calls.

---

### Approval Metrics Bar

A persistent metrics strip above the queue shows:
- Total pending approvals (real-time).
- Total decisions made today.
- P95 decision latency (last 24h) in seconds.
- Average decision latency badge: green (< 60s), amber (60s–300s), red (> 300s).

---

### Recent Decisions Panel

Below the pending queue, a secondary table shows the last 10 completed decisions:

| Column | Description |
|---|---|
| Approval ID | Truncated UUID (clickable to expand full details). |
| Risk Level | High / Medium / Low badge. |
| Outcome | Approved (green) / Rejected (red) / Timed Out (grey). |
| Decided By | Operator email or "system" for auto-approved. |
| Latency | Time between creation and decision. |
| Decided At | Timestamp. |

---

## 3. Observability Tab

**Route:** `/?tab=observability`
**Component:** `RuntimeObservabilityPanel` in `apps/dashboard/app/components/runtime-observability-panel.tsx`

This tab provides deep visibility into the agent runtime's internal execution state. Data is fetched directly from the **agent runtime service** (port 4000) via the dashboard's API proxy layer, not from the API gateway.

### Runtime API Endpoints

| Endpoint | Data |
|---|---|
| `GET /runtime/logs` | Last 50 structured log entries |
| `GET /runtime/state/history` | State machine transition history |
| `GET /runtime/health/live` | Heartbeat counters and runtime health |
| `GET /runtime/transcripts` | Task execution transcripts |
| `GET /runtime/interview-events` | Voice/meeting session events |

All 5 requests are fired in parallel on panel mount.

---

### Runtime Health Card

Displays the liveness of the agent runtime heartbeat loop:

| Field | Description |
|---|---|
| Heartbeat Status | Running / Stopped / Unknown |
| Heartbeats Sent | Cumulative count since service start |
| Heartbeats Failed | Count of failed heartbeat pings to the API gateway |
| Success Rate | `sent / (sent + failed) × 100` as a percentage |
| Last Heartbeat | Timestamp of the last successful heartbeat |
| Task Queue Depth | Number of tasks currently queued |
| Processed | Total tasks processed since start |
| Succeeded | Tasks with outcome = success |
| Failed | Tasks with outcome = failed |

---

### Current State Display

The runtime state machine's current state is shown prominently at the top of the panel:

| State | Meaning |
|---|---|
| `idle` | Runtime is running but no task is active. |
| `executing` | A task is actively running. |
| `awaiting_approval` | Task is blocked waiting for operator decision. |
| `paused` | Runtime is paused (operator-initiated or kill-switch). |
| `error` | Runtime encountered an unrecoverable error. |
| `shutting_down` | Graceful shutdown in progress. |

The state display includes a colour-coded dot and the elapsed time since the last state transition.

---

### Runtime Logs Panel

A scrollable log panel showing the last 50 structured log entries, each with:

| Field | Description |
|---|---|
| `eventType` | Category of log event (task_start, task_end, heartbeat_sent, action_dispatched, approval_created, error, etc.) |
| `runtimeState` | The state machine state at the time the log was emitted |
| `correlationId` | UUID linking related events across services |
| `detail` | JSON payload (click to expand in a modal) |
| Timestamp | ISO timestamp |

**Filter controls:**
- Event Type (free-text, matches a substring of `eventType`).
- Runtime State (dropdown: all / idle / executing / awaiting_approval / error).
- Bot ID (free-text, filter to logs from a specific bot).
- Workspace ID (free-text).
- Correlation ID (free-text, useful for tracing a single task end-to-end).

---

### State Transition History

An ordered list of every state machine transition:

```
idle → executing          at 2026-06-01T09:23:11Z  reason: task_dequeued
executing → awaiting_approval  at 2026-06-01T09:23:45Z  reason: policy_gate_triggered
awaiting_approval → executing  at 2026-06-01T09:24:12Z  reason: approval_granted
executing → idle           at 2026-06-01T09:24:58Z  reason: task_completed
```

Each transition is clickable to see the full event payload that triggered it.

---

### Task Execution Transcripts

A per-task breakdown of execution. Each transcript entry shows:

| Field | Description |
|---|---|
| Task ID | UUID |
| Action Type | e.g., `write_file`, `git_commit`, `send_email` |
| Risk Level | high / medium / low |
| Route | `execute` (ran directly) or `approval` (sent to approval queue) |
| Status | `success`, `approval_required`, `failed`, `cancelled` |
| Duration | Wall-clock milliseconds from task start to completion |
| Error Message | Populated if status = failed |
| Approval Required | Boolean |
| Approval Summary | Short summary of why approval was required |
| Payload Override Source | Where the action payload came from (original task, what-if alternative, operator override) |

Transcripts are the primary tool for debugging why a task was routed to approval instead of executing directly, or why it failed.

---

### Interview Events

Events from voice/meeting agent sessions (populated only when the Meeting Agent is active):

| Field | Description |
|---|---|
| Turn Index | Sequential turn number in the session |
| Event Type | `partial` (interim STT result) or `final` (confirmed transcript) |
| Text | Transcribed speech text |
| Session ID | Meeting session UUID |
| Role Track | Which participant track (agent / human / unknown) |
| Interrupted Speaking | Whether the speaker was interrupted |
| Follow-Up Question | Agent-generated follow-up question (if any) |
| Final Recommendation | Agent's recommendation at the end of the turn (for final events) |

---

## 4. Evidence Tab

**Route:** `/?tab=audit` (note: param is `audit` for legacy reasons)
**Component:** `EvidenceCompliancePanel` in `apps/dashboard/app/components/evidence-compliance-panel.tsx`

The Evidence tab is the **compliance record** for the workspace. Events are written by the audit storage service as immutable append-only records. This tab provides a filtered, exportable view.

### Plan Gate

If the tenant's plan does not include audit access, the panel renders an `AuditUpgradeWall` instead of the data table. The wall shows:
- Explanation of what the audit/compliance features include.
- A button linking to `/billing` to upgrade.
- No data is exposed below the current plan tier.

Business+ plan is required to access Evidence.

---

### Event Table Schema

Each audit event has these columns:

| Column | Description |
|---|---|
| Event ID | UUID, sortable |
| Bot ID | Which agent produced this event |
| Event Type | Category string (e.g., `action_executed`, `approval_created`, `connector_healthcheck`, `task_failed`) |
| Severity | `info`, `warn`, or `error` — colour-coded badge |
| Summary | Human-readable one-line description |
| Source System | Which service emitted the event (e.g., `agent-runtime`, `connector-gateway`, `api-gateway`) |
| Correlation ID | UUID linking all events from the same task execution |
| Created At | ISO timestamp, newest first by default |

Default page size: 50 events. Offset-based pagination.

---

### Filters and Export

**Filter controls:**
- **Severity:** Multi-select (info / warn / error).
- **Event Type:** Free-text substring match.
- **Bot ID:** Free-text exact match.
- **Date range:** From/To date pickers.
- **Limit:** Override the page size (max 500 per request).
- **Freshness Warning:** An amber banner appears if the most recent event is older than 120 minutes, indicating possible audit pipeline lag.

**Export Presets (one-click):**

| Preset | Filter Applied |
|---|---|
| Last 24h | `from = now - 24h` |
| Last 7 Days | `from = now - 7d` |
| Severity: Error | `severity = error` |
| All Workspace Events | No filter (downloads everything up to the retention limit) |

Exports are provided as CSV or JSON (user's choice).

---

### Retention Control

The retention period can be set directly from this panel:
- Input field: number of days (e.g., 90).
- Posts to `PUT /api/v1/workspaces/:workspaceId/evidence/retention` with `{ days: number }`.
- The change takes effect immediately for new events; existing events are purged on the next nightly TTL sweep.

---

## 5. Activity Page

**Route:** `/activity`
**Component:** `ActivityEventsPanel` in `apps/dashboard/app/components/activity-events-panel.tsx`
**Auth:** Redirects to `/login?next=/activity` if session cookie is missing.

Unlike the Evidence tab (which is the immutable compliance record), the Activity page is designed for **real-time operational monitoring** with an acknowledgement workflow. Activity events are ephemeral — they age out after a configurable period.

### Event Feed Structure

Each activity event has:

| Field | Description |
|---|---|
| Event ID | UUID |
| Title | Short headline (e.g., "Task completed: write feature flag code") |
| Body | Longer description with context |
| Category | One of the 7 categories below |
| Status | `unread`, `read`, or `acked` |
| Sequence Number | Monotonically increasing, used for ordering |
| Correlation ID | Cross-reference to Evidence tab |
| Created At | Timestamp |

---

### Event Categories

Each category has a colour-coded badge and icon in the feed:

| Category | Colour | Examples |
|---|---|---|
| `runtime` | Blue | Task started, task completed, task failed, heartbeat restored |
| `approval` | Amber | Approval created, approval decided, approval timed out |
| `ci` | Purple | CI failure detected, CI triage complete, patch proposed |
| `connector` | Green | Connector re-authed, connector health restored, token refreshed |
| `provisioning` | Red | VM boot started, VM boot failed, runtime registered |
| `security` | Dark red | Suspicious login attempt, rate limit exceeded, token revoked |
| `system` | Grey | Worker restarted, migration applied, config reloaded |

---

### Acknowledge Workflow

The activity feed supports a simple **read → acknowledged** progression:

1. New events arrive with status `unread` (shown with a "New" badge).
2. Viewing an event automatically transitions it to `read` (Seen).
3. Clicking **Acknowledge** marks it as `acked` — this indicates an operator has consciously reviewed and noted the event. Sends `PATCH /v1/activity/events/:id` with `{ status: 'acked' }`.

Acknowledged events are visually dimmed in the feed. The category filter tab strip shows unacknowledged counts per category.

---

### Polling

The panel auto-polls `GET /v1/activity/events` every 15 seconds. The request includes the sequence number of the latest known event as a cursor, so only new events are fetched in subsequent requests.
