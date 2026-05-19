# Sprint 10 — Full Desktop VM (noVNC + Vision Loop)

Status: COMPLETED
Completed: 2026-05-18

## Objective

Ship the full desktop agent mode — every agent can see a screen, move a mouse, and type like a human employee. This unlocks tools with no MCP server (legacy web apps, thick clients, any tool a human can use visually). 

Two deliverables:
1. **Full Desktop VM** — Docker container running Xvfb (virtual display) + noVNC (browser stream) + Playwright/PyAutoGUI
2. **VM Lifecycle Management** — auto-provision VM when customer hires agent, auto-teardown when customer fires agent (connecting the `cleanup_pending` job created in Sprint 9 to actual cloud resource deletion)

---

## Feature 1 — Full Desktop Docker Container

### Why
Some customer tools have no MCP server. The agent must log in visually, navigate, and operate them. Today, only headless Playwright (MCP-based) mode exists.

### What to build

**New: `docker/desktop-agent/Dockerfile`**
- Base: `ubuntu:22.04`
- Install: `Xvfb`, `x11vnc`, `novnc`, `python3`, `playwright`, `pyautogui`, `wmctrl`
- Start sequence: `Xvfb :99` → `x11vnc -display :99 -rfbport 5900` → `websockify 6080 localhost:5900` (noVNC WebSocket bridge)
- DISPLAY env variable: `:99`

**New: `services/desktop-agent/src/vision-loop.ts`**
- Input: task description (string)
- Loop: screenshot → encode as base64 → call LLM with vision (GPT-4o or Claude 3.5 Sonnet) → parse action → execute via Playwright/PyAutoGUI → repeat
- Termination: LLM returns `{ done: true }` or max 30 iterations
- Actions: `click(x, y)`, `type(text)`, `scroll(direction, amount)`, `keypress(key)`, `wait(ms)`
- Returns: `VisionLoopResult` (success, stepsTaken, finalScreenshot, error?)

**New: `services/desktop-agent/src/screen-capture.ts`**
- `captureScreen(): Promise<string>` — takes screenshot via Playwright `page.screenshot()` or `scrot`, returns base64 PNG

**New: `services/desktop-agent/src/action-executor.ts`**
- Executes parsed LLM actions via Playwright (browser) or PyAutoGUI (native apps)
- Safety: no action targeting outside the DISPLAY session; no host filesystem access

**New: `packages/shared-types/src/desktop-agent-contracts.ts`**
- `VisionLoopRequest` — taskDescription, maxIterations?, llmModel?
- `VisionLoopResult` — success, stepsTaken, finalScreenshot?, error?
- `DesktopAction` — type ('click'|'type'|'scroll'|'keypress'|'wait'), params
- CONTRACT_VERSIONS addition: `DESKTOP_AGENT: '1.0.0'`

**New: `apps/api-gateway/src/routes/desktop-agent.ts`**
- `POST /v1/desktop/start` — starts a noVNC session for botId, returns `{ sessionId, streamUrl }` (HTTP 201)
- `GET /v1/desktop/:sessionId/stream` — returns noVNC WebSocket URL for live streaming
- `POST /v1/desktop/:sessionId/task` — submits a task to the vision loop
- `DELETE /v1/desktop/:sessionId` — terminates session and cleans up

**Modified: `docker-compose.yml`**
- Add `desktop-agent` service using `docker/desktop-agent/Dockerfile`
- Expose port 6080 (noVNC WebSocket)
- Set `DISPLAY=:99` env

**Modified: `apps/dashboard/app/components/`**
- Add `desktop-stream-viewer.tsx` — embeds noVNC iframe showing live agent screen
- Add `desktop-task-panel.tsx` — submit task to running desktop session + view steps/output

---

## Feature 2 — VM Lifecycle Management

### Why
Sprint 9 created `cleanup_pending` ProvisioningJob on agent fire. But nothing actually tears down the Azure VM. Similarly, when a customer hires via the wizard (Sprint 4/5), a ProvisioningJob is created but the actual VM is not yet provisioned automatically.

### What to build

