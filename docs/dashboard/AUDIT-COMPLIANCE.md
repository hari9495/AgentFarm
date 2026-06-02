# Audit & Compliance — Detailed Reference

> **Section:** Audit & Compliance (sidebar)
> **Plan Gate:** All pages in this section are behind the `auditUnlocked` plan gate.  
> Tenants on the Free or Starter plan see an upgrade prompt instead of content.  
> `auditUnlocked` is resolved server-side via `fetchAuditAccess()` in `lib/plan-gate.server`.
> **Auth:** All pages require a valid `agentfarm_internal_session` cookie; redirect to `/login?next=<path>` if missing.

---

## Table of Contents

1. [Audit Log](#1-audit-log)
2. [Session Replay](#2-session-replay)
3. [Operational Signals](#3-operational-signals)
4. [Circuit Breakers](#4-circuit-breakers)

---

## 1. Audit Log

**Route:** `/audit`
**Component:** `AuditLogPanel`
**Plan gate:** `auditUnlocked = true` required.
**API source:** `GET /api/audit/events?page=&limit=50&severity=&category=&workspaceId=&startDate=&endDate=`

The Audit Log is an **append-only record** of every security, governance, and operational event across the tenant. It is the source of truth for compliance reviews, incident investigations, and regulatory reporting.

### Event Table

The table shows 50 events per page (fixed page size). Columns:

| Column | Description |
|---|---|
| Timestamp | ISO 8601 timestamp with millisecond precision |
| Severity | Colour-coded badge: `info` (grey), `warning` (amber), `error` (red), `critical` (dark red) |
| Category | Event category badge (see Category List below) |
| Event Type | Specific event name (e.g., `agent.task.completed`, `approval.decision.made`) |
| Actor | The entity that triggered the event (user ID, agent bot ID, or system) |
| Workspace | Which workspace the event is associated with |
| Description | Human-readable summary of the event (truncated to 120 chars; click to expand) |
| Evidence Link | If the event is linked to an evidence bundle, a chip linking to `/evidence?id=<bundleId>` |

**Row expansion:** Clicking any row opens an inline detail drawer showing:
- Full event description.
- Raw event payload (JSON, formatted with syntax highlighting).
- All event metadata fields.
- Related events (events with the same `correlationId`).
- Chain of custody: ordered list of all events with the same `taskId` or `approvalId`.

### Severity Badges

| Badge | Colour | Meaning |
|---|---|---|
| `info` | Grey | Normal operational events (task started, task completed, etc.) |
| `warning` | Amber | Events that may indicate a problem (retry triggered, rate limit approaching, approval pending too long) |
| `error` | Red | Recoverable errors (task failed, connector error, LLM timeout) |
| `critical` | Dark Red | Unrecoverable or security-relevant events (kill switch triggered, policy violation, auth failure) |

### Event Categories

| Category | Description |
|---|---|
| `runtime` | Task execution lifecycle events |
| `approval` | Approval intake, decision, and timeout events |
| `governance` | Kill switch, circuit breaker, plugin, policy events |
| `connector` | Connector auth, health, and data events |
| `identity` | Authentication, session, and permission events |
| `billing` | Subscription, payment, and budget events |
| `provisioning` | VM and agent lifecycle events |
| `audit` | Audit trail access and export events (meta-audit) |
| `system` | Internal system events (worker health, migration, config reload) |

### Filter Controls

A filter bar above the table:

| Filter | Type | Description |
|---|---|---|
| Date range | Date range picker | From/To dates |
| Severity | Multi-select dropdown | Filter to one or more severity levels |
| Category | Multi-select dropdown | Filter to one or more event categories |
| Event type | Free-text search | Substring match on the event type field |
| Actor | Free-text search | Filter by actor ID (user ID or bot ID) |
| Workspace | Dropdown | Filter to a specific workspace |

Active filters are shown as dismissible chips above the table.

### Export
A **Download** button exports the current filtered result set (not just the current page) as a CSV file. The download is bounded to 10,000 rows maximum; if the filter returns more than that, an amber banner warns that the export is capped and suggests narrowing the date range.

Export columns match the table columns plus the full raw event payload in a JSON column.

### Pagination
Offset-based pagination with Previous / Next buttons and a "Page X of Y" indicator. Jumping to a specific page is supported via a numeric input.

### Append-Only Guarantee
The audit log backend uses a write-only Postgres table with `INSERT`-only permissions for the audit writer role. No `UPDATE` or `DELETE` is ever executed against audit records. The dashboard displays a banner: *"This log is append-only and tamper-evident."*

---

## 2. Session Replay

**Route:** `/audit/session-replay` (supports `?sessionId=<id>`)
**Plan gate:** `auditUnlocked = true` required.
**Components:**
- Without `?sessionId=`: `SessionIndexPanel` — a searchable index of all sessions.
- With `?sessionId=`: `SessionReplayLoader` — the step-by-step replay view for a specific session.

Session Replay allows compliance officers and incident investigators to **reconstruct exactly what an agent did** during a specific agent session, step by step.

---

### SessionIndexPanel (no sessionId)

A table listing all agent sessions for the tenant:

| Column | Description |
|---|---|
| Session ID | UUID (click to open replay) |
| Agent | Bot name and role emoji |
| Started At | Session start timestamp |
| Duration | Total session duration |
| Task Count | Number of tasks executed in the session |
| Status | `active`, `closed`, `timed_out` |
| Has Replay | Whether full replay data is available (some older sessions may not have replay data) |

**Filter controls:**
- Date range (from/to).
- Agent (dropdown).
- Status (all / active / closed / timed_out).
- Has Replay only (toggle).

Clicking any row appends `?sessionId=<id>` to the URL and loads the `SessionReplayLoader`.

---

### SessionReplayLoader (with sessionId)

**API source:** `GET /api/audit/sessions/:sessionId/replay`

The session replay is a **timeline-based playback interface**:

#### Session Header
- Session ID, agent name, start/end timestamps, duration.
- Back to index link.

#### Timeline Scrubber
A horizontal timeline bar representing the session duration. Events are plotted as markers along the timeline:
- **Blue markers:** LLM calls.
- **Green markers:** Successful actions (file writes, API calls, etc.).
- **Red markers:** Failed actions or errors.
- **Amber markers:** Approval events.

Clicking a marker jumps the replay to that event. Dragging the scrubber position moves through the session timeline.

#### Step-by-Step Event View
Below the scrubber, each event is rendered as a card in chronological order:

| Event Field | Description |
|---|---|
| Step number | Sequential step index in the session |
| Timestamp | Absolute ISO timestamp |
| Event type | What happened (action taken, LLM call made, error thrown, etc.) |
| Detail payload | Full JSON payload for the event (expandable) |
| Screenshot (if available) | For desktop-mode sessions, a thumbnail of the screen at the time of the event |
| Duration | How long this step took |
| LLM prompt/response | For LLM call events, the full prompt sent and response received (expandable) |

#### Playback Controls
- **Step Forward / Step Back:** Navigate one event at a time.
- **Jump to Start / Jump to End.**
- **Auto-play:** Advances through events automatically at configurable speed (1x, 2x, 4x).
- **Filter by type:** Show only LLM calls / only actions / only errors.

---

## 3. Operational Signals

**Route:** `/operational-signals`
**Plan gate:** `auditUnlocked = true` required.
**Component:** `OperationalSignalTimeline`
**API source:** `GET /api/audit/signals?hours=12&workspaceId=`

The Operational Signals page renders a **12-hour rolling timeline chart** of operational health signals across the platform. This is the same component embedded in the Operations Overview tab but here it occupies the full page with additional controls.

### Signal Timeline Chart

A time-series chart with time on the X-axis and signal intensity on the Y-axis. Multiple signal series are plotted together:

| Signal Series | Colour | Description |
|---|---|---|
| Task throughput | Blue | Tasks processed per minute |
| Error rate | Red | Error events per minute |
| Approval queue depth | Amber | Number of pending approvals |
| LLM latency | Purple | P95 LLM response latency (ms) |
| Connector health | Green | Active healthy connectors / total connectors ratio |

**Hover tooltip:** Shows all signal values at the hovered timestamp.

**Zoom:** Click and drag on the chart to zoom into a specific time window. A "Reset Zoom" button returns to the 12-hour view.

**Hours selector:** Change the lookback window: 1h / 3h / 6h / 12h / 24h. Longer windows use 5-minute buckets instead of 1-minute buckets.

### Signal Annotations
Significant events (kill switch triggers, approval timeouts, circuit breaker trips) are overlaid as vertical marker lines on the chart with a label. Clicking a marker opens the corresponding audit log entry.

### Export
Download the signal data as a CSV (one row per time bucket, one column per signal series).

---

## 4. Circuit Breakers

**Route:** `/circuit-breakers`
**Plan gate:** `auditUnlocked = true` required.
**Component:** `CircuitBreakersPanel`
**API sources:**
- `GET /api/governance/circuit-breakers` — list all circuit breakers and their states.
- `POST /api/governance/circuit-breakers/:id/reset` — manually reset an open circuit.

Circuit breakers automatically **halt LLM or connector activity** when error rates exceed thresholds. This prevents cascading failures (e.g., looping retries when an external API is down).

### Circuit Breaker States

| State | Colour | Description |
|---|---|---|
| `closed` | Green | Operating normally — requests are flowing through |
| `open` | Red | Breaker has tripped — all requests to this circuit are rejected |
| `half_open` | Amber | Breaker is testing recovery — one request allowed through; if it succeeds the breaker closes; if it fails it opens again |

### Circuit Breaker List

Each breaker card shows:

| Field | Description |
|---|---|
| Circuit name | Human-readable name (e.g., "OpenAI LLM", "GitHub Connector", "Approval Intake HMAC") |
| Circuit type | `llm`, `connector`, `internal` |
| State | Colour-coded state badge |
| Error rate | Current error rate percentage (rolling 60-second window) |
| Open threshold | The error rate percentage at which this circuit trips |
| Trip count (all time) | How many times this circuit has opened since creation |
| Last tripped | Relative timestamp of the most recent trip |
| Last reset | Relative timestamp of the most recent reset (manual or automatic) |

### Trip History
Expanding a circuit breaker card shows its trip history log:
- Trip timestamp, error rate at trip time, reason (which error type pushed it over the threshold), duration open, how it was reset (automatic recovery or manual).

### Manual Reset
An **Open breaker?** button on each `open` circuit sends a `POST /api/governance/circuit-breakers/:id/reset`. This forces the breaker to `half_open` state immediately, allowing traffic to flow through for one test request.

Use this when you know the underlying issue has been resolved (e.g., the external API is back up) and you want to restore service without waiting for the automatic recovery timeout.

### Configuration (read-only)
Each breaker card also shows its configuration in read-only mode:
- **Error threshold (%):** The error rate that triggers a trip.
- **Sampling window (s):** The rolling window over which the error rate is measured.
- **Open duration (s):** How long the breaker stays open before moving to `half_open`.
- **Half-open timeout (s):** How long to wait for the test request in `half_open` state.

Circuit breaker configuration is managed via the Governance Hub → Circuit Breakers tab, not from this page.
