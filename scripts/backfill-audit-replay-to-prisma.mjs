import { DatabaseSync } from 'node:sqlite';
import { PrismaClient } from '@prisma/client';

const sqlitePath = process.env.AGENT_OBSERVABILITY_DB_PATH ?? '.agent-observability.sqlite';

if (!process.env.DATABASE_URL?.trim()) {
    console.error('DATABASE_URL is required for replay backfill.');
    process.exit(1);
}

const prisma = new PrismaClient();
const sqlite = new DatabaseSync(sqlitePath, { readOnly: true });

const selectRowsSql = `
SELECT
  id,
  agent_id,
  task_id,
  session_id,
  action_type,
  target,
  screenshot_before_url,
  screenshot_after_url,
  dom_snapshot_hash,
  network_requests,
  duration_ms,
  success,
  error_message,
  started_at,
  completed_at
FROM agent_action_events
ORDER BY session_id ASC, started_at ASC;
`;

const normalizeActionType = (value) => {
    const normalized = String(value ?? '').toLowerCase();
    if (normalized.includes('navigate') || normalized.includes('browser_open')) {
        return 'navigate';
    }
    if (normalized.includes('fill') || normalized.includes('type')) {
        return 'fill';
    }
    if (normalized.includes('select')) {
        return 'select';
    }
    if (normalized.includes('submit')) {
        return 'submit';
    }
    if (normalized.includes('key')) {
        return 'key_press';
    }
    if (normalized.includes('hover')) {
        return 'hover';
    }
    if (normalized.includes('scroll')) {
        return 'scroll';
    }
    return 'click';
};

const decodeRoleFromAgentId = (agentId) => {
    const match = String(agentId ?? '').match(/^agt_[^_]+_([^_]+)_/);
    return match ? match[1] : 'developer';
};

const deriveTenantId = (agentId) => {
    const match = String(agentId ?? '').match(/^agt_([a-f0-9]{8})_/);
    return match ? `ten_${match[1]}` : 'ten_unknown';
};

const deriveRecordingId = (sessionId) => {
    const parts = String(sessionId ?? '').split('_');
    const sessionShort = parts.at(-1) || 'unknown';
    return `rec_ses_${sessionShort}`;
};

const deriveScreenshotId = (actionId, timing) => `scr_${actionId}_${timing}`;

const parseNetworkLog = (value) => {
    if (!value) {
        return [];
    }
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
};

const rows = sqlite.prepare(selectRowsSql).all();

const grouped = new Map();
for (const row of rows) {
    const sessionId = String(row.session_id);
    const existing = grouped.get(sessionId);
    if (existing) {
        existing.push(row);
    } else {
        grouped.set(sessionId, [row]);
    }
}

let insertedSessions = 0;
let insertedActions = 0;

for (const [sessionId, sessionRows] of grouped.entries()) {
    const first = sessionRows[0];
    const last = sessionRows[sessionRows.length - 1];
    const agentInstanceId = String(first.agent_id || 'agt_unknown_developer_0000');
    const tenantId = deriveTenantId(agentInstanceId);
    const role = decodeRoleFromAgentId(agentInstanceId);
    const taskId = String(first.task_id || 'unknown_task');
    const recordingId = deriveRecordingId(sessionId);

    await prisma.agentSession.upsert({
        where: { id: sessionId },
        create: {
            id: sessionId,
            tenantId,
            agentInstanceId,
            taskId,
            role,
            recordingId,
            recordingUrl: '',
            startedAt: new Date(first.started_at),
            endedAt: new Date(last.completed_at),
            actionCount: sessionRows.length,
            status: sessionRows.some((row) => Number(row.success) !== 1) ? 'failed' : 'completed',
            failureReason: sessionRows.find((row) => Number(row.success) !== 1)?.error_message ?? null,
        },
        update: {
            tenantId,
            agentInstanceId,
            taskId,
            role,
            recordingId,
            endedAt: new Date(last.completed_at),
            actionCount: sessionRows.length,
            status: sessionRows.some((row) => Number(row.success) !== 1) ? 'failed' : 'completed',
            failureReason: sessionRows.find((row) => Number(row.success) !== 1)?.error_message ?? null,
        },
    });
    insertedSessions += 1;

    for (let index = 0; index < sessionRows.length; index += 1) {
        const row = sessionRows[index];
        const actionId = String(row.id);
        const actionType = normalizeActionType(row.action_type);
        await prisma.browserActionEvent.upsert({
            where: { id: actionId },
            create: {
                id: actionId,
                sessionId,
                tenantId,
                agentInstanceId,
                sequence: index,
                actionType,
                targetSelector: String(row.target || ''),
                targetText: String(row.target || ''),
                inputValue: null,
                pageUrl: String(row.target || ''),
                screenshotBeforeId: deriveScreenshotId(actionId, 'before'),
                screenshotAfterId: deriveScreenshotId(actionId, 'after'),
                screenshotBeforeUrl: String(row.screenshot_before_url || ''),
                screenshotAfterUrl: String(row.screenshot_after_url || ''),
                domSnapshotHashBefore: null,
                domSnapshotHashAfter: row.dom_snapshot_hash ? String(row.dom_snapshot_hash) : null,
                networkLog: parseNetworkLog(row.network_requests),
                durationMs: Number(row.duration_ms || 0),
                success: Number(row.success) === 1,
                errorMessage: row.error_message ? String(row.error_message) : null,
                failureClass: Number(row.success) === 1 ? null : 'runtime_exception',
                timestamp: new Date(row.completed_at),
                correctnessAssertion: { verified: Number(row.success) === 1 },
            },
            update: {
                sequence: index,
                actionType,
                targetSelector: String(row.target || ''),
                targetText: String(row.target || ''),
                pageUrl: String(row.target || ''),
                screenshotBeforeUrl: String(row.screenshot_before_url || ''),
                screenshotAfterUrl: String(row.screenshot_after_url || ''),
                domSnapshotHashAfter: row.dom_snapshot_hash ? String(row.dom_snapshot_hash) : null,
                networkLog: parseNetworkLog(row.network_requests),
                durationMs: Number(row.duration_ms || 0),
                success: Number(row.success) === 1,
                errorMessage: row.error_message ? String(row.error_message) : null,
                failureClass: Number(row.success) === 1 ? null : 'runtime_exception',
                timestamp: new Date(row.completed_at),
                correctnessAssertion: { verified: Number(row.success) === 1 },
            },
        });
        insertedActions += 1;
    }
}

sqlite.close();
await prisma.$disconnect();

console.log(JSON.stringify({
    ok: true,
    sqlitePath,
    sessionsBackfilled: insertedSessions,
    actionsBackfilled: insertedActions,
}, null, 2));