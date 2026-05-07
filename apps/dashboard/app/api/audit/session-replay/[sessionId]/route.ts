import { DatabaseSync } from 'node:sqlite';
import { NextResponse } from 'next/server';
import { getInternalSessionAuthHeader } from '../../../../lib/internal-session';

type AuditRow = {
    id: string;
    agent_id: string;
    workspace_id: string;
    task_id: string;
    session_id: string;
    action_type: string;
    target: string;
    payload: string;
    screenshot_before_url: string;
    screenshot_after_url: string;
    diff_image_url: string | null;
    assertions: string | null;
    verified: number;
    risk_level: string;
    started_at: string;
    completed_at: string;
    duration_ms: number;
    success: number;
    error_message: string | null;
};

const DB_PATH = process.env.AGENT_OBSERVABILITY_DB_PATH ?? '.agent-observability.sqlite';

const SELECT_SQL = `
SELECT
  id, agent_id, workspace_id, task_id, session_id, action_type, target, payload,
  screenshot_before_url, screenshot_after_url, diff_image_url, assertions, verified,
  risk_level, started_at, completed_at, duration_ms, success, error_message
FROM agent_action_events
WHERE session_id = ?
ORDER BY started_at ASC;
`;

const parseJson = <T>(value: string | null): T | null => {
    if (!value) {
        return null;
    }
    try {
        return JSON.parse(value) as T;
    } catch {
        return null;
    }
};

export async function GET(
    _request: Request,
    context: { params: Promise<{ sessionId: string }> },
) {
    const authHeader = await getInternalSessionAuthHeader();
    if (!authHeader) {
        return NextResponse.json({ error: 'forbidden', message: 'Internal session required.' }, { status: 403 });
    }

    const { sessionId } = await context.params;
    if (!sessionId || !sessionId.trim()) {
        return NextResponse.json({ error: 'invalid_request', message: 'sessionId is required.' }, { status: 400 });
    }

    try {
        const db = new DatabaseSync(DB_PATH);
        const rows = db.prepare(SELECT_SQL).all(sessionId) as AuditRow[];
        db.close();

        const items = rows.map((row) => ({
            id: row.id,
            agentId: row.agent_id,
            workspaceId: row.workspace_id,
            taskId: row.task_id,
            sessionId: row.session_id,
            actionType: row.action_type,
            target: row.target,
            payload: parseJson<unknown>(row.payload),
            screenshotBeforeUrl: row.screenshot_before_url,
            screenshotAfterUrl: row.screenshot_after_url,
            diffImageUrl: row.diff_image_url,
            assertions: parseJson<unknown[]>(row.assertions) ?? [],
            verified: row.verified === 1,
            riskLevel: row.risk_level,
            startedAt: row.started_at,
            completedAt: row.completed_at,
            durationMs: row.duration_ms,
            success: row.success === 1,
            errorMessage: row.error_message,
        }));

        return NextResponse.json({ sessionId, total: items.length, items });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown database error';
        return NextResponse.json(
            { error: 'audit_read_failed', message },
            { status: 500 },
        );
    }
}