**New: `services/provisioning-service/src/vm-lifecycle-manager.ts`**
- `provisionAgentVM(job: ProvisioningJobRecord, config: VMConfig): Promise<VMProvisionResult>`
  - Calls Azure ARM API (`@azure/arm-compute`, `@azure/arm-network`) to create VM
  - Tags: `botId`, `tenantId`, `purpose: agentfarm-runtime`
  - Uses Managed Identity from `infrastructure/runtime-plane/main.bicep`
- `terminateAgentVM(botId: string, tenantId: string): Promise<void>`
  - Finds VM by tag `botId`
  - Stops and deallocates → deletes NIC → deletes OS disk → deletes VM
  - Revokes Managed Identity in Entra ID
  - Marks ProvisioningJob `status: cleanup_complete`

**New: `services/provisioning-service/src/provisioning-poller.ts`**
- Polls `ProvisioningJob` table every 30s
- `status: 'pending'` → calls `provisionAgentVM()`
- `status: 'cleanup_pending'` → calls `terminateAgentVM()`
- Updates job status: pending → provisioning → active; cleanup_pending → cleaning → cleanup_complete
- Error handling: job moves to `failed` after 3 retries (stored in `retryCount` field)

**Modified: `apps/api-gateway/src/routes/admin-provision.ts`**
- After creating ProvisioningJob, trigger provisioning-poller (or emit event to queue)

**New: `packages/shared-types/src/vm-lifecycle-contracts.ts`**
- `VMProvisionResult` — vmId, privateIp, managedIdentityId, status
- `VMTerminateResult` — success, resourcesDeleted[]
- CONTRACT_VERSIONS addition: `VM_LIFECYCLE: '1.0.0'`

---

## Environment Variables Needed

```
# Full desktop agent
DISPLAY=:99
NOVNC_PORT=6080
VISION_LLM_ENDPOINT=<azure-openai-endpoint>
VISION_LLM_DEPLOYMENT=<gpt-4o-deployment>
VISION_LLM_API_KEY=<key>

# VM lifecycle
AZURE_SUBSCRIPTION_ID=<subscription-id>
AZURE_RESOURCE_GROUP=<rg-name>
AZURE_VM_IMAGE=Ubuntu2204
AZURE_VM_SIZE=Standard_B2s
AZURE_CLIENT_ID=<managed-identity-client-id>
```

---

## Definition of Done

- [ ] Desktop Docker container builds and starts: Xvfb + x11vnc + noVNC WebSocket on port 6080
- [ ] Vision loop: screenshot → GPT-4o action → execute → repeat; terminates cleanly with `{ done: true }`
- [ ] `POST /v1/desktop/start` returns `{ sessionId, streamUrl }` (201)
- [ ] Dashboard shows live noVNC screen stream via `desktop-stream-viewer.tsx`
- [ ] `provisionAgentVM()` creates Azure VM with correct tags, managed identity, private networking
- [ ] `terminateAgentVM()` fully cleans up: VM + NIC + disk + Entra identity
- [ ] Provisioning poller handles `pending` → `active` and `cleanup_pending` → `cleanup_complete`
- [ ] `pnpm --filter @agentfarm/api-gateway typecheck` PASS
- [ ] `pnpm --filter @agentfarm/shared-types typecheck` PASS
- [ ] New route tests added for `desktop-agent.ts` routes (401/404/201/400 scenarios)
- [ ] `node scripts/quality-gate.mjs` PASS → `operations/quality/10.1-quality-gate-report.md`

---

## Risk Register

| Risk | Impact | Mitigation |
|------|--------|-----------|
| noVNC latency too high for real-time vision loop | High | 1 FPS screenshot cadence; LLM decides whether to act |
| GPT-4o vision cost per task too high | Medium | Cache screenshots; skip if no visible change |
| Azure VM ARM calls slow (30–60s provision time) | Medium | Async provisioning poller; show "Provisioning..." in dashboard |
| Cross-tenant VM tagging failure leaks resources | Critical | `tenantId` tag required; VM create fails without it; post-create tag verification |
| noVNC session left open after fire | Medium | Dashboard DELETE call + cleanup_pending job always kills noVNC session |

---

## Dependencies

