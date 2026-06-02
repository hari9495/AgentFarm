# AgentFarm Internal Dashboard — Navigation Reference

> **Audience:** Operations, engineering, and product staff using the AgentFarms Ops internal dashboard.
> **App location:** `apps/dashboard` · **Default port:** 3001
> **Auth:** Cookie-based session (`agentfarm_internal_session`). Login is restricted to `@agentfarms.in` email domains.

---

## Detailed Documentation

Each section below has a dedicated deep-dive reference document covering all sub-tabs, API endpoints, field schemas, workflow steps, and component hierarchy.

| Section | Detailed Reference |
|---|---|
| Operations (Overview, Approvals, Observability, Evidence, Activity) | [docs/dashboard/OPERATIONS.md](./dashboard/OPERATIONS.md) |
| Agents, Tasks (all 7 tabs), Chat | [docs/dashboard/AGENTS-TASKS.md](./dashboard/AGENTS-TASKS.md) |
| DevOps Hub (all 11 sub-tabs) | [docs/dashboard/DEVOPS-HUB.md](./dashboard/DEVOPS-HUB.md) |
| Analytics, Cost Dashboard, Historical Metrics, Quality ROI | [docs/dashboard/ANALYTICS.md](./dashboard/ANALYTICS.md) |
| Audit Log, Session Replay, Operational Signals, Circuit Breakers | [docs/dashboard/AUDIT-COMPLIANCE.md](./dashboard/AUDIT-COMPLIANCE.md) |
| Connectors, Platform MCP, Skills, Memory, Governance | [docs/dashboard/PLATFORM.md](./dashboard/PLATFORM.md) |
| Billing, Budget, LLM Config, Quality Feedback, Notifications | [docs/dashboard/BUSINESS-SETTINGS.md](./dashboard/BUSINESS-SETTINGS.md) |

---

## Table of Contents

