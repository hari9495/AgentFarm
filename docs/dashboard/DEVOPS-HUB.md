# DevOps Hub — Detailed Reference

> **Route:** `/devops`
> **Client component:** `DevOpsHubClient` in `apps/dashboard/app/devops/devops-hub-client.tsx`
> **Auth:** Server-rendered shell checks session; redirects to `/login?next=/devops` if unauthenticated.

The DevOps Hub consolidates all 11 developer-operations tools into a single tabbed interface. Each sub-tab is also accessible as its own standalone page in the Developer Tools sidebar section. The hub is the preferred entry point when working across multiple tools in one session.

---

## Table of Contents

1. [CI Triage](#1-ci-triage)
2. [PR Drafts](#2-pr-drafts)
3. [Env Reconciler](#3-env-reconciler)
4. [Bot Snapshots](#4-bot-snapshots)
5. [Handoffs](#5-handoffs)
6. [Autonomous Loops](#6-autonomous-loops)
7. [Orchestration Runs](#7-orchestration-runs)
8. [Routine Scheduler](#8-routine-scheduler)
9. [Wake Runs](#9-wake-runs)
10. [A/B Tests](#10-ab-tests)
11. [Desktop](#11-desktop)

---

## 1. CI Triage

**Standalone route:** `/ci`
**Eyebrow label:** Engineering
**Component:** `CiTriagePanel`

CI Triage allows operators to submit failed CI/CD pipeline logs for automated root-cause analysis by the developer agent.

### Submission Form
- **Failure log input:** A large textarea for pasting the raw CI failure output (stdout/stderr from the failed run).
- **Pipeline URL (optional):** A URL to the failed CI run for reference.
- **Branch / PR reference (optional):** The branch or PR number associated with the failure.
- **Submit** button: Posts to `POST /api/ci/triage` with the failure text and metadata.

### Triage Results Panel
After submission, the agent analyses the failure log and returns a structured triage result:

| Field | Description |
|---|---|
| Root Cause Summary | One-paragraph explanation of what caused the failure |
| Suspected Files | List of file paths most likely involved in the failure, with reasoning |
| Error Classification | Category of failure (e.g., compilation_error, missing_dependency, test_assertion, infrastructure) |
| Confidence Score | 0.0–1.0 confidence in the root cause analysis |
| Proposed Patch | A diff showing what the agent recommends changing to fix the failure |
| Steps to Reproduce | Numbered steps to reproduce the issue locally |

### Patch Application
If the agent proposes a patch:
- The patch is shown as a colour-coded diff (red = removed, green = added).
- **Apply to workspace:** Sends the patch to the agent runtime for execution (requires approval if the change is medium/high risk).
- **Copy patch:** Copies the raw diff to the clipboard.
- **Dismiss:** Discards the proposed patch without applying.

### Triage History
A table below the form shows previous submissions:
- Submission ID, branch/PR, submission timestamp, triage status (pending / complete / failed), root cause classification.
- Clicking any row expands the full triage result.

---

## 2. PR Drafts

**Standalone route:** Not a standalone page — only accessible via DevOps Hub.
**Component:** `PrDraftsPanel`

PR Drafts is the interface for reviewing, approving, and publishing AI-generated pull requests. When a developer agent completes a code task and creates a local commit, it generates a draft PR and holds it here for operator review before pushing to the remote.

### Draft List
Each draft PR card shows:
- Draft PR title (agent-generated from the task description).
- Branch name and base branch.
- Files changed count and lines added/removed (diff summary).
- Task ID that produced this PR.
- Created At timestamp.
- Status: `draft` (awaiting review), `publishing` (push in progress), `published` (merged or PR created), `discarded`.

### PR Detail View
Clicking a draft opens the detail view:
- **Title edit:** Operators can edit the PR title before publishing.
- **Description:** Agent-generated PR body (following the workspace's PR template if configured).
- **Diff viewer:** Full file-by-file diff with syntax highlighting.
- **Files changed list:** Each file is collapsible; click to jump to that file's diff section.
- **Commit history:** Commits included in this PR branch.

### Actions
- **Publish:** Pushes the branch and creates the PR on the remote (GitHub, GitLab, etc.). Posts to `POST /api/developer/prs/:draftId/publish`.
- **Request changes:** Sends a free-text note back to the agent, which re-queues a revision task.
- **Discard:** Marks the draft as discarded and deletes the local branch. Posts to `DELETE /api/developer/prs/:draftId`.
- **Copy branch name:** For manual checkout and review.

---

## 3. Env Reconciler

**Standalone route:** `/env`
**Eyebrow label:** Infrastructure
**Component:** `EnvReconcilerPanel`
**Auth:** Redirects to `/login?next=/env`.

The Env Reconciler detects and resolves environment variable drift between what the agent's workspace configuration declares and what is currently resolved.

### Expected vs Actual Table

A side-by-side comparison table with three states:

| State | Indicator | Meaning |
|---|---|---|
| Match | Green checkmark | Expected value matches actual value |
| Missing | Red "MISSING" badge | Variable is declared in config but not present in environment |
| Changed | Amber "CHANGED" badge | Variable exists but its value has changed from the expected |
| Extra | Grey "EXTRA" badge | Variable exists in the environment but is not declared in config |

The table shows:
- Variable name.
- Expected value (masked if marked as secret).
- Actual value (masked if marked as secret).
- Status indicator.
- Last reconciled timestamp.

### Toolchain Version Monitor

Below the env var table, a separate section tracks tool versions installed in the agent's execution environment:

| Tool | Expected | Actual | Status |
|---|---|---|---|
| Node.js | 20.x | 20.18.2 | Match |
| Python | 3.12.x | 3.11.9 | Mismatch |
| Docker | ≥24.0 | 24.0.7 | Match |
| pnpm | 9.x | 9.4.0 | Match |
| Git | ≥2.40 | 2.45.2 | Match |

Mismatched versions show an amber badge and a "Remediate" button that queues a toolchain update task.

### Reconcile Action
The **Reconcile** button applies the expected environment configuration as the active configuration:
- Posts to `POST /api/workspaces/:workspaceId/env/reconcile`.
- Returns a reconciliation report listing which variables were added, updated, or removed.
- Changes are applied to the agent's execution environment immediately; the runtime is restarted if `RESTART_ON_ENV_CHANGE=true`.

### Export Diff
Downloads the current env diff as a `.env.diff` text file for sharing with the DevOps team.

---

## 4. Bot Snapshots

**Standalone route:** `/snapshots` (supports `?botId=<id>`)
**Eyebrow label:** Agent State
**Component:** `CapabilitySnapshotPanel`
**Auth:** Auth-guarded.

Capability snapshots are **point-in-time records** of an agent's full configuration at a moment in time. They are created automatically each time the agent's capability set changes and can also be triggered manually.

### Snapshot List
The list of all historical snapshots for the selected bot, ordered newest first:
- Snapshot ID (UUID).
- Created At timestamp.
- Trigger: `auto` (system-generated on config change) or `manual` (operator-triggered).
- Change description: What changed from the previous snapshot (diff summary).

### Latest Snapshot Card
The most recent snapshot is displayed prominently as a card with all fields expanded:

**Allowed Actions:**
A grid of action type badges — each action the agent is currently allowed to perform. Green badge = allowed, red = blocked, amber = allowed with approval required.

**Connector State:**
Each configured connector's status at the time of the snapshot: connected / degraded / not_configured.

**LLM Config:**
The provider, model, temperature, and max_tokens configured at the time.

**Skill Set:**
List of skills enabled for the agent at snapshot time.

**Feature Flags:**
Which agent-specific feature flags were active.

### Snapshot Diff
Select any two snapshots in the list and click **Compare**:
- A side-by-side diff shows exactly what changed between the two snapshots.
- Added capabilities/settings shown in green; removed shown in red; unchanged shown in grey.

### Manual Snapshot
The **Capture Snapshot** button creates a new snapshot of the agent's current state. Posts to `POST /api/bots/:botId/snapshots`. Useful before making a configuration change so you have a clean rollback point.

---

## 5. Handoffs

**Standalone route:** `/handoffs`
**Eyebrow label:** Multi-Agent
**Component:** `HandoffsPanel`
**Auth:** Auth-guarded.

Agent-to-agent task handoffs occur in multi-agent workflows when one agent completes its portion of a task and transfers it to another agent. Handoffs appear here for review and completion.

### Pending Handoffs List
Each pending handoff card shows:
- Handoff ID.
- Source agent (who is handing off) and target agent (who should receive the task).
- Task ID and task summary.
- Handoff payload: the data and instructions being transferred.
- Time waiting (how long the handoff has been pending).
- Status: `pending_acceptance`, `accepted`, `rejected`, `completed`.

### Handoff Detail
Expanding a handoff shows:
- Full handoff payload (JSON, formatted).
- Source agent's completion summary (what it accomplished).
- Instructions for the target agent (what it should do next).
- Any attachments (file paths, artefacts).

### Accept / Reject
- **Accept:** Routes the handoff to the target agent's task queue. Posts to `POST /api/handoffs/:id/accept`.
- **Reject:** Sends the handoff back to the source agent with an optional reason. Posts to `POST /api/handoffs/:id/reject`.
- **Reassign:** Route the handoff to a different agent than the original target.

### Create Manual Handoff
The **New Handoff** button allows operators to manually initiate an agent-to-agent handoff without waiting for the source agent to generate one. Useful for redirecting work mid-task.

Fields:
- Source agent (who is handing off — may be left as "operator").
- Target agent (who should receive the work).
- Task payload (free-form JSON or pre-filled from an existing task).
- Instructions.

### Completed Handoffs
A separate table below shows handoffs that have been accepted and completed, with outcome and timestamps.

---

## 6. Autonomous Loops

**Standalone route:** `/loops`
**Eyebrow label:** Automation
**Component:** `AutonomousLoopsPanel`
**Auth:** Redirects to `/login?next=/loops`.

Autonomous loops are self-directing agent tasks that the runtime repeats until a stop condition is met.

### Active Loops List
Each loop card shows:
- Loop ID and name.
- Target agent.
- Status: `running`, `paused`, `stopped`, `completed`, `error`.
- Iteration count (current / max).
- Last iteration timestamp.
- Next scheduled iteration time (for time-gated loops).

### Create Loop
A modal form to define a new loop:

| Field | Description |
|---|---|
| Loop name | Display name for identification |
| Task description | What the agent should do on each iteration |
| Target agent | Which bot executes the loop |
| Stop condition | An LLM-evaluated condition (free text). The loop ends when the LLM evaluates this as true at the end of each iteration (e.g., "all failing tests pass"). |
| Max iterations | Hard cap on the number of iterations (safety guard) |
| Iteration interval | Minimum wait between iterations (e.g., 5 minutes) |
| Start immediately | Toggle; if off, loop starts in `paused` state |

Stop conditions are evaluated by the LLM after each iteration completes. The condition text is injected into a prompt along with the iteration output, and the LLM returns `{ met: boolean, reason: string }`.

### Loop Detail
Expanding a loop shows the full iteration history:

| Column | Description |
|---|---|
| Iteration # | Sequential number |
| Started At | Timestamp |
| Duration | Wall-clock time |
| Output Preview | First 200 chars of the iteration output |
| Stop Condition Evaluated | Was the stop condition true? |
| Status | success / failed / stop_condition_met |

### Lifecycle Controls
- **Pause:** Pauses the loop after the current iteration completes. The loop retains its state and can be resumed.
- **Resume:** Resumes a paused loop.
- **Stop:** Permanently stops the loop (cannot be resumed; a new loop must be created).
- **Force Next Iteration:** Trigger an iteration immediately, ignoring the interval.

---

## 7. Orchestration Runs

**Standalone route:** `/orchestration`
**Eyebrow label:** Multi-Agent
**Component:** `OrchestrationRunsPanel`
**Auth:** Auth-guarded.

Orchestration runs are complex multi-agent workflows executed by the GOAP (Goal-Oriented Action Planning) planner. The planner decomposes a high-level goal into a sequence of sub-tasks and assigns each to the most suitable agent.

### Active Runs List
Each run card shows:
- Run ID.
- Goal description.
- Status: `planning`, `executing`, `awaiting_approval`, `completed`, `failed`, `cancelled`.
- Participating agents (list of bot IDs/names).
- Progress: `N / M steps completed`.
- Started At timestamp.

### Run Detail
Expanding a run shows the GOAP plan:

**Plan Steps Table:**

| Step # | Sub-goal | Assigned Agent | Status | Duration | Output Preview |
|---|---|---|---|---|---|
| 1 | Analyse failing tests | Developer bot | ✅ Completed | 45s | "Found 3 test failures in auth module" |
| 2 | Write fix for auth module | Developer bot | 🔄 Running | — | — |
| 3 | Run tests to verify fix | Tester bot | ⏳ Queued | — | — |
| 4 | Create PR | Developer bot | ⏳ Queued | — | — |

Steps that require approval are highlighted with an amber badge and a link to the Approvals queue.

### Start New Run
The **New Orchestration Run** button opens a form:
- **Goal:** Free-text description of the high-level goal.
- **Agent selection:** Multi-select which agents to involve (the planner will assign sub-tasks to them).
- **Max steps:** Hard cap on plan length (safety guard).
- **Dry-run mode:** Generate the plan without executing it (for review before committing).

Posts to `POST /api/orchestration/runs`.

### Cancel Run
The **Cancel** button stops an in-progress run and marks all remaining steps as cancelled. Posts to `DELETE /api/orchestration/runs/:runId`.

---

## 8. Routine Scheduler

**Standalone route:** `/routine-tasks` (supports `?botId=` and `?workspaceId=`; defaults to `bot_dev_001` / `ws_primary_001`)
**Eyebrow label:** Agent Automation
**Component:** `RoutineSchedulerPanel`

The Routine Scheduler manages **recurring scheduled tasks** — tasks that run automatically on a cron-style schedule without manual triggering.

### Scheduled Tasks List
Each routine row shows:
- Routine name.
- Cron expression (e.g., `0 9 * * 1-5` = weekdays at 9am).
- Human-readable schedule description (e.g., "Every weekday at 09:00").
- Target agent.
- Enabled/disabled toggle.
- Last run: timestamp and outcome (success / failed / skipped).
- Next run: computed from the cron expression.

### Create Routine
A form to define a new recurring task:

| Field | Description |
|---|---|
| Name | Display name |
| Task description | What the agent should do on each run |
| Cron expression | Standard 5-field cron syntax; a human-readable preview is shown as you type |
| Target agent (bot ID) | Which agent runs the task |
| Start date | When the schedule becomes active |
| End date (optional) | When the schedule expires |
| Max retries | How many times to retry on failure before alerting |
| Notification on failure | Toggle; sends a notification to the configured channel on failure |

### Enable / Disable
Each routine has a toggle. Disabled routines remain configured but will not fire. Re-enabling restores the schedule immediately.

### Run History
Expanding a routine shows its execution history:
- Run ID, start time, duration, outcome, error message (if failed), tokens used.

---

## 9. Wake Runs

**Standalone route:** `/wake-runs`
**Eyebrow label:** Scheduling
**Component:** `WakeRunsPanel`
**Auth:** Redirects to `/login?next=/wake-runs`.

Wake Runs are **one-shot scheduled tasks** — unlike routines (which repeat), a wake run fires once at a specific future datetime and then expires.

### Pending Wake Runs
Tasks scheduled but not yet fired:
- Wake Run ID.
- Fire time (ISO datetime with timezone).
- Time remaining (relative, e.g., "in 2 hours 14 minutes").
- Task description.
- Target agent.
- Status: `scheduled`, `firing`, `fired`, `cancelled`.

### Schedule Wake Run
A form to create a new wake run:

| Field | Description |
|---|---|
| Task payload | JSON payload or free-text task description |
| Target agent | Which bot should execute this |
| Fire at | ISO datetime picker (must be in the future) |
| Notification on fire | Toggle; sends a notification when the task fires |

Posts to `POST /api/schedules/wake-runs`.

### Fired Wake Runs
Historical table of wake runs that have already executed:
- Fire time, actual execution time (may differ slightly due to scheduling jitter), task description, outcome, duration.

### Cancel Wake Run
Each pending wake run has a **Cancel** button. Cancellation deletes the scheduled event before it fires. Posts to `DELETE /api/schedules/wake-runs/:id`.

---

## 10. A/B Tests

**Standalone route:** `/ab-tests`
**Eyebrow label:** A/B Testing
**Component:** `AbTestsPanel`
**Auth:** Auth-guarded.

A/B Tests allow comparing two variants of agent configuration (LLM models, prompts, skill sets, etc.) to determine which produces better task outcomes. Traffic is split between the two variants and metrics are collected per variant.

### Active Tests List
Each test card shows:
- Test name and description.
- Variant A label and Variant B label.
- Traffic split percentage (e.g., "50% / 50%").
- Sample counts: how many tasks have been routed to each variant.
- Primary metric (e.g., `success_rate`, `cost_per_task`, `latency_ms`).
- Status: `running`, `paused`, `concluded`.
- Started At timestamp.

### Create Test
A form to define a new A/B test:

| Field | Description |
|---|---|
| Test name | Display name |
| Description | What hypothesis this test is checking |
| Variant A config | JSON config override for Variant A (e.g., `{ "llm_model": "gpt-4o" }`) |
| Variant B config | JSON config override for Variant B (e.g., `{ "llm_model": "claude-3-5-sonnet" }`) |
| Traffic split | Percentage routed to Variant A (remainder goes to B) |
| Primary metric | Which metric determines the winner |
| Target agent | Which bot is being tested |
| Min sample size | How many tasks per variant before results are considered statistically valid |

Posts to `POST /api/ab-tests`.

### Results Panel
For each running or concluded test:

| Metric | Variant A | Variant B | Winner |
|---|---|---|---|
| Success Rate | 87.3% | 91.2% | B (+3.9%) |
| Avg Latency (ms) | 4,210 | 3,890 | B (-7.6%) |
| Cost per Task (USD) | $0.031 | $0.038 | A (-18.4%) |
| Quality Score | 7.2 | 8.1 | B (+12.5%) |

Statistical significance is shown per metric (p-value badge). Metrics with fewer samples than the minimum show an "insufficient data" placeholder.

### Conclude Test
Clicking **Conclude** on a running test:
- Opens a dialog showing the final results summary.
- Select the winning variant (or "No winner — keep current").
- Clicking **Promote Winner** applies the winning variant's config as the default for the target agent. Posts to `POST /api/ab-tests/:id/conclude` with `{ winner: 'A' | 'B' | 'none' }`.

---

## 11. Desktop

**Standalone route:** `/desktop`
**Eyebrow label:** Automation
**Components:** `DesktopPanel` + `DesktopStreamPanel`
**Auth:** Auth-guarded.

The Desktop page monitors and controls the **full-desktop-mode agent** — the agent running with noVNC + Xvfb that operates a real graphical desktop environment for tasks that cannot be done via API (e.g., navigating legacy web apps, using proprietary software).

### DesktopPanel

#### Agent Profile
- Agent name, role, and the desktop session ID.
- VM ID and hostname.
- Desktop session status: `active`, `idle`, `not_running`.
- Xvfb display: which virtual display the session is on (e.g., `:99`).
- Browser session ID and browser version.
- Last screenshot timestamp.

#### Browser Action History
A chronological log of every browser/desktop action the agent has taken in the current session:

| Field | Description |
|---|---|
| Action Type | click, type, navigate, screenshot, scroll, key_press, wait, assert_element |
| Target | CSS selector or element description (for click/type) |
| Value | Text typed, URL navigated to, or key pressed |
| Status | success / failed |
| Duration (ms) | How long the action took |
| Screenshot | Thumbnail of the screen after the action (click to enlarge) |
| Timestamp | ISO timestamp |

#### Run Automation
A free-text input to dispatch a browser automation instruction to the desktop agent. The agent interprets the instruction using the LLM vision loop (screenshot → LLM → action → repeat). Posts to `POST /api/desktop/actions`.

Example instructions:
- "Navigate to https://example.com and fill in the login form with test credentials"
- "Click the 'Export' button and wait for the download dialog"

### DesktopStreamPanel

#### Live Screen Stream
An embedded noVNC viewer showing the agent's current desktop in real time. The stream is delivered over WebSocket.

- **Start Stream:** Fetches the WebSocket URL from `GET /api/desktop/stream-url` and connects the noVNC client.
- **Stop Stream:** Disconnects the WebSocket; the agent continues operating.
- **Resolution display:** Current display resolution (e.g., 1280×800).
- **Connection status:** Connected (green) / Disconnected / Reconnecting.
- **Latency indicator:** Approximate stream latency in milliseconds.
- **Fullscreen:** Expand the stream to fill the browser window.