- Sprint 9: `POST /v1/agents/:botId/terminate` creates `cleanup_pending` job — this sprint connects the job to actual VM teardown
- Sprint 5: `ProvisioningJob` created on wizard complete — this sprint connects the job to actual VM provisioning
- Infrastructure: `infrastructure/runtime-plane/main.bicep` — existing Azure VM templates used as reference

---

## Notes

- Vision loop LLM model: GPT-4o or Claude 3.5 Sonnet (both support vision). Use `VISION_LLM_DEPLOYMENT` to configure.
- PyAutoGUI is for native app control; Playwright is for browser control. Vision loop selects based on `task.targetType`.
- noVNC is browser-accessible at `http://dashboard-host:6080/vnc.html?host=...&port=6080` — embed in iframe inside dashboard.
- Security: DISPLAY is scoped to the container; no cross-container or host display access.

<!-- doc-sync: 2026-05-16 sprint-10 -->

---

## Implementation Closure

**Closed: 2026-05-17**

### What was built

#### Feature 1 — Full Desktop Docker Container

| Artifact | Path | Status |
|---|---|---|
| Desktop agent Dockerfile | `services/desktop-agent/Dockerfile` | ✅ Built |
| Flask vision-loop service | `services/desktop-agent/app.py` | ✅ Built |
| API gateway routes | `apps/api-gateway/src/routes/desktop-sessions.ts` | ✅ Built |
| Route tests | `apps/api-gateway/src/routes/desktop-sessions.test.ts` | ✅ Built |
| Dashboard stream + task panel | `apps/dashboard/app/components/desktop-stream-panel.tsx` | ✅ Built |
| docker-compose.yml service | `docker-compose.yml` (desktop-agent, ports 5003+6080) | ✅ Built |
| Shared types | `packages/shared-types/src/desktop-agent-contracts.ts` | ✅ Built |

#### Feature 2 — VM Lifecycle Management

| Artifact | Path | Status |
|---|---|---|
| Azure ARM lifecycle manager | `services/provisioning-service/src/vm-lifecycle-manager.ts` | ✅ Built |
| Lifecycle manager tests | `services/provisioning-service/src/vm-lifecycle-manager.test.ts` | ✅ Built |
| Provisioning poller façade | `services/provisioning-service/src/provisioning-poller.ts` | ✅ Built |
| Shared types | `packages/shared-types/src/vm-lifecycle-contracts.ts` | ✅ Built |

### Deviations from spec

| Spec | Implementation | Reason |
|---|---|---|
| `POST /v1/desktop/start` | `POST /v1/desktop-sessions` | REST-conventional resource naming |
| `GET /v1/desktop/:id/stream` | Included in GET `/v1/desktop-sessions/:id` (`streamUrl` field) | Eliminates a redundant endpoint |
| `desktop-stream-viewer.tsx` + `desktop-task-panel.tsx` (two files) | `desktop-stream-panel.tsx` (combined) | Simpler UX composition |
| `services/desktop-agent/src/vision-loop.ts` (TypeScript) | `services/desktop-agent/app.py` (Python Flask) | Python chosen for PyAutoGUI + scrot + xdotool native integration |
| `DISPLAY=:99` | `DISPLAY=:1` | Industry default for Xvfb; `:99` reserved by convention for secondary |
| `VISION_LLM_ENDPOINT/DEPLOYMENT/API_KEY` env vars | `LLM_PROVIDER`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` | Supports both Anthropic and OpenAI interchangeably |

### Typecheck status (2026-05-17)

- `pnpm --filter @agentfarm/shared-types typecheck` — **PASS**
- `pnpm --filter @agentfarm/api-gateway typecheck` — **PASS**
- `pnpm --filter @agentfarm/provisioning-service typecheck` — **PASS**
- `pnpm --filter @agentfarm/dashboard typecheck` — **PASS**

### Quality gate

- Initial run (2026-05-16): FAIL — agent-runtime coverage at 76% (threshold 80%)
- Re-run (2026-05-17, `12.1-quality-gate-report.md`): **PASS** — all 46 checks green
  - Agent Runtime coverage: 81.76% ✅
  - Provisioning state-machine regression: 37/37 ✅
  - Desktop sessions route tests: included in API Gateway coverage gate ✅

See `operations/quality/10.1-quality-gate-report.md` and `operations/quality/12.1-quality-gate-report.md`.