1. [Sidebar Chrome (Search & Workspace Switcher)](#sidebar-chrome)
2. [Operations](#section-operations)
   - [Overview](#1-overview)
   - [Approvals](#2-approvals)
   - [Observability](#3-observability)
   - [Evidence](#4-evidence)
   - [Activity](#5-activity)
3. [Agents](#section-agents)
   - [Agents](#6-agents)
   - [Tasks](#7-tasks)
   - [Task Queue](#8-task-queue)
   - [DevOps Hub](#9-devops-hub)
   - [Chat](#10-chat)
4. [Developer Tools](#section-developer-tools)
   - [CI Triage](#11-ci-triage)
   - [Env Reconciler](#12-env-reconciler)
   - [Bot Snapshots](#13-bot-snapshots)
   - [Handoffs](#14-handoffs)
   - [Autonomous Loops](#15-autonomous-loops)
   - [Loop Chat](#16-loop-chat)
   - [Orchestration Runs](#17-orchestration-runs)
   - [Routine Scheduler](#18-routine-scheduler)
   - [Wake Runs](#19-wake-runs)
   - [A/B Tests](#20-ab-tests)
   - [Desktop](#21-desktop)
5. [Analytics](#section-analytics)
   - [Overview (Analytics)](#22-overview-analytics)
   - [Cost Dashboard](#23-cost-dashboard)
   - [Historical Metrics](#24-historical-metrics)
   - [Quality ROI](#25-quality-roi)
6. [Audit & Compliance](#section-audit--compliance)
   - [Audit Log](#26-audit-log)
   - [Session Replay](#27-session-replay)
   - [Operational Signals](#28-operational-signals)
   - [Circuit Breakers](#29-circuit-breakers)
7. [Platform](#section-platform)
   - [Connectors](#30-connectors)
   - [Platform MCP](#31-platform-mcp)
   - [Skills](#32-skills)
   - [Memory](#33-memory)
   - [Governance](#34-governance)
8. [Business](#section-business)
   - [Billing](#35-billing)
   - [Budget](#36-budget)
9. [Team & Settings](#section-team--settings)
   - [LLM Config](#37-llm-config)
   - [Quality Feedback](#38-quality-feedback)
   - [Notifications](#39-notifications)
10. [Footer — Sign Out](#footer--sign-out)
11. [Navigation Behaviour Notes](#navigation-behaviour-notes)

---

## Sidebar Chrome

The sidebar header and utility controls that appear before all navigation sections.

### Logo / Brand Header

**Location:** Top of sidebar, always visible.
Displays the AgentFarms Ops logo (blue `Cpu` icon) and the product name **"AgentFarms Ops"**. This is a static branding element and is not interactive.

---

### ⌘K Search (Quick Page Search)

**Route:** No route change. Fires a `keydown` event (`Ctrl+K`) to open the Command Palette overlay.

**Purpose:** Let users jump to any page in the dashboard without using the mouse or scrolling the sidebar.

**Functionality:** Clicking the search bar triggers the built-in `CommandPalette` component, which renders a modal overlay of all navigable pages. Users can type to filter and press Enter to navigate.

**Features:**
- Keyboard shortcut: `Ctrl+K` (or `⌘K` on macOS).
- Fuzzy-matching page name search.
- Accessible from anywhere in the dashboard without scrolling.

---

### Workspace Switcher

**Route:** Appends `?workspaceId=<id>` to the current URL.

**Purpose:** Allow operators with access to multiple workspaces to switch between them without reloading the full page.

**Functionality:** Renders as a `<select>` dropdown only when the session includes two or more workspaces. Selecting a different workspace reloads all data panels for the selected context.

**Features:**
- Hidden when the session has only one workspace (single-workspace tenants see the workspace name in the sidebar footer instead).
- Preserves the active tab and other URL parameters when switching.
- The currently selected workspace drives all API calls across every page.

---

## Section: Operations

The Operations section contains four **tab-based** panels that all render on the root route (`/`). Navigation between them changes the `?tab=` query parameter without a full page reload. The active tab is also persisted to `localStorage` per workspace so it is restored on next visit.

Additionally, **Activity** is a standalone page in this section.

---

### 1. Overview

**Route:** `/?tab=overview` (default tab)

**Purpose:** Provide a real-time command-centre view of the entire tenant: active agents, workspace health, connector statuses, provisioning progress, budget state, skill marketplace, and governance KPIs — all in a single glanceable page.

**Functionality:** A server-rendered page that fetches data from the API gateway on every load (no caching). Data is pulled from:
- `/v1/dashboard/summary` — tenant-level totals (plan, active bots, degraded workspaces, pending approvals).
- `/v1/dashboard/workspace/:workspaceId` — per-workspace slice (provisioning job, connectors, approvals, events).
- `/v1/workspaces/:workspaceId/budget/state` — daily and monthly spend vs limit.
- `/v1/dashboard/workspace/:workspaceId/historical-metrics` — 12-hour operational signal timeline.
- `/api/v1/workspaces/:workspaceId/questions/pending` — unanswered agent questions.

**Features:**
- **Kill-Switch Banner:** A sticky warning banner shown at the top when a kill switch is active for the workspace. Links to the Governance page.
- **Mission Hero:** Tenant name, plan badge, workspace status, and provisioning progress indicator.
- **KPI Animated Counters:** Animated stat tiles showing: Active Bots, Pending Approvals, Action Count, Estimated Cost, Connector Errors, and Runtime Restarts — each with a colour-coded status badge (low / warn / high) and a sparkline chart.
- **Operational Signal Timeline:** 12-hour bar chart of signal counts, bucketed hourly.
- **Workspace Budget Panel:** Daily and monthly spending bars with hard-stop status indicator.
- **Developer Agent Overview Panel:** Summary of the primary developer agent's task stats, heartbeat, and LLM provider.
- **Developer Agent Status Panel:** Real-time runtime state, provisioning step tracker (queued → validating → creating resources → bootstrapping VM → starting container → registering runtime → healthchecking → completed), and SLA breach flag.
- **Connector Config Panel:** Health cards for each connector (Jira, GitHub, Teams, Email, Custom API) with OAuth re-auth action buttons.
- **Agent Memory Pattern Panel:** Most recently reinforced memory patterns for the active agent.
- **Agent Question Panel:** Unanswered questions from the agent that require human input before execution can continue.
- **Skill Marketplace Panel:** Quick-access to available skills for the workspace.
- **Governance KPI Panel:** Approval rate, P95 decision latency, SLA compliance rate, and auto-approval rate.
- **Task Retry Panel:** One-click retry for the most recently failed task.
- **Quick Access Grid:** Shortcut tiles to the most commonly accessed dashboard sub-pages.
- **Workspace Switcher (inline):** Dropdown in the page body for changing the active workspace.
- **Mobile Shell Wrapper:** On small screens the tab navigation collapses into a mobile-friendly shell.

---

### 2. Approvals

**Route:** `/?tab=approvals`
**Sidebar badge:** A red count badge appears on the Approvals item when there are pending approvals.

**Purpose:** The human-in-the-loop decision interface. Every agent action classified as medium or high risk by the policy engine is held here until an operator approves or rejects it before execution proceeds.

**Functionality:** Renders `ApprovalQueuePanel` with the pending approvals and recent decisions pre-fetched server-side from the workspace slice. Decisions (approve / reject) are posted to `/api/approvals/:approvalId/decision`. The panel auto-refreshes to pick up new approvals.

**Features:**
- **Pending Queue Table:** Lists all pending approvals with: Approval ID, Risk Level badge (high / medium / low), Action Summary, Impacted Scope, Requested At, and a decision button.
- **Approval Detail Drawer:** Clicking any pending row opens a side drawer showing the full structured approval packet:
  - `change_summary` — human-readable description of what the agent wants to do.
  - `impacted_scope` — which system/resource is affected (e.g., `github:repo/main`).
  - `risk_reason` — why the policy engine flagged this action.
  - `proposed_rollback` — agent-generated rollback plan.
  - `lint_status` / `test_status` — whether pre-action quality gates passed.
  - `packet_complete` — whether the structured packet is fully populated.
  - `gate_type` / `gate_category` — which policy gate triggered the approval requirement.
- **Risk-Level Filtering:** Saved views for All, Pending High Risk, Aging 15m+, My Team.
- **Sort Controls:** Sort by Requested (newest/oldest) or Risk Level.
- **What-If Options:** For applicable approvals, shows a set of alternative safe options the agent has pre-generated.
- **Batch Decision Cards:** Group approvals from the same task and decide approve-all, reject-all, or review individually.
- **Decision Reason Templates:** Predefined reason strings for common approve/reject situations; also supports free-text.
- **Recent Decisions Panel:** Shows the last N completed decisions with outcome, latency, and agent.
- **Approval Metrics Bar:** Pending count, total decisions made, and P95 decision latency.
- **Copy Link:** Shareable direct link to a specific approval item for team escalation.
- **Pagination:** Offset-based pagination for large approval backlogs.

---

### 3. Observability

**Route:** `/?tab=observability`

**Purpose:** Deep visibility into the agent runtime's internal state — logs, state machine transitions, task execution transcripts, voice interview events, heartbeat health, connector status, and login policy — without leaving the main dashboard.

**Functionality:** Renders `RuntimeObservabilityPanel` with data fetched from the agent runtime service directly (port 4000 by default). Pulls from five endpoints in parallel: `/logs`, `/state/history`, `/health/live`, `/runtime/transcripts`, `/runtime/interview-events`.

**Features:**
- **Runtime Health Card:** Heartbeat loop status, heartbeat sent/failed counts, heartbeat success rate (%), last heartbeat timestamp, task queue depth, processed/succeeded/failed task counters.
- **Current State Display:** The runtime state machine's current state (e.g., `idle`, `executing`, `awaiting_approval`, `error`).
- **Runtime Logs Panel:** Last 50 structured log entries with event type, runtime state at time of log, correlation ID, and JSON detail expansion. Filterable by event type, runtime state, bot ID, workspace ID, and correlation ID.
- **State Transition History:** Ordered list of state-machine transitions with `from` → `to` state, timestamp, and reason.
- **Task Execution Transcripts:** Per-task execution records showing: action type, risk level, route (execute vs approval), status (success / approval_required / failed), duration in ms, error message, whether approval was required, approval summary, and payload override source.
- **Interview Events:** Voice/meeting session events with turn index, partial vs final event flag, text captured, session ID, role track, interrupted-speaking flag, follow-up question, and final recommendation.
- **Connector Health Rows:** Real-time status per connector (connected / degraded / token_expired) with last error code.
- **Internal Login Policy Snapshot:** Allowed domains count, admin roles count, deny-all mode status, and data freshness timestamp.
- **Capability Snapshot (inline):** The allowed action set for the current agent.
- **Auto-refresh:** Polling interval for logs and health data.

---

### 4. Evidence

**Route:** `/?tab=audit`

**Purpose:** Compliance record for the workspace. Every agent action, approval decision, connector event, and system event is stored as an immutable audit event. This tab provides a filtered, exportable view of that record.

**Functionality:** Renders `EvidenceCompliancePanel`. If the tenant's plan does not include audit access, it shows an `AuditUpgradeWall` in place of the data.

**Features:**
- **Event Table:** Columns: Event ID, Bot ID, Event Type, Severity, Summary, Source System, Correlation ID, Created At.
- **Filters:** Severity (info / warn / error), Event Type (free text), Bot ID, Date range (from / to), Limit (default 50).
- **Freshness Warning:** Amber banner if the most recent event is older than 120 minutes.
- **Export Presets:** One-click export of Last 24h, Last 7 Days, Severity:Error, or All Workspace events.
- **Retention Control:** Set the evidence retention period in days directly from this panel. Posts to the API to update the TTL policy.
- **Direct Link / Deep-Link:** Ability to focus on a specific correlation ID via URL parameter, highlighting that row.
- **Plan Gate:** Requires Business+ plan. Below that plan, the panel is replaced by an upgrade prompt that links to `/billing`.

---

### 5. Activity

**Route:** `/activity`

**Purpose:** A live, acknowledgeable feed of workspace activity events across all categories (runtime, approvals, CI, connectors, provisioning, security, system). Unlike the Evidence tab which is immutable audit log, Activity is designed for real-time operational monitoring with ack workflow.

**Functionality:** Server-rendered page that mounts `ActivityEventsPanel` (client-side) to fetch and poll `/v1/activity/events` for the tenant/workspace. Requires an authenticated session; redirects to `/login?next=/activity` if unauthenticated.

**Features:**
- **Event Feed:** Paginated list of activity events with title, body, category badge, status badge, sequence number, and created timestamp.
- **Category Badges:** Colour-coded by category: `runtime` (blue), `approval` (amber), `ci` (purple), `connector` (green), `provisioning` (red), `security` (dark red), `system` (grey).
- **Status Badges:** `unread` (New), `read` (Seen), `acked` (Acknowledged) — colour coded.
- **Category Filter:** Filter to a single category using a tab strip.
- **Acknowledge Action:** Mark individual events as acknowledged. Sends a PATCH to the events API and updates the badge in-place.
- **Polling / Refresh:** Auto-polls for new events at a regular interval.
- **Correlation ID:** Each event carries a correlation ID for cross-referencing with the Evidence tab and Audit Log.

---

## Section: Agents

Standalone pages for managing, monitoring, and interacting with individual agents and their task pipelines.

---

### 6. Agents

**Route:** `/agents`

**Purpose:** The master roster of all bots provisioned under the tenant. Provides a central place to inspect any agent's current status, configuration, and live metrics.

**Functionality:** Client-side page. Fetches the agent list from `/api/bots`. Clicking an agent in the left-hand list loads a detailed panel for that agent.

**Features:**
- **Agent List (left panel):** Each entry shows: role emoji, role name, agent name, status badge (Active / Created / Bootstrapping / Setup Required / Paused / Failed), LLM provider, and last heartbeat age.
- **Status Badges:** Colour-coded pills with a status dot (pulsing ring on Active).
- **Create Agent Button:** Top-right "+" button to initiate provisioning of a new bot.
- **Refresh Button:** Reloads the agent list on demand.
- **Agent Detail Panel (right panel):** Rendered by `AgentDetailPanel`. Shows full agent metadata, capability snapshot, runtime health, current task, and links to Tasks and other agent-specific sub-pages.
- **Role Icons:** Each role displays a themed emoji: Developer 💻, Full Stack Dev 🖥️, Tester 🧪, BA 📊, Technical Writer ✍️, Content Writer 📝, Sales 🤝, Marketing 📣, Corporate Assistant 🗓️, Customer Support 🎧, PM/PO/SM 🗂️, Recruiter 🔍.
- **Empty State:** Shown when no agents have been provisioned yet, with a prompt to create the first agent.
- **Auth guard:** Redirects to `/login?next=/agents` if session is missing.

---

### 7. Tasks

**Route:** `/tasks`
**Default sub-tab:** `live`

**Purpose:** Full visibility and control over task execution across all pipeline stages — live execution, history, retry, runtime internals, reproduction packs, and the SSE stream.

**Functionality:** Server-rendered shell that mounts `TasksPageClient`. The active sub-tab is driven by the `?tab=` URL parameter (set by the sidebar "Task Queue" link, which pre-selects `queue`). Some sub-tabs require a Bot ID to be entered before data loads.

**Sub-tabs:**

| Sub-tab | Label | Description |
|---|---|---|
| `live` | Live Feed | Real-time task execution stream via SSE |
| `history` | History | Completed task history with filters |
| `queue` | Queue + DAG | Current task queue depth and DAG visualization |
| `retry` | Retry | Manually retry failed tasks (requires Bot ID) |
| `runtime` | Runtime | Runtime observability inline (requires Bot ID) |
| `repro` | Repro Packs | Reproducible failure packs for debugging (requires Bot ID) |
| `sse` | SSE Stream | Raw SSE event stream viewer |

**Features (Live Feed tab):**
- Server-Sent Events stream of task start, step, and completion events in real time.
- Per-task status colour coding (success / pending / failed).

**Features (History tab):**
- Date range filter, outcome filter, workspace filter.
- Per-task row with: task ID, action type, outcome, duration, latency, tokens used, timestamp.

**Features (Queue + DAG tab):**
- Current queue depth counter.
- DAG viewer showing dependencies between queued tasks.

**Features (Retry tab):**
- Lists failed tasks eligible for retry.
- One-click retry action with optional reason override.

**Features (Runtime tab):**
- Inline `RuntimeObservabilityWrapper` — same data as the Observability tab but scoped to a specific bot.

**Features (Repro Packs tab):**
- `ReproPackPanel` — builds a reproducible failure pack (task payload, connector state, LLM transcript) for a failed task, exportable as JSON.

**Features (SSE Stream tab):**
- `SseStreamPanel` — raw SSE viewer scoped to the selected workspace, showing all events as they arrive.

---

### 8. Task Queue

**Route:** `/tasks?tab=queue`

**Purpose:** A direct link into the Queue + DAG sub-tab of the Tasks page. Provides rapid access to the current task queue without navigating through the Tasks tabs.

**Functionality:** Identical to the Tasks page with `queue` pre-selected. See Tasks → Queue + DAG tab above.

---

### 9. DevOps Hub

**Route:** `/devops`

**Purpose:** A consolidated hub for all developer-operations tooling related to agents: CI triage, PR drafts, environment management, snapshots, handoffs, loops, orchestration, scheduling, A/B tests, and desktop control. Consolidates all Developer Tools section pages into a single tabbed interface.

**Functionality:** Server-rendered shell mounting `DevOpsHubClient`. Tabs are client-side; no page reload on tab switch.

**Sub-tabs and their functionality:**

| Sub-tab | Label | Description |
|---|---|---|
| `ci` | CI Triage | Submit CI failures for automated root-cause analysis |
| `pr` | PR Drafts | Review, publish, or discard AI-generated PRs |
| `env` | Env Reconciler | Compare expected vs actual environment variables |
| `snapshots` | Bot Snapshots | Snapshot history and latest config snapshot per agent |
| `handoffs` | Handoffs | View and complete pending agent handoff queue |
| `loops` | Autonomous Loops | Create and manage self-repeating agent loops |
| `orchestration` | Orchestration Runs | View and cancel multi-agent orchestration runs |
| `routine` | Routine Scheduler | Schedule recurring tasks with cron-style config |
| `wake` | Wake Runs | One-shot scheduled task runs and wake event history |
| `abtests` | A/B Tests | Create and monitor agent A/B experiments |
| `desktop` | Desktop | Remote desktop status, automation actions, and agent profile |

> **Note:** Each sub-tab in DevOps Hub is also accessible as its own standalone page in the Developer Tools sidebar section. The DevOps Hub provides a single entry point when working across multiple tools in one session.

---

### 10. Chat

**Route:** `/chat`

**Purpose:** Create and manage direct interactive chat sessions with agents. Allows operators to converse with an agent directly — submit instructions, ask questions, and receive responses — outside of the normal task queue flow.

**Functionality:** Server-rendered shell mounting `ChatSessionsPanel`. Requires authenticated session; redirects to `/login?next=/chat` if unauthenticated.

**Features:**
- **Session List:** All active and historical chat sessions for the tenant, with session ID, agent name, and last message timestamp.
- **New Session:** Create a new chat session directed at a specific agent or role.
- **Message Thread:** Full message history for a selected session.
- **Send Message:** Text input to send a new instruction or question to the agent.
- **Session Status:** Active / closed / timed-out indicator per session.

---

## Section: Developer Tools

Standalone pages for each developer-operations capability. Each page here is also accessible via the corresponding sub-tab in DevOps Hub (`/devops`).

---

### 11. CI Triage

**Route:** `/ci`
**Eyebrow:** Engineering

**Purpose:** Submit CI/CD pipeline failures to the agent for automated root-cause analysis and patch proposal generation. Reduces the mean-time-to-diagnose for broken builds.

**Functionality:** Mounts `CiTriagePanel` scoped to the session's workspace. Auth-guarded.

**Features:**
- **Submit Failure:** Input form to paste a CI failure log or link to a failed run.
- **Triage Results:** Displays agent-generated root-cause analysis, suspected files, and a proposed patch.
- **History:** Previous triage submissions with their results.
- **Status Indicators:** Pending / analysing / complete per submission.

---

### 12. Env Reconciler

**Route:** `/env`
**Eyebrow:** Infrastructure

**Purpose:** Detect and resolve environment variable drift between what the agent's workspace expects and what is actually configured. Prevents silent failures caused by missing or stale env vars.

**Functionality:** Mounts `EnvReconcilerPanel` with tenant and workspace ID. Auth-guarded; redirects to `/login?next=/env`.

**Features:**
- **Expected vs Actual Comparison:** Side-by-side table of expected environment variables (from the agent's declared config) vs the currently resolved values.
- **Drift Indicators:** Highlighted rows for missing, changed, or extra variables.
- **Toolchain Version Monitor:** Tracks tool versions (Node, Python, Docker, etc.) and flags version mismatches.
- **Reconcile Action:** Apply the expected configuration as the active configuration.
- **Export Diff:** Download the diff as a text file.

---

### 13. Bot Snapshots

**Route:** `/snapshots` (supports `?botId=<id>` query parameter)
**Eyebrow:** Agent State

**Purpose:** Capture and review point-in-time snapshots of an agent's full capability configuration — allowed actions, connector state, LLM config, and skill set. Used for debugging behavioural changes and auditing agent configuration over time.

**Functionality:** Mounts `CapabilitySnapshotPanel`. If `?botId=` is provided in the URL, the panel auto-loads that bot's snapshots. Auth-guarded.

**Features:**
- **Snapshot List:** All historical capability snapshots for the selected bot, ordered by timestamp.
- **Latest Snapshot Card:** The most recent snapshot shown prominently with all allowed actions, connectors, and skills.
- **Snapshot Diff:** Compare two snapshots side by side to see what changed between them.
- **Bot ID Input:** Inline form if no bot ID is in the URL, to manually enter a bot ID.
- **Manual Snapshot Trigger:** Button to capture a fresh snapshot of the current agent state.

---

### 14. Handoffs

**Route:** `/handoffs`
**Eyebrow:** Multi-Agent

**Purpose:** Manage agent-to-agent task handoffs in multi-agent workflows. When one agent completes part of a task and passes it to another agent (e.g., Developer → Tester), the handoff record appears here for review and completion.

**Functionality:** Mounts `HandoffsPanel` with tenant and workspace IDs. Auth-guarded.

**Features:**
- **Pending Handoffs List:** All handoffs awaiting acceptance by the target agent or human approval.
- **Handoff Detail:** Source agent, target agent, task ID, handoff payload, and instructions.
- **Accept / Reject:** Operators can approve or reject a pending handoff on behalf of the target agent.
- **Completed Handoffs:** History of all completed handoffs with outcome and timestamps.
- **Create Handoff:** Manual handoff initiation — direct a task from one agent to another without waiting for the source agent to trigger it.

---

### 15. Autonomous Loops

**Route:** `/loops`
**Eyebrow:** Automation

**Purpose:** Create and monitor self-directing autonomous agent loops — tasks that the agent repeats on its own until a completion criterion is met or a human stops it.

**Functionality:** Mounts `AutonomousLoopsPanel`. Auth-guarded (checks for valid session; redirects to `/login?next=/loops`).

**Features:**
- **Active Loops List:** All currently running loops with status, iteration count, and last execution timestamp.
- **Create Loop:** Define a new autonomous loop with a task description, target agent, stop condition, and iteration limit.
- **Loop Detail:** Per-iteration history showing each run's output, duration, and whether the stop condition was evaluated as met.
- **Pause / Resume / Stop:** Control the lifecycle of a running loop.
- **Stop Condition Editor:** Configure the LLM-evaluated condition (e.g., "stop when all failing tests pass").

---

### 16. Loop Chat

**Route:** `/agent-chat`
**Eyebrow:** Autonomous Agent

**Purpose:** An interactive chat interface specifically designed for dispatching tasks to the autonomous coding loop and following each step of execution in real time, including intermediate `LoopStepRecord` history.

**Functionality:** Static page (no auth redirect) mounting `AgentChatPanel`.

**Features:**
- **Task Input:** Free-text prompt to dispatch a task to the autonomous coding loop.
- **Real-Time Step Feed:** As the loop executes, each step's action type, output, and status streams in.
- **Loop Step History:** Full history of all `LoopStepRecord` entries for the session.
- **Abort Control:** Stop an in-progress loop execution from this interface.

---

### 17. Orchestration Runs

**Route:** `/orchestration`
**Eyebrow:** Multi-Agent

**Purpose:** Start and monitor GOAP (Goal-Oriented Action Planning) multi-agent orchestration runs — complex workflows involving multiple coordinated agents executing in sequence or parallel.

**Functionality:** Mounts `OrchestrationRunsPanel` with tenant ID. Auth-guarded.

**Features:**
- **Active Runs List:** Currently executing orchestration runs with run ID, status, participating agents, and progress.
- **Run Detail:** Expanded view of an individual run showing the GOAP plan steps, which agent is executing each step, and intermediate results.
- **Start New Run:** Initiate a new orchestration run by providing a high-level goal and the set of agents to involve.
- **Cancel Run:** Abort an in-progress orchestration run.
- **Run History:** Completed and failed runs with outcomes, durations, and agent participation.

---

### 18. Routine Scheduler

**Route:** `/routine-tasks` (supports `?botId=` and `?workspaceId=` query parameters; defaults to `bot_dev_001` / `ws_primary_001`)
**Eyebrow:** Agent Automation

**Purpose:** Manage recurring scheduled tasks for a specific agent. Cron-style configuration allows tasks to run automatically on a schedule without manual triggering.

**Functionality:** Mounts `RoutineSchedulerPanel` with bot ID and workspace ID derived from URL params.

**Features:**
- **Scheduled Tasks List:** All configured routines for the bot with schedule expression, task description, enabled/disabled toggle, and last-run status.
- **Create Routine:** Form to define a new recurring task: description, cron expression, target agent, and start/end date.
- **Enable / Disable:** Toggle routines on and off without deleting them.
- **Run History:** Per-routine execution history with outcome and duration.
- **Next Run Preview:** Shows the next scheduled execution time for each routine.

---

### 19. Wake Runs

**Route:** `/wake-runs`
**Eyebrow:** Scheduling

**Purpose:** Schedule one-shot agent wake events — a task that runs once at a specific future time and then expires. Unlike Routine Scheduler (recurring), Wake Runs are for single future executions.

**Functionality:** Mounts `WakeRunsPanel` with workspace ID. Auth-guarded; redirects to `/login?next=/wake-runs`.

**Features:**
- **Pending Wake Runs:** Scheduled wake events that have not yet fired, with fire time and task description.
- **Schedule Wake Run:** Form to create a new wake run: task payload, agent, and ISO datetime.
- **Fired Wake Runs:** History of all wake events that have executed, with outcome.
- **Cancel Wake Run:** Delete a scheduled but not-yet-fired wake run.
- **Wake Run Detail:** Status, payload, and result for each event.

---

### 20. A/B Tests

**Route:** `/ab-tests`
**Eyebrow:** A/B Testing

**Purpose:** Create and monitor A/B experiments that compare two variants of agent behaviour (e.g., different LLM models, prompts, or skill configurations) to determine which produces better task outcomes.

**Functionality:** Mounts `AbTestsPanel` with tenant ID. Auth-guarded.

**Features:**
- **Active Tests List:** Running experiments with name, variant descriptions, traffic split, and current sample counts.
- **Create Test:** Define a new A/B test with: test name, two variants (A and B), the metric to optimise, and the traffic split percentage.
- **Results Panel:** Per-variant metrics — success rate, average latency, cost, and quality score — updated as results come in.
- **Conclude Test:** Mark a test as concluded and designate the winning variant to be promoted as default.
- **Test History:** All completed tests with their final results and the declared winner.

---

### 21. Desktop

**Route:** `/desktop`
**Eyebrow:** Automation

**Purpose:** Monitor and control the desktop agent — the agent running in full-desktop-mode (noVNC + Xvfb) — and inspect the browser session history, desktop action log, and the agent's visual automation profile.

**Functionality:** Mounts both `DesktopPanel` and `DesktopStreamPanel` on the same page. Auth-guarded.

**Features (DesktopPanel):**
- **Agent Profile:** Desktop agent name, role, and current desktop session status.
- **Browser Action History:** Log of every browser/desktop action the agent has taken (click, type, navigate, screenshot, etc.) with timestamps and target element details.
- **Run Automation:** Dispatch a browser automation task to the desktop agent directly from this panel.
- **Desktop State:** Current state of the Xvfb display, browser session ID, and last screenshot timestamp.

**Features (DesktopStreamPanel):**
- **Live Screen Stream:** noVNC video stream of the agent's desktop, rendered in the browser.
- **Playback Controls:** Start/stop the stream; the panel fetches the WebSocket stream URL from the API.

---

## Section: Analytics

Data and reporting pages for understanding agent performance, cost, and return on investment over time.

---

### 22. Overview (Analytics)

**Route:** `/analytics`

**Purpose:** A comprehensive analytics dashboard providing agent performance metrics, LLM cost breakdown by provider, and weekly trend data over a configurable date range.

**Functionality:** Client-side page. Fetches from two API endpoints in parallel: `/api/agent-performance` (agent task metrics) and the LLM cost summary API. Also renders `AuditLogPanel` for context. Date range is user-configurable via date pickers.

**Features:**
- **Date Range Selector:** From / To date pickers (default: last 30 days).
- **Agent Performance Metrics:**
  - Total task count.
  - Success rate (percentage).
  - Average latency (ms).
  - Total and average cost (USD).
  - Total tokens consumed.
  - Average quality score.
- **Provider Breakdown Table:** For each LLM provider used (Anthropic, OpenAI, Gemini, Mistral, Groq, Cohere): task count, cost (USD), and average latency.
- **Weekly Trend Chart:** Bar or line chart of tasks, successes, and cost per calendar week within the selected range.
- **LLM Cost Summary Section:**
  - Total tokens, total cost, total invocations, success rate over the period.
  - By-provider usage table: provider name, token count, estimated cost.
  - Weekly cost buckets: week start, tokens used, invocations, cost.
- **Audit Log Panel:** Inline event log for cross-referencing analytics findings with specific events.

---

### 23. Cost Dashboard

**Route:** `/cost-dashboard`
**Eyebrow:** Platform Observability

**Purpose:** Focused cost observability — LLM token usage, skill invocation counts, success rates, and cost attribution broken down by skill and provider. Built for finance and engineering leads who need to track and control AI spend.

**Functionality:** Static page (no auth redirect on this page) mounting `CostDashboardPanel`.

**Features:**
- **Token Usage Summary:** Total tokens consumed in the selected period.
- **Invocation Count:** Total LLM calls made.
- **Success Rate:** Percentage of successful invocations.
- **Cost by Skill:** Table of cost and invocation count per registered skill.
- **Cost by Provider:** Pie-style breakdown of spend across LLM providers.
- **Weekly Cost Trend:** Week-over-week cost chart.
- **Period Selector:** Date range controls to focus the analysis.

---

### 24. Historical Metrics

**Route:** `/historical-metrics`

**Purpose:** Long-range (default 90-day) agent performance trend analysis with per-week bar charts for task count, success count, and cost. Used for quarterly reviews and performance regressions.

**Functionality:** Client-side page. Fetches `/api/agent-performance?from=&to=` with configurable date range (default last 90 days).

**Features:**
- **Date Range Controls:** From / To date pickers.
- **Summary Metrics:** Total tasks, success rate, average latency, total cost, total tokens (over selected period).
- **Weekly Bar Chart:** Stacked or grouped bars per calendar week showing: task count (blue), success count (green), and cost (amber). Each bar is normalised to the maximum in the dataset.
- **Legend:** Colour-coded legend for each metric series.
- **Back to Dashboard Link:** Header link returning to the main page.

---

### 25. Quality ROI

**Route:** `/quality-roi`

**Purpose:** Quantify the return on investment of using agents by computing a per-week ROI score: the ratio of successful tasks to cost. Used for justifying agent spend and tracking quality improvements over time.

**Functionality:** Client-side page. Fetches `/api/agent-performance?from=&to=` (default last 90 days). Computes a derived ROI score per week.

**Features:**
- **Date Range Controls:** From / To pickers (default 90 days).
- **Summary Metrics:** Total tasks, success rate, total cost, total tokens, average cost per task.
- **ROI Table:** Per-week rows showing: week start, task count, success count, total cost (USD), success rate (%), cost per success (USD), and ROI Score.
- **ROI Score Colour Coding:** Green (≥ 10), amber (3–9), red (< 3), grey (insufficient data).
- **ROI Score Legend:** Explains the colour thresholds.
- **Back to Dashboard Link.**

---

## Section: Audit & Compliance

This section is **plan-gated**. When the tenant's plan does not include audit access (i.e., below Business+), the sidebar section header shows a padlock icon and the four links are replaced by a single "Upgrade to unlock" link that navigates to `/billing`.

When audit access is available, the section renders four standalone pages.

---

### 26. Audit Log

**Route:** `/audit`

**Purpose:** The full immutable audit trail of every event in the system, with rich filtering, sorting, and export. This is the compliance-grade record — used for incident investigation, regulatory reporting, and security reviews.

**Functionality:** Client-side page (`'use client'`). Uses `AuditUpgradeWall` if plan access is not granted. Otherwise, fetches from `/api/audit-events` with filter params applied as query parameters.

**Features:**
- **Event Table:** Columns: Event ID, Tenant ID, Workspace ID, Bot ID, Event Type, Severity, Summary, Source System, Correlation ID, Created At.
- **Filters:** Date range (from/to), event type (free text → `event_type` query param), bot/user ID (`bot_id` query param), severity (info / warn / error → `severity` query param).
- **Sort Controls:** Sort by: Created At, Bot ID, Event Type, Source System, Severity — ascending or descending.
- **Pagination:** 50 events per page with offset-based navigation.
- **Severity Badge:** Colour-coded badge per event (info = blue, warn = amber, error = red).
- **Plan Gate:** `AuditUpgradeWall` shown for sub-Business+ plans with a prompt to upgrade.

---

### 27. Session Replay

**Route:** `/audit/session-replay` (supports `?sessionId=<id>`)

**Purpose:** Replay recorded browser and desktop action sessions to see exactly what the agent saw and did during a task — screenshot by screenshot, action by action. Critical for post-incident review.

**Functionality:** Server-rendered page. If `?sessionId=` is not in the URL, renders `SessionIndexPanel` showing recent recorded sessions. If a session ID is provided, renders `SessionReplayLoader` for that session. Both are plan-gated behind audit access.

**Features (Session Index — no sessionId):**
- **Recent Sessions List:** Table of recorded sessions with session ID, agent name, start time, duration, and action count.
- **Click to Replay:** Clicking a session navigates to `/audit/session-replay?sessionId=<id>`.

**Features (Session Replay — with sessionId):**
- **Action Timeline:** Ordered list of all captured actions (click, type, scroll, navigate, screenshot) with timestamps and target selectors.
- **Screenshot Viewer:** Each action that produced a screenshot shows it inline. Navigate forward/back through screenshots.
- **Action Detail:** For each action: action type, element selector, value/text entered, result, duration.
- **Plan Gate:** `AuditUpgradeWall` shown if plan access is not granted.

---

### 28. Operational Signals

**Route:** `/operational-signals`

**Purpose:** A timeline view of operational signals aggregated over the past 12 hours, bucketed hourly. Signals represent meaningful system events (approvals, CI failures, connector errors, etc.) and the chart reveals operational load and incident patterns at a glance.

**Functionality:** Server-rendered page. Fetches historical metrics from `/v1/dashboard/workspace/:workspaceId/historical-metrics?window=12h&bucket=1h`. Also plan-gated; shows upgrade wall if audit access is not granted.

**Features:**
- **Signal Timeline Chart:** 12-point bar or line chart (one point per hour) using `OperationalSignalTimeline`.
- **Each Point:** `label` (hour string e.g. "2:00 PM"), `value` (signal count), `timestamp` (epoch ms).
- **Data Source Indicator:** "live" or "fallback" badge indicating whether the chart shows real data or fallback zeros.
- **Plan Gate:** `AuditUpgradeWall` shown for sub-Business+ plans.

---

### 29. Circuit Breakers

**Route:** `/circuit-breakers`
**Eyebrow:** Observability

**Purpose:** Monitor the automatic protection state for all LLM providers, external connectors, and APIs. Circuit breakers trip automatically when a service exceeds an error threshold, pausing calls to that service to prevent cascading failures. This page lets operators see breaker states and manually reset tripped circuits.

**Functionality:** Mounts `CircuitBreakersPanel` with tenant ID. Auth-guarded.

**Features:**
- **Breaker Status List:** All registered circuit breakers (per-provider and per-connector) with state: `closed` (healthy), `open` (tripped — calls blocked), `half-open` (testing recovery).
- **Error Rate / Failure Count:** The metric that caused the breaker to trip.
- **Last State Change Timestamp.**
- **Manual Reset:** Button to force-reset an open circuit breaker to closed, allowing calls to resume immediately.
- **Automatic Recovery Status:** Whether the breaker is in half-open state probing for recovery.
- **Configuration (read-only):** Failure threshold and timeout window for each breaker.

---

## Section: Platform

Core infrastructure configuration pages for connectors, MCP servers, skills, memory systems, and governance policies.

---

### 30. Connectors

**Route:** `/connectors`

**Purpose:** Central hub for all external service integrations. View, configure, and monitor OAuth connections, API-key connectors, mTLS connectors, webhooks, and the MCP configuration.

**Functionality:** Server-rendered shell pre-fetching `/v1/connectors/health/summary` for the workspace, then mounting `ConnectorsHubClient` client-side. Auth-guarded.

**Sub-tabs:**

| Sub-tab | Label | Description |
|---|---|---|
| `config` | Connectors | OAuth / API-key / mTLS config per service |
| `marketplace` | Install Connectors | Browse and install external service integrations |
| `health` | Health | Live status and last healthcheck per service |
| `adapters` | Adapters | Discover registered adapters and endpoints |
| `mcp` | MCP | Model Context Protocol server config |
| `inbound` | Inbound Webhooks | Register sources, view events, test payloads |
| `outbound` | Outbound + DLQ | Deliveries, dead-letter queue, replay |

**Features (Connectors tab):**
- Per-service config card: connector type, OAuth status, scope status, last error class, last healthcheck time, and remediation action.
- Re-auth / re-consent button for expired tokens.
- Add new connector form.
- Supports: Jira, Teams, GitHub, Email, Custom API.

**Features (Install Connectors tab):**
- `ConnectorMarketplacePanel` — browse available connector packages by category.
- Install / uninstall connectors.

**Features (Health tab):**
- `HealthStatusPanel` — real-time status table: connector ID, type, status, last healthcheck, error details.
- Refresh and filter controls.

**Features (Adapters tab):**
- Links to `/adapters?workspaceId=<id>` to browse all registered adapter endpoints.
- Links to `/adapters?workspaceId=<id>&action=register` to register a new custom adapter.

**Features (MCP tab):**
- List of configured MCP servers for the workspace.
- Add / remove MCP server endpoint and authentication token.
- Test MCP server connectivity.

**Features (Inbound Webhooks tab):**
- `InboundWebhooksPanel` — register webhook sources (Slack, GitHub, Jira, etc.), view received event payloads, and test payloads.
- Event log with payload preview.

**Features (Outbound + DLQ tab):**
- `OutboundWebhooksPanel` — delivery attempts, status (delivered / failed), dead-letter queue (DLQ) for permanently failed deliveries.
- Replay from DLQ.

---

### 31. Platform MCP

**Route:** `/platform-mcp`

**Purpose:** Configure and monitor Model Context Protocol (MCP) servers at the platform level — the integration layer that gives agents programmatic access to external tools. Shows which MCP connectors are configured, which agents use them, and allows toggling configuration.

**Functionality:** Client-side page. Fetches MCP platform configuration from `/api/platform/mcp`. Groups connectors by functional category.

**Features:**
- **Summary Stats:** Total MCP connectors registered and how many are currently configured.
- **Grouped Connector List:** Connectors grouped by category (e.g., Version Control, Project Management, Communication, etc.).
- **Per-Connector Card:** Connector ID, env var name, label, which agent roles use it (colour-coded role badges), and a `configured` status indicator.
- **Agent Role Badges:** Each agent role that uses the connector is shown as a small labelled badge — Developer, Full-Stack Dev, DevOps, Tester, PM, BA, Technical Writer, Sales, Marketing, Customer Support, Corporate Asst., Recruiter, Mobile Dev.
- **Copy Env Var:** Copy the environment variable name to clipboard.
- **Configure Toggle:** Enable or disable an MCP connector for the workspace.
- **Expand / Collapse Groups:** Each category group can be expanded or collapsed.
- **Add Custom MCP Server:** Form to register a new MCP server with URL and auth token.

---

### 32. Skills

**Route:** `/skills`

**Purpose:** Browse, install, invoke, and monitor skills — the modular capability packages that agents load at runtime to perform specialised tasks (e.g., `github_create_pr`, `jira_update_ticket`). Also covers skill telemetry, pipelines, admin catalog, and role-based skill recommendations.

**Functionality:** Server-rendered shell mounting `SkillsHubClient`. Auth-guarded.

**Sub-tabs:**

| Sub-tab | Label | Description |
|---|---|---|
| `marketplace` | Marketplace | Browse, install, and manage skills |
| `search` | Skill Search | Full-text search across skill catalog |
| `invoke` | Invoke | Directly call any skill from the dashboard |
| `telemetry` | Telemetry | Usage stats and performance per skill |
| `pipelines` | Pipelines | Build, run, and view multi-skill pipelines |
| `catalog` | Admin Catalog | Admin-only view of all registered skills |
| `roles` | Role Skills | Role-based skill recommendations |

**Features (Marketplace tab):**
- `SkillMarketplacePanel` — skill cards with name, description, category, and install button.
- Filter by category and search by name.

**Features (Skill Search tab):**
- `SkillSearchPanel` — full-text search across all skills in the catalog.
- Results show: skill ID, description, category, and version.

**Features (Invoke tab):**
- `SkillInvokePanel` — directly invoke any skill by ID with a custom payload.
- Response shown inline.

**Features (Telemetry tab):**
- Per-skill metrics: invocation count, success rate, average latency (ms), error count, last used at.
- Refresh button.
- Empty state when no telemetry data is available.

**Features (Pipelines tab):**
- `SkillPipelinesPanel` — define a sequence of skills as a pipeline, run it, and view execution results.

**Features (Admin Catalog tab):**
- `InternalSkillCatalogPanel` — admin-only list of all registered skills with ID, version, capabilities, and admin actions (enable/disable/delete).

**Features (Role Skills tab):**
- Role-based skill recommendation engine — enter a role and see which skills are recommended for that role profile.

---

### 33. Memory

**Route:** `/memory`

**Purpose:** Inspect, search, and manage all agent memory stores: episodic (long-term learned patterns), working (short-term per-workspace), memory patterns (high-confidence reinforced insights), knowledge graph (symbol and relationship store), and full-text/semantic search.

**Functionality:** Server-rendered shell mounting `MemoryHubClient`. Auth-guarded.

**Sub-tabs:**

| Sub-tab | Label | Description |
|---|---|---|
| `episodic` | Episodic Memory | Long-term learned patterns per agent |
| `work` | Work Memory | Per-workspace short-term working memory |
| `patterns` | Memory Patterns | High-confidence patterns with reinforce action |
| `knowledge` | Knowledge Graph | Symbols, relationships, and snapshots |
| `search` | Memory Search | Full-text + semantic search across all stores |

**Features (Episodic Memory tab):**
- `AgentEpisodicMemoryPanel` with optional Bot ID filter.
- Lists learned episodic memory entries: pattern text, confidence score, observed count, last seen timestamp.
- Supports reinforce / delete actions per entry.

**Features (Work Memory tab):**
- `WorkMemoryPanel` — per-workspace short-term memory slots.
- Current working context items: key, value, created at, TTL.
- Clear / set memory items.

**Features (Memory Patterns tab):**
- `AgentMemoryPatternFetcher` — high-confidence patterns extracted from episodic memory.
- Reinforce button to mark a pattern as confirmed and increase its weight.

**Features (Knowledge Graph tab):**
- `KnowledgeGraphExplorer` — visual or tabular view of the symbol/relationship graph.
- Navigate symbol nodes, view edges, and inspect relationship metadata.

**Features (Memory Search tab):**
- Full-text search and semantic (pgvector cosine similarity) search across all memory stores.
- Results include: store type (episodic/work/knowledge), key/ID, content, similarity score.

---

### 34. Governance

**Route:** `/governance`

**Purpose:** The governance control centre. Consolidates all policy, safety, and compliance configuration: approval KPIs, workflow builder, kill switches, circuit breakers, disclosure settings, data retention policy, and plugin management.

**Functionality:** Server-rendered shell mounting `GovernanceHubClient`. Auth-guarded.

**Sub-tabs:**

| Sub-tab | Label | Description |
|---|---|---|
| `kpis` | KPIs | Approval rate, decision latency, SLA compliance |
| `workflows` | Workflows | Multi-step governance flows |
| `kill-switches` | Kill Switches | Emergency stop per workspace + resume |
| `circuit-breakers` | Circuit Breakers | Per-service breaker status and manual reset |
| `disclosure` | Disclosure | What each agent is permitted to disclose (requires Bot ID) |
| `retention` | Retention | Data TTL policies per workspace and type |
| `plugins` | Plugins | Enable/disable governance plugins |

**Features (KPIs tab):**
- `GovernanceKPIPanel` — approval rate, P95 decision latency, SLA compliance rate, auto-approval rate. Filterable by time window.
- KPI cards with trend direction.

**Features (Workflows tab):**
- `GovernanceWorkflowPanel` — view configured multi-step governance workflows.
- `WorkflowBuilderPanel` — build a new workflow with condition nodes and action nodes (approve, reject, escalate, notify).

**Features (Kill Switches tab):**
- `KillSwitchPanel` — per-workspace emergency stop toggles.
- Toggle a kill switch ON to immediately halt all agent execution in a workspace (30-second control window).
- Toggle OFF / Resume to allow execution to continue.
- Kill switch state is visible across the dashboard (banner on Overview).

**Features (Circuit Breakers tab):**
- Same as the standalone Circuit Breakers page: breaker states, reset controls.

**Features (Disclosure tab):**
- `DisclosureSettingsPanel` — requires a Bot ID to load.
- Configure what the agent is permitted to tell external parties: e.g., whether it must identify itself as an AI, what data it can reference, which information is confidential.
- Per-disclosure-category toggle (identity, data, reasoning, etc.).

**Features (Retention tab):**
- `RetentionPolicyPanel` — configure data TTL (time-to-live) per data type (audit events, memory entries, transcripts, session replays) per workspace.
- Visual indicators of current retention vs configured TTL.

**Features (Plugins tab):**
- `PluginLoadingPanel` — list of installed governance plugins (OPA policies, custom approval gates, etc.).
- Enable / disable / unload plugins.
- View plugin metadata: name, version, author, description.

---

## Section: Business

Financial management pages that are always visible regardless of plan.

---

### 35. Billing

**Route:** `/billing`

**Purpose:** View and manage the tenant's subscription, monitor LLM usage costs, inspect payment history, and download invoices.

**Functionality:** Client-side page (`'use client'`). Fetches subscription status from `/api/billing/subscription`, usage/cost data from the LLM cost API, and order history from `/api/orders`.

**Features:**
- **Subscription Status Card:** Plan name, subscription status, expiry date, grace period remaining, suspension date (if applicable), days until suspension.
- **Usage Summary Card:** Current billing period start/end, total tokens consumed, total LLM invocations, success rate, and total cost.
- **Cost Trend Chart:** `CostTrendChart` — week-over-week cost visualisation for the current billing period.
- **Agent Cost Table:** `AgentCostTable` — cost breakdown by LLM provider with token counts.
- **Order / Invoice History:** List of orders with: order ID, plan ID, status, amount, currency, created at, and a link to download the invoice PDF (if available).
- **Upgrade Prompt:** For plans below Business+, inline prompt to upgrade. Links to audit unlock as well.

---

### 36. Budget

**Route:** `/budget`
**Eyebrow:** Finance

**Purpose:** Monitor and control per-workspace spending limits. Set daily and monthly budget caps with automatic hard-stop enforcement to prevent runaway costs.

**Functionality:** Mounts `BudgetPolicyPanel` with tenant and workspace IDs. Auth-guarded.

**Features:**
- **Daily Budget Bar:** Current daily spend vs daily limit, shown as a progress bar.
- **Monthly Budget Bar:** Current monthly spend vs monthly limit.
- **Hard Stop Status:** Whether the hard-stop is currently active (blocks all agent actions when limit is exceeded).
- **Warning Threshold:** 80% of limit triggers a warning notification.
- **Throttle Threshold:** 90% of limit throttles agent execution speed.
- **Hard Stop Threshold:** 100% of limit activates full hard stop.
- **Edit Limits:** Form to update daily and monthly limits.
- **Last Daily Reset Timestamp.**
- **Manual Hard Stop Toggle:** Activate or deactivate the hard stop manually.

---

## Section: Team & Settings

Configuration pages for LLM models, output quality monitoring, and notification delivery.

---

### 37. LLM Config

**Route:** `/llm-config`
**Eyebrow:** Configuration

**Purpose:** Configure which LLM provider and model the agents in this workspace use, and set per-profile routing rules (e.g., use GPT-4o for high-stakes approval decisions, use Claude Haiku for low-risk tasks).

**Functionality:** Mounts `LlmConfigPanel` with workspace ID. Auth-guarded.

**Features:**
- **Primary Provider Selector:** Choose the default LLM provider (Anthropic, OpenAI, Gemini, Mistral, Groq, Cohere, etc.).
- **Default Model Selector:** Choose the default model for the selected provider.
- **Per-Profile Routing:** Configure model overrides per risk profile (`low`, `medium`, `high`) or per task action type.
- **API Key Status:** Indicator showing whether the required API key for the selected provider is configured.
- **Test Connection:** Verify that the selected model is reachable with the current API key.
- **Save Configuration:** Persists the config to the workspace via the API.

---

### 38. Quality Feedback

**Route:** `/quality`
**Eyebrow:** Observability

**Purpose:** Monitor agent quality signals — feedback from task outcomes, human approvals/rejections, and automated quality gates — to track and improve agent output quality over time.

**Functionality:** Mounts `QualitySignalsPanel`. Auth-guarded.

**Features:**
- **Quality Signals Feed:** Aggregated quality signals across workspaces: signal type, source (approval rejection, quality gate, test failure), severity, agent, and timestamp.
- **Quality Score Trend:** Time-series chart of average quality scores.
- **Breakdown by Signal Type:** Counts per signal category (rejection, lint failure, test failure, hallucination flag, etc.).
- **Per-Agent Quality Summary:** Average quality score per agent over the selected time window.
- **Date Range Filter.**

---

### 39. Notifications

**Route:** `/notifications`
**Eyebrow:** Observability

**Purpose:** Monitor the delivery status of all system notifications across all configured channels (Slack, Teams, email, webhook). Diagnose failed or delayed notification deliveries.

**Functionality:** Mounts `NotificationsPanel`. Auth-guarded.

**Features:**
- **Notification Delivery Log:** Each notification entry shows: notification ID, channel type, recipient, event type, sent at, delivery status (delivered / failed / pending), and error message if failed.
- **Channel Filter:** Filter by delivery channel (Slack, Teams, email, webhook).
- **Status Filter:** Filter by delivery outcome (delivered / failed / pending).
- **Retry Failed:** Retry a failed notification delivery directly from this page.
- **Delivery Rate Summary:** Overall delivery success rate across channels.

---

## Footer — Sign Out

**Location:** Bottom of sidebar, always visible.

### Workspace Indicator

When the session has only one workspace, the footer displays the workspace name and an "Active workspace" label with the workspace initials rendered as a coloured avatar. This is static (non-interactive) when there is only one workspace — the switcher in the nav body is used for multi-workspace tenants.

### Sign Out

**Action:** `POST /api/auth/logout` → clears the `agentfarm_internal_session` cookie → redirects to `/login`.

**Purpose:** Securely end the operator session. The logout performs a server-side invalidation before clearing the cookie client-side to prevent session token reuse.

---

## Navigation Behaviour Notes

### Tab-Based Pages vs Standalone Pages

The **Operations** section (Overview, Approvals, Observability, Evidence) renders on the root route `/` using a `?tab=` query parameter. Navigation within this section does **not** cause a full page reload — it updates the URL and React re-renders the active panel. All other sections navigate to distinct routes (`/agents`, `/tasks`, etc.) with full page loads.

### Tab Persistence

The active Operations tab is persisted to `localStorage` using a key derived from the workspace ID (`getDashboardTabStorageKey(workspaceId)`). When a user returns to the dashboard (or switches back from another page), the last active tab for that workspace is automatically restored.

### Deep Linking

Several pages support deep linking via URL query parameters:
- Approvals: `/?tab=approvals&focusedApprovalId=APR-1009` focuses and highlights a specific approval.
- Evidence: `/?tab=audit&correlationId=corr_prov_001` highlights events with that correlation ID.
- Session Replay: `/audit/session-replay?sessionId=<id>` loads a specific session directly.
- Bot Snapshots: `/snapshots?botId=<id>` loads snapshots for a specific bot.
- Routine Scheduler: `/routine-tasks?botId=<id>&workspaceId=<id>` scopes to a bot/workspace.

### Authentication

Every protected page checks `getSessionPayload()` server-side. If no valid session cookie (`agentfarm_internal_session`) is found, the user is redirected to `/login?next=<current-path>`. After login, the `?next=` path is used to redirect back to the originally requested page. Login is restricted to `@agentfarms.in` email addresses.

### Plan Gates

The **Audit & Compliance** section (Audit Log, Session Replay, Operational Signals, Circuit Breakers) requires the **Business+** plan. Without it:
- The sidebar section header shows a padlock icon.
- The four links are replaced by a single "Upgrade to unlock → Business+" link pointing to `/billing`.
- Navigating directly to any of these routes renders an `AuditUpgradeWall` component in place of the data.

### Fallback Data

All server-rendered pages fetch live data from the API gateway. If the API is unreachable or returns an error, every data loader falls back to static hardcoded fallback values so the dashboard remains usable for UI exploration even without a live backend.
