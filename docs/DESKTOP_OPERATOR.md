> **Status:** All desktop operator paths shipped (Sprint 10). Desktop agent container with noVNC/Xvfb is production-ready. See [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) for details.
# AgentFarm Desktop Operator

> Last updated: 2026-05-29 (Sprint 18)
> **Freshness (2026-06-13 audit):** 411 commits have landed since this doc was written; structure remains accurate but verify counts and paths against code. Full verified inventory: [docs/audit/2026-06-13](audit/2026-06-13/README.md).

Full reference for the desktop and browser automation system in `apps/agent-runtime` and `services/desktop-agent`.

---

## Overview

The Desktop Operator provides the agent with the ability to control a browser or full desktop environment. It supports two execution paths:

1. **Local path** — `MockDesktopOperator` (CI/dev) or `PlaywrightDesktopOperator` (headless Chromium)
2. **Desktop VM path** — `NativeDesktopOperator` dispatches to the `desktop-agent` Flask service running in a Docker container with Xvfb (virtual display) + x11vnc + noVNC + PyAutoGUI. A vision loop (screenshot → LLM → action) lets the agent operate any GUI application.

The vision loop supports three LLM providers for vision: Anthropic (claude-3-5-sonnet), OpenAI (gpt-4o), and Ollama (llava). The `workspace_visual_task` action type lets any agent role submit arbitrary GUI goals.

**Three operator implementations:**

| Mode | Class | Use Case |
|---|---|---|
| `mock` | `MockDesktopOperator` | Development, testing, CI — always returns `{ ok: true }` |
| `native` | `NativeDesktopOperator` | Dispatches to desktop-agent Flask API via HTTP |
| `playwright` | `PlaywrightDesktopOperator` | Direct headless Chromium automation |

**Selection:** `DESKTOP_OPERATOR` environment variable controls which operator is instantiated.

### Desktop Agent Service (`services/desktop-agent`)

Python Flask service running inside the per-tenant Docker container:

| Endpoint | Purpose |
|----------|---------|
| `GET /health` | Liveness — returns active session count |
| `POST /v1/sessions` | Create desktop session |
| `GET /v1/sessions/:id/screenshot` | Take and return screenshot |
| `POST /v1/sessions/:id/task` | Submit vision goal; returns action steps |
| `DELETE /v1/sessions/:id` | Terminate session |
| `POST /v1/sessions/:id/join-meeting` | Join a video meeting URL |
| `POST /v1/sessions/:id/speak` | Synthesize and inject speech via PulseAudio |
| `POST /v1/sessions/:id/capture-audio` | Capture meeting audio stream |

**API gateway proxy:** `apps/api-gateway/src/routes/desktop-sessions.ts` proxies all desktop-agent routes under `/v1/sessions/*`.

**Dashboard:** `apps/dashboard/app/components/desktop-stream-panel.tsx` embeds the noVNC iframe and provides session controls (start/stop/task submission).

---

## Factory

**File:** `apps/agent-runtime/src/desktop-operator-factory.ts`

```typescript
async function getDesktopOperator(): Promise<DesktopOperator>
```

- Reads `process.env['DESKTOP_OPERATOR']` (default: `"mock"`)
- Dynamically imports the appropriate class
- Singleton per process — operator is reused across tasks

---

## MockDesktopOperator

Used in development and CI. Does not open a real browser.

### Behavior
- Generates `sessionId` from `DESKTOP_OPERATOR_SESSION_ID` env or `generateSessionId('agt_mock_developer_0001')`
- All actions produce realistic-looking results with before/after screenshot IDs
- Full audit trail via `getAuditLogWriter()` — writes to the same audit log as production
- All screenshots are mock references (no real image data)

### Audit Trail Per Action
Each action writes to the audit log:
```typescript
{
  sessionId, actionId, actionType, agentId, workspaceId, taskId,
  type: 'desktop',
  startedAt, completedAt, durationMs,
  success: boolean, errorMessage?: string,
  verified: false,
  riskLevel: 'low',
  screenshotBefore: 'scr_{actionId}_before',
  screenshotAfter:  'scr_{actionId}_after',
  evidenceBundle: {
    screenshotBefore: { url, sha256: 'mock', sizeBytes: 0, contentType: 'image/png', provider: 'inline' },
    screenshotAfter:  { ... },
    domCheckpoint: null,
    domSnapshotStored: false
  }
}
```

---

## PlaywrightDesktopOperator

Used in production for real browser automation.

**File:** `apps/agent-runtime/src/desktop-operator-playwright.ts`

