# Crash Recovery + Repro Pack Runbook

**Service**: `api-gateway` — Sprint 4 F9  
**Canonical Spec**: `planning/phase-1-vm-realism-execution-plan.md`  
**Owner**: Platform Engineering  
**Reviewed**: 2026-05-01  

---

## Overview

This runbook covers two operational procedures introduced in Sprint 4:

1. **Crash Recovery** — resuming an interrupted agent run from a persisted checkpoint or latest state snapshot.
2. **Repro Pack Generation** — creating an access-controlled, audited export package for post-crash investigation.

---

## Crash Recovery

### When to Use

Use crash recovery whenever an agent run (`runId`) is interrupted mid-execution and the workspace needs to resume without restarting from scratch. This avoids redundant work and preserves tool/task state.

### Recovery Strategies

| Strategy | Description | Estimated Loss |
|---|---|---|
| `last_checkpoint` | Restores from the most recent saved checkpoint. Work since the last save is replayed. | Minimal |
| `latest_state` | Restores from the most recent full state snapshot. No work is lost. | None |

### Resume Endpoint

```
POST /v1/runs/:runId/resume
Authorization: Bearer <session-token>
Content-Type: application/json

{
  "strategy": "last_checkpoint",
  "workspaceId": "ws-abc123"
}
```

**Success Response** `202 Accepted`:
```json
{
  "runId": "run-xyz",
  "resumedFrom": "ckpt_run-xyz",
  "status": "resumed",
  "estimatedLoss": "minimal",
  "correlationId": "..."
}
```

**Failure Response** `422 Unprocessable Entity`:
```json
{
  "error": "recovery_not_possible",
  "reason": "...",
  "correlationId": "..."
}
```

### Ops Runbook Steps

1. Identify the failed `runId` from the incident alert or agent-runtime logs.
2. Confirm the workspace is in a degraded or interrupted state via the dashboard.
3. Choose a recovery strategy:
   - Start with `latest_state` if no data loss is acceptable.
   - Use `last_checkpoint` if the latest state is unavailable or corrupt.
4. Call the resume endpoint with the appropriate strategy.
5. Monitor the workspace for recovery progress. Check agent-runtime logs for the resumed run.
6. If recovery fails (`422`), escalate to agent-runtime on-call. Do **not** retry more than 3 times without investigation.

### KPI: Recovery Success Rate

The platform maintains a **≥ 95% recovery success rate** for valid run IDs across both strategies. Monitor via the `phase1-run-recovery-worker-test` quality gate check.

---

## Repro Pack Generation

### When to Use

Generate a repro pack whenever a run crash requires post-incident investigation. Repro packs contain:
- Action traces and timeline
- Log bundle (if `includeLogs=true`)
- Workspace diffs (if `includeDiffs=true`)
- Screenshots (if `includeScreenshots=true`)

### Access Control

- Only users with the workspace in their session `workspaceIds` can create or retrieve repro packs.
- Every repro pack creation generates an `exportAuditEventId`. All exports are audited.
- Packs expire 7 days after creation.
- Cross-tenant access returns `403 Forbidden`.

### Create Repro Pack

```
POST /v1/workspaces/:workspaceId/repro-packs
Authorization: Bearer <session-token>
Content-Type: application/json

{
  "runId": "run-xyz",
  "includeScreenshots": true,
  "includeDiffs": true,
  "includeLogs": true
}
```

**Success Response** `201 Created`:
```json
{
  "reproPackId": "...",
  "downloadRef": "repro-packs/tenant-id/ws-id/pack-id.zip",
  "expiresAt": "2026-05-08T...",
  "exportAuditEventId": "...",
  "correlationId": "..."
}
```

### Retrieve Repro Pack

```
GET /v1/workspaces/:workspaceId/repro-packs/:reproPackId
Authorization: Bearer <session-token>
```

**Success Response** `200 OK`:
```json
{
  "reproPackId": "...",
  "manifest": { ... },
  "downloadRef": "...",
  "expiresAt": "...",
  "exportAuditEventId": "...",
  "createdAt": "...",
  "correlationId": "..."
}
```

### Ops Runbook Steps

1. After a run crash, identify the `runId` and `workspaceId` from the incident.
2. Request a repro pack with all flags enabled for full coverage:
   ```bash
   curl -X POST https://api.agentfarm.io/v1/workspaces/WS_ID/repro-packs \
     -H "Authorization: Bearer TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"runId":"run-xyz","includeScreenshots":true,"includeDiffs":true,"includeLogs":true}'
   ```
3. Record the `exportAuditEventId` in the incident ticket.
4. Share the `downloadRef` with the investigating engineer. Do **not** share the `downloadRef` publicly — it contains workspace-scoped data.
5. Confirm expiry and rotate/regenerate if the pack expires before investigation is complete.
6. After investigation, confirm audit log shows the export event linked to the incident ticket.

### Security Reminders

- Never share `downloadRef` outside the tenant boundary.
- Ensure repro pack creation is recorded in the incident log with the `exportAuditEventId`.
- If a pack is created by mistake, record the `exportAuditEventId` in the incident log for audit purposes. Packs automatically expire after 7 days.

---

## Incident Escalation Matrix

| Symptom | First Response | Escalation |
|---|---|---|
| Resume returns `422` 3+ times | Check agent-runtime logs | Agent-runtime on-call |
| Resume returns `400 invalid_strategy` | Verify client is sending valid strategy | Client team |
| Repro pack returns `403 forbidden` | Verify session workspaceIds include the target workspace | Auth/session service on-call |
| Repro pack `downloadRef` returns 404 | Pack may have expired (7 day TTL) | Regenerate the pack |
| `exportAuditEventId` missing | Critical — do not proceed | Escalate to security on-call immediately |

---

## Quality Gate

These checks must pass before any Sprint 4 release:

| Check ID | Description |
|---|---|
| `phase1-repro-packs-test` | Route tests for F9 endpoints |
| `phase1-run-recovery-worker-test` | Recovery service unit tests + 95% KPI |
| `phase1-sprint4-integration` | Sprint 4 exit-gate integration test |

Run the Phase 1 checks locally:
```bash
pnpm --filter @agentfarm/api-gateway exec tsx --test src/routes/repro-packs.test.ts
pnpm --filter @agentfarm/api-gateway exec tsx --test src/services/run-recovery-worker.test.ts
pnpm --filter @agentfarm/api-gateway exec tsx --test src/routes/sprint4-integration.test.ts
```

<!-- doc-sync: 2026-05-06 sprint-6 -->
> Last synchronized: 2026-05-06 (Sprint 6 hardening and quality gate pass).

<!-- doc-sync: 2026-05-06 full-pass-2 -->
> Last synchronized: 2026-05-06 (Full workspace sync pass 2 + semantic sprint-6 alignment).
