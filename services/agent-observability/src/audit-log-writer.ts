import { DatabaseSync } from 'node:sqlite';
import type { ActionEvent, RiskLevel } from './action-interceptor.js';
import type { AssertionResult } from './diff-verifier.js';

export interface ActionAuditRecord extends ActionEvent {
    sessionId: string;
    actionType: string;
    assertions?: AssertionResult[];
    verified: boolean;
    diffImageUrl?: string;
}

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS agent_action_events (
  id TEXT PRIMARY KEY,
  agent_id TEXT,
  workspace_id TEXT,
  task_id TEXT,
  session_id TEXT,
  action_type TEXT,
  target TEXT,
  payload JSON,
  screenshot_before_url TEXT,
  screenshot_after_url TEXT,
  diff_image_url TEXT,
  dom_snapshot_before TEXT,
  dom_snapshot_after TEXT,
  assertions JSON,
  verified BOOLEAN,
  risk_level TEXT,
  started_at DATETIME,
  completed_at DATETIME,
  duration_ms INTEGER,
  success BOOLEAN,
  error_message TEXT
);
`;

const INSERT_SQL = `
INSERT INTO agent_action_events (
  id, agent_id, workspace_id, task_id, session_id, action_type, target, payload,
  screenshot_before_url, screenshot_after_url, diff_image_url,
  dom_snapshot_before, dom_snapshot_after, assertions, verified, risk_level,
  started_at, completed_at, duration_ms, success, error_message
)
VALUES (
  ?, ?, ?, ?, ?, ?, ?, ?,
  ?, ?, ?,
  ?, ?, ?, ?, ?,
  ?, ?, ?, ?, ?
);
`;

const SELECT_SESSION_SQL = `
SELECT
  id, agent_id, workspace_id, task_id, session_id, action_type, target, payload,
  screenshot_before_url, screenshot_after_url, diff_image_url,
  dom_snapshot_before, dom_snapshot_after, assertions, verified, risk_level,
  started_at, completed_at, duration_ms, success, error_message
FROM agent_action_events
WHERE session_id = ?
ORDER BY started_at ASC;
`;

const parseJson = <T>(value: string | null): T | undefined => {
    if (!value) {
        return undefined;
    }
    try {
        return JSON.parse(value) as T;
    } catch {
        return undefined;
    }
};

export class AuditLogWriter {
    private readonly db: DatabaseSync;

    constructor(databasePath: string) {
        this.db = new DatabaseSync(databasePath);
        this.db.exec(CREATE_TABLE_SQL);
    }

    append(record: ActionAuditRecord): void {
        const payload = JSON.stringify(record.payload ?? null);
        const assertions = JSON.stringify(record.assertions ?? []);

        this.db.prepare(INSERT_SQL).run(
            record.actionId,
            record.agentId,
            record.workspaceId,
            record.taskId,
            record.sessionId,
            record.actionType,
            record.target,
            payload,
            record.screenshotBefore,
            record.screenshotAfter,
            record.diffImageUrl ?? null,
            record.domSnapshotBefore ?? null,
            record.domSnapshotAfter ?? null,
            assertions,
            record.verified ? 1 : 0,
            record.riskLevel,
            record.startedAt.toISOString(),
            record.completedAt.toISOString(),
            record.durationMs,
            record.success ? 1 : 0,
            record.errorMessage ?? null,
        );
    }

    listSession(sessionId: string): ActionAuditRecord[] {
        const rows = this.db.prepare(SELECT_SESSION_SQL).all(sessionId) as Array<{
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
            dom_snapshot_before: string | null;
            dom_snapshot_after: string | null;
            assertions: string | null;
            verified: number;
            risk_level: RiskLevel;
            started_at: string;
            completed_at: string;
            duration_ms: number;
            success: number;
            error_message: string | null;
        }>;

        return rows.map((row) => ({
            actionId: row.id,
            agentId: row.agent_id,
            workspaceId: row.workspace_id,
            taskId: row.task_id,
            sessionId: row.session_id,
            type: 'browser',
            action: row.action_type,
            actionType: row.action_type,
            target: row.target,
            payload: parseJson<unknown>(row.payload),
            screenshotBefore: row.screenshot_before_url,
            screenshotAfter: row.screenshot_after_url,
            diffImageUrl: row.diff_image_url ?? undefined,
            domSnapshotBefore: row.dom_snapshot_before ?? undefined,
            domSnapshotAfter: row.dom_snapshot_after ?? undefined,
            assertions: parseJson<AssertionResult[]>(row.assertions),
            verified: row.verified === 1,
            riskLevel: row.risk_level,
            startedAt: new Date(row.started_at),
            completedAt: new Date(row.completed_at),
            durationMs: row.duration_ms,
            success: row.success === 1,
            errorMessage: row.error_message ?? undefined,
        }));
    }

    close(): void {
        this.db.close();
    }
}