### Behavior
- Launches Chromium via Playwright
- Takes real screenshots before and after each action
- Screenshots saved to `/tmp/agentfarm-{sessionId}-{action}.png`
- DOM snapshot hash computed after each action
- Network log captured for each page interaction
- All evidence persisted to the audit log and uploaded to Azure Blob Storage

---

## Browser Action Executor

**File:** `apps/agent-runtime/src/browser-action-executor.ts`

A fire-and-forget browser fallback for connector types without a native API.

### `executeBrowserAction(input: BrowserActionInput): Promise<BrowserActionResult>`

```typescript
interface BrowserActionInput {
  url: string;          // Page to open
  instructions: string; // Natural language instructions for the agent
  taskId: string;       // For screenshot naming
}

interface BrowserActionResult {
  ok: boolean;
  output: string;
  reason?: string;
  screenshotBefore?: string; // file path: /tmp/agentfarm-browser-{taskId}-before.png
  screenshotAfter?: string;  // file path: /tmp/agentfarm-browser-{taskId}-after.png
}
```

### Execution Flow
1. Temporarily overrides `DESKTOP_OPERATOR=playwright`
2. Calls `getDesktopOperator()` to get the Playwright operator
3. Navigates to `url`
4. Takes `screenshotBefore`
5. Sends `instructions` to LLM with screenshot context
6. Executes each step returned by LLM
7. Takes `screenshotAfter`
8. Returns result with screenshot paths for evidence attachment

---

## ID Generation

All desktop/browser audit IDs are generated by `@agentfarm/shared-types`:

| Function | Format | Example |
|---|---|---|
| `generateSessionId(agentId)` | `ses_agt_{short}_{timestamp}_{random}` | `ses_agt_0001_1714924800_xk9q` |
| `generateActionId(sessionId, sequence)` | `act_ses_{short}_{sequence}` | `act_ses_xk9q_0042` |
| `generateScreenshotId(actionId, side)` | `scr_{actionId}_{before\|after}` | `scr_act_ses_xk9q_0042_before` |

---

## Database Models

### `AgentSession`

Tracks the full lifecycle of one browser/desktop automation session.

| Field | Key Info |
|---|---|
| `id` | Format: `ses_agt_<agent-short>_<timestamp>_<random>` |
| `agentInstanceId` | Format: `agt_<tenant-short>_<role>_<random>` |
| `taskId` | Links to the task that spawned this session |
| `recordingId` | Format: `rec_ses_<session-short>` |
| `recordingUrl` | Signed URL to `.mp4` recording |
| `status` | `running` → `completed` \| `failed` \| `error` |
| `actionCount` | Total actions in this session |
| `retentionExpiresAt` | null = never auto-delete |
| `retentionPolicyId` | Links to `RetentionPolicy` |

### `BrowserActionEvent`

Immutable audit record for a single browser action within a session.

| Field | Key Info |
|---|---|
| `id` | Format: `act_ses_<session-short>_<sequence>` |
| `sequence` | 0-based position within session |
| `actionType` | `click` \| `fill` \| `navigate` \| `select` \| `submit` \| `key_press` \| `screenshot` \| `hover` \| `scroll` \| `wait` |
| `targetSelector` | CSS selector |
| `pageUrl` | URL at time of action |
| `screenshotBeforeId/Url` | Before-action screenshot |
| `screenshotAfterId/Url` | After-action screenshot |
| `networkLog` | `NetworkEntry[]` — all requests during the action |
| `durationMs` | Execution time |
| `success` | Whether the action succeeded |
| `correctnessAssertion` | `{screenshotDiffPercentage, domChangesDetected, ...}` |

---

## Environment Variables

| Variable | Default | Purpose |
|---|---|---|
| `DESKTOP_OPERATOR` | `"mock"` | Select operator: `mock` \| `native` \| `playwright` |
| `DESKTOP_OPERATOR_SESSION_ID` | auto-generated | Override session ID (useful in tests) |
| `PLAYWRIGHT_HEADLESS` | `"true"` | Run browser headless (set to `"false"` for debugging) |
| `PLAYWRIGHT_SLOW_MO` | `"0"` | Slow down Playwright actions by N ms |
| `DESKTOP_SCREENSHOT_STORAGE` | — | Azure Blob container URL for screenshot storage |

---

## Retention Policies

Desktop session recordings and screenshots can be subject to `RetentionPolicy`:
- `never_delete` — default for compliance sessions
- `auto_delete_after_days` — set `retentionDays` in the policy
- `manual_delete` — requires explicit human action

See [DATA_MODEL.md](./DATA_MODEL.md) for full `RetentionPolicy` model.
