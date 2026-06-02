# Agents & Tasks — Detailed Reference

> **Section:** Agents (sidebar) and Task pipeline
> **Auth:** All pages require a valid `agentfarm_internal_session` cookie.

---

## Table of Contents

1. [Agents Page](#1-agents-page)
   - [Agent List Panel](#agent-list-panel)
   - [Agent Detail Panel](#agent-detail-panel)
   - [Create Agent Flow](#create-agent-flow)
2. [Tasks Page](#2-tasks-page)
   - [Live Feed Tab](#live-feed-tab)
   - [History Tab](#history-tab)
   - [Queue + DAG Tab](#queue--dag-tab)
   - [Retry Tab](#retry-tab)
   - [Runtime Tab](#runtime-tab)
   - [Repro Packs Tab](#repro-packs-tab)
   - [SSE Stream Tab](#sse-stream-tab)
3. [Chat Page](#3-chat-page)

---

## 1. Agents Page

**Route:** `/agents`
**Auth:** Redirects to `/login?next=/agents` if session cookie is missing.
**API:** `GET /api/bots` — returns the full agent roster for the tenant.

The Agents page is the master roster of all bots provisioned under the tenant. It uses a **master/detail layout**: the left panel is the agent list, and the right panel is the detail view for the selected agent.

---

### Agent List Panel

Each row in the list shows:

| Element | Description |
|---|---|
| Role emoji | Visual role indicator (see Role Icons below) |
| Agent name | The display name set during provisioning |
| Status badge | Colour-coded pill (see Status Badges below) |
| LLM provider | Badge showing the configured provider (OpenAI, Anthropic, Gemini, etc.) |
| Last heartbeat | Relative time since last successful heartbeat (e.g., "2 min ago") |

**Status Badges:**

| Status | Colour | Meaning |
|---|---|---|
| `Active` | Green with pulsing ring | Agent is running and heartbeating normally |
| `Created` | Blue | Agent record created but VM not yet provisioned |
| `Bootstrapping` | Amber | VM is provisioning; agent not yet responsive |
| `Setup Required` | Purple | Agent needs connector/config setup before it can run tasks |
| `Paused` | Grey | Agent is intentionally paused by an operator |
| `Failed` | Red | Agent entered an unrecoverable error state |

**Role Icons:**

| Role | Emoji |
|---|---|
| Developer | 💻 |
| Full Stack Developer | 🖥️ |
| Tester | 🧪 |
| Business Analyst | 📊 |
| Technical Writer | ✍️ |
| Content Writer | 📝 |
| Sales Representative | 🤝 |
| Marketing Specialist | 📣 |
| Corporate Assistant | 🗓️ |
| Customer Support Executive | 🎧 |
| PM/PO/Scrum Master | 🗂️ |
| Recruiter | 🔍 |

**Controls:**
- **+ Create Agent** button (top-right): Opens the Create Agent modal. See [Create Agent Flow](#create-agent-flow).
- **Refresh** button: Re-fetches the agent list from `/api/bots`.
- **Empty state:** When no agents exist, a prompt is shown: "No agents yet — create your first agent to get started."

---

### Agent Detail Panel

Clicking any agent in the list loads `AgentDetailPanel` in the right panel. The detail panel is divided into several sections:

#### Identity Section
- Agent name, role, LLM provider.
- Agent ID (UUID) shown in a monospace chip (click to copy).
- Created At timestamp.
- Workspace assignment.

#### Capability Snapshot
A read-only view of the agent's current allowed actions, pulled from the most recent capability snapshot:
- List of allowed action types (e.g., `read_file`, `write_file`, `git_commit`, `send_email`).
- Each action has a green "allowed" or red "blocked" indicator.
- Link to `/snapshots?botId=<id>` to view full snapshot history.

#### Runtime Health
- Current state machine state.
- Heartbeat status (connected / disconnected).
- Task queue depth.
- Active task preview (description truncated to 80 chars).

#### Quick Links
- **View Tasks** → `/tasks?tab=live` scoped to this bot.
- **View Snapshots** → `/snapshots?botId=<id>`.
- **View Memory** → `/memory?tab=episodic` (bot ID auto-populated).
- **View Governance** → `/governance` (Disclosure tab, bot ID auto-populated).

---

### Create Agent Flow

Clicking "+ Create Agent" opens a multi-step modal:

**Step 1 — Select Role:**
All 12 role types are shown as cards with their emoji, name, and a one-line description. Selecting a role pre-populates the connector allowlist for Step 3.

**Step 2 — Configure Identity:**
- Agent name (displayed to operators and sometimes to external parties).
- Agent email address (used as sender identity for email connectors).
- LLM provider and model selection (from the LLM Config allowed providers list).
- Workspace assignment (dropdown).

**Step 3 — Connect Tools:**
Pre-populated connector list based on the selected role. For each connector:
- Toggle switch to enable/disable.
- Status: "Not connected" (grey), "OAuth required" (amber), "Connected" (green).
- Clicking "Connect" for OAuth connectors opens the OAuth consent flow.
- Non-OAuth connectors show inline credential input fields.

**Step 4 — Set Approval Rules:**
- Risk threshold: Low / Medium / High — actions at or above this threshold require operator approval.
- Auto-approve window: If blank, all approvals require a human decision. If set (e.g., 5 minutes), approvals not decided in that window are auto-approved.
- Notification channel: Where to send approval notifications (email, Slack, Teams, webhook).

**Step 5 — Review and Deploy:**
Summary of all settings. Clicking "Deploy Agent" posts to `POST /api/bots` and triggers VM provisioning. The modal closes and the new agent appears in the list with status `Bootstrapping`.

---

## 2. Tasks Page

**Route:** `/tasks`
**Auth:** Auth-guarded; redirects to `/login?next=/tasks` if unauthenticated.
**Client component:** `TasksPageClient` in `apps/dashboard/app/tasks/tasks-page-client.tsx`

The Tasks page is the **full-lifecycle task pipeline interface**. It has 7 sub-tabs covering every stage from live execution to historical analysis to debugging. The active sub-tab is driven by the `?tab=` URL parameter.

Tabs requiring a Bot ID (`retry`, `runtime`, `repro`) show an inline Bot ID input field when no bot is selected. The Bot ID field auto-focuses and accepts any valid bot ID string.

---

### Live Feed Tab

**URL param:** `?tab=live`

A real-time event feed using **Server-Sent Events (SSE)**. The dashboard connects to `/api/sse/tasks?workspaceId=<id>` and receives named events as tasks progress.

#### SSE Event Types

| Event Name | Colour | Meaning |
|---|---|---|
| `task_queued` | Amber | A new task has entered the queue |
| `task_started` | Blue | The runtime has begun processing the task |
| `task_completed` | Green | Task finished with a successful outcome |
| `task_failed` | Red | Task ended in a failure state |
| `task_cancelled` | Grey | Task was cancelled before completion |
| `heartbeat` | Grey | Keepalive ping from the runtime (not displayed by default) |

#### Event Card Structure

Each event renders as a card with:
- **Status badge** (colour-coded by event type).
- **Task ID** (UUID, truncated to 8 chars with hover to see full).
- **Workspace ID** — which workspace the task belongs to.
- **Payload preview** — key fields from the task payload JSON (expandable to full JSON on click).
- **Timestamp** — ISO timestamp of the SSE event.

#### Connection State
- A green dot and "Connected" badge when the SSE stream is open.
- A red dot and "Disconnected" badge with retry count when the connection drops.
- The component automatically reconnects using exponential back-off.
- The feed buffer is capped at `maxEvents` (default 50). Older events are removed from the top when the buffer is full.

#### Workspace Filter
A dropdown above the feed lets operators filter to a single workspace when the session includes multiple workspaces.

---

### History Tab

**URL param:** `?tab=history`

A paginated table of all completed tasks with rich filtering.

#### Table Columns

| Column | Description |
|---|---|
| Task ID | UUID (click to expand full details) |
| Action Type | The task type (e.g., `write_file`, `git_commit`, `code_review`) |
| Outcome | `success` (green) / `failed` (red) / `cancelled` (grey) |
| Duration | Wall-clock time from start to completion |
| Latency | Time in the queue before execution began |
| Tokens Used | Total LLM tokens consumed |
| Bot ID | Which agent ran this task |
| Completed At | Timestamp |

#### Filter Controls
- **Date range:** From/To date pickers.
- **Outcome:** All / Success / Failed / Cancelled.
- **Action type:** Free-text search.
- **Workspace:** Dropdown (when multi-workspace session).
- **Bot ID:** Free-text filter.

Pagination: 25 per page, offset-based.

---

### Queue + DAG Tab

**URL param:** `?tab=queue`

Two panels on this tab:

#### Queue Status Panel
- **Queue Depth:** Current number of tasks waiting to be processed.
- **Snapshot table:** The current queue contents, one row per queued task:
  - Task ID, Bot ID, Priority badge, Payload preview, Enqueued At.
  - **Priority badges:** High (red), Normal (blue), Low (grey).
  - **Cancel action:** Each row has a trash icon to cancel that task. Sends `DELETE /api/settings/task-queue/:id`.
- **Status filter:** All / Pending / Running / Done / Failed — shows tasks at various lifecycle stages.

#### DAG Viewer Panel
A directed acyclic graph visualisation showing task dependencies for tasks that declare `dependsOn` relationships. Nodes are tasks; edges represent dependency arrows. Hovering a node shows the task summary. Clicking a node navigates to the task detail in the History tab.

---

### Retry Tab

**URL param:** `?tab=retry`
**Requires:** Bot ID (entered via inline input field).

Lists all failed tasks for the selected bot that are eligible for retry. A task is retryable if:
- Its outcome is `failed`.
- Its retry count is below the configured maximum (default 3).
- The failure was not caused by a policy rejection.

#### Retry Panel Controls
- **Retry** button per task: re-queues the task with the same payload. Posts to `POST /api/runtime/:botId/tasks/:taskId/retry`.
- **Retry with reason override:** An optional reason field lets operators add context before retrying.
- **Bulk retry:** Select multiple tasks and retry all at once.
- **Retry history:** Each task shows its previous attempt count and failure reasons.

---

### Runtime Tab

**URL param:** `?tab=runtime`
**Requires:** Bot ID (entered via inline input field).

Renders `RuntimeObservabilityWrapper` — a scoped version of the Observability panel (see [Operations / Observability Tab](./OPERATIONS.md#3-observability-tab)) but filtered to the specified bot ID. All the same panels are available: health card, logs, state history, transcripts, interview events.

---

### Repro Packs Tab

**URL param:** `?tab=repro`
**Requires:** Bot ID (entered via inline input field).
**Component:** `ReproPackPanel`

Repro Packs are **self-contained debugging bundles** for failed tasks. A repro pack captures everything needed to reproduce a failure in isolation:

| Component | Description |
|---|---|
| Task payload | The exact JSON payload that was sent to the runtime |
| Connector state | Snapshot of all connector health statuses at time of failure |
| LLM transcript | The full prompt/response exchange with the LLM |
| Runtime logs | Log entries from the task execution window |
| Environment metadata | Node version, runtime version, feature flags |
| Error stack | Full error stack trace and classification |

#### Controls
- **Generate Pack:** Click to create a new repro pack for any failed task in the list. Posts to `POST /api/runtime/:botId/repro-packs`.
- **Download:** Download the pack as a `.zip` file (JSON + log files).
- **Share Link:** Copy a deep link to this repro pack in the dashboard (requires the recipient to have session access).

---

### SSE Stream Tab

**URL param:** `?tab=sse`
**Component:** `SseStreamPanel`

A raw SSE event viewer. Unlike the Live Feed tab (which renders formatted event cards), this tab shows the raw SSE wire format — useful for debugging event shapes and troubleshooting SSE connection issues.

#### Display
- Each raw SSE message is shown as a code block.
- Event name, data field, and id field are displayed separately.
- Auto-scrolls to the bottom as new events arrive.
- **Pause:** Pause auto-scroll without disconnecting the stream.
- **Clear:** Clear the buffer without disconnecting.
- **Connection info:** Shows the SSE URL, connection status, and reconnect count.

---

## 3. Chat Page

**Route:** `/chat`
**Auth:** Redirects to `/login?next=/chat` if unauthenticated.
**Component:** `ChatSessionsPanel`

The Chat page provides a **direct interactive chat interface** with agents. Unlike task dispatch (which goes through the task queue and LLM planner), Chat sends messages synchronously and waits for a response — suitable for quick questions, ad-hoc instructions, and exploratory agent interactions.

### Session List Panel

The left column shows all chat sessions for the tenant:
- Session ID (UUID, truncated).
- Agent name and role emoji.
- Session status: `active`, `closed`, `timed_out`.
- Last message preview (truncated to 60 chars).
- Last message timestamp.

**Controls:**
- **New Session:** Opens a dialog to select which agent to chat with and optionally set an initial message.
- **Close session:** Archive a session (moves it to the closed list at the bottom).

### Message Thread Panel

The right panel shows the full message history for the selected session:
- Each message has a speaker label: "You" (operator) or the agent's name.
- Messages from the agent show the LLM provider badge and token count in a tooltip.
- Timestamps per message.
- Error messages shown inline with a red background if the agent returned an error.

### Send Message
A multi-line text input at the bottom with a **Send** button. Messages are sent via `POST /api/chat/sessions/:sessionId/messages`. The input supports Shift+Enter for newlines and Enter to send.

### Session Status
- **Active** (green dot): Session is open and the agent is responsive.
- **Closed** (grey dot): Session was manually closed.
- **Timed Out** (amber dot): Session was automatically closed due to inactivity (default 60 minutes of no messages).

A "Reopen" button is shown for closed/timed-out sessions to start a fresh exchange on the same session thread.
