import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export type ObservabilityActionCategory = 'browser' | 'desktop';
export type ObservabilityRiskLevel = 'low' | 'medium' | 'high';

export type ObservabilityActionRequest = {
    agentId: string;
    workspaceId: string;
    taskId: string;
    sessionId: string;
    type: ObservabilityActionCategory;
    action: string;
    target: string;
    payload: unknown;
    riskLevel?: ObservabilityRiskLevel;
};

export type ObservabilityActionEvent = {
    actionId: string;
    agentId: string;
    workspaceId: string;
    taskId: string;
    type: ObservabilityActionCategory;
    action: string;
    target: string;
    payload: unknown;
    screenshotBefore: string;
    screenshotAfter: string;
    domSnapshotBefore?: string;
    domSnapshotAfter?: string;
    startedAt: Date;
    completedAt: Date;
    durationMs: number;
    success: boolean;
    errorMessage?: string;
    riskLevel: ObservabilityRiskLevel;
};

type CaptureSnapshot = {
    screenshot: string;
    domSnapshot?: string;
};

type ActionCaptureAdapter = {
    captureBefore(action: ObservabilityActionRequest): Promise<CaptureSnapshot>;
    captureAfter(action: ObservabilityActionRequest): Promise<CaptureSnapshot>;
};

type ActionEventSink = {
    emit(event: ObservabilityActionEvent): Promise<void>;
};

type InterceptorHooks = {
    capture: ActionCaptureAdapter;
    eventSink: ActionEventSink;
    riskClassifier?: (action: ObservabilityActionRequest) => ObservabilityRiskLevel;
};

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

export type ActionAuditRecord = ObservabilityActionEvent & {
    sessionId: string;
    actionType: string;
    verified: boolean;
};

export class AuditLogWriter {
    private readonly db: DatabaseSync;

    constructor(databasePath: string) {
        this.db = new DatabaseSync(databasePath);
        this.db.exec(CREATE_TABLE_SQL);
    }

    append(record: ActionAuditRecord): void {
        this.db.prepare(INSERT_SQL).run(
            record.actionId,
            record.agentId,
            record.workspaceId,
            record.taskId,
            record.sessionId,
            record.actionType,
            record.target,
            JSON.stringify(record.payload ?? null),
            record.screenshotBefore,
            record.screenshotAfter,
            null,
            record.domSnapshotBefore ?? null,
            record.domSnapshotAfter ?? null,
            JSON.stringify([]),
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
            dom_snapshot_before: string | null;
            dom_snapshot_after: string | null;
            verified: number;
            risk_level: ObservabilityRiskLevel;
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
            actionType: row.action_type,
            type: row.action_type.includes('browser') ? 'browser' : 'desktop',
            action: row.action_type,
            target: row.target,
            payload: parseJson(row.payload),
            screenshotBefore: row.screenshot_before_url,
            screenshotAfter: row.screenshot_after_url,
            domSnapshotBefore: row.dom_snapshot_before ?? undefined,
            domSnapshotAfter: row.dom_snapshot_after ?? undefined,
            verified: row.verified === 1,
            riskLevel: row.risk_level,
            startedAt: new Date(row.started_at),
            completedAt: new Date(row.completed_at),
            durationMs: row.duration_ms,
            success: row.success === 1,
            errorMessage: row.error_message ?? undefined,
        }));
    }
}

export const classifyObservabilityRisk = (action: ObservabilityActionRequest): ObservabilityRiskLevel => {
    const normalized = `${action.action} ${action.target}`.toLowerCase();
    if (/(delete|remove|submit|checkout|purchase|transfer|invite|approve)/.test(normalized)) {
        return 'high';
    }
    if (/(upload|download|share|meeting|launch|browser)/.test(normalized)) {
        return 'medium';
    }
    return action.riskLevel ?? 'low';
};

class ActionInterceptor {
    private readonly hooks: InterceptorHooks;

    constructor(hooks: InterceptorHooks) {
        this.hooks = hooks;
    }

    async execute<T>(action: ObservabilityActionRequest, executeAction: () => Promise<T>): Promise<T> {
        const startedAt = new Date();
        const actionId = randomUUID();
        const riskLevel = (this.hooks.riskClassifier ?? classifyObservabilityRisk)(action);
        const before = await this.hooks.capture.captureBefore(action);

        try {
            const output = await executeAction();
            const after = await this.hooks.capture.captureAfter(action);
            const completedAt = new Date();
            await this.hooks.eventSink.emit({
                actionId,
                agentId: action.agentId,
                workspaceId: action.workspaceId,
                taskId: action.taskId,
                type: action.type,
                action: action.action,
                target: action.target,
                payload: action.payload,
                screenshotBefore: before.screenshot,
                screenshotAfter: after.screenshot,
                domSnapshotBefore: before.domSnapshot,
                domSnapshotAfter: after.domSnapshot,
                startedAt,
                completedAt,
                durationMs: Math.max(0, completedAt.getTime() - startedAt.getTime()),
                success: true,
                riskLevel,
            });
            return output;
        } catch (error) {
            const after = await this.hooks.capture.captureAfter(action);
            const completedAt = new Date();
            await this.hooks.eventSink.emit({
                actionId,
                agentId: action.agentId,
                workspaceId: action.workspaceId,
                taskId: action.taskId,
                type: action.type,
                action: action.action,
                target: action.target,
                payload: action.payload,
                screenshotBefore: before.screenshot,
                screenshotAfter: after.screenshot,
                domSnapshotBefore: before.domSnapshot,
                domSnapshotAfter: after.domSnapshot,
                startedAt,
                completedAt,
                durationMs: Math.max(0, completedAt.getTime() - startedAt.getTime()),
                success: false,
                errorMessage: error instanceof Error ? error.message : String(error),
                riskLevel,
            });
            throw error;
        }
    }
}

let sharedWriter: AuditLogWriter | null = null;

export const resolveObservabilityDbPath = (env: NodeJS.ProcessEnv): string => {
    const raw = env['AGENT_OBSERVABILITY_DB_PATH']?.trim();
    return raw ? resolve(raw) : join(tmpdir(), 'agentfarm-observability.sqlite');
};

export const getAuditLogWriter = (): AuditLogWriter => {
    if (sharedWriter) {
        return sharedWriter;
    }
    const path = resolveObservabilityDbPath(process.env);
    mkdirSync(dirname(path), { recursive: true });
    sharedWriter = new AuditLogWriter(path);
    return sharedWriter;
};

const createSnapshotUri = (
    request: ObservabilityActionRequest,
    phase: 'before' | 'after',
): string => {
    const ts = Date.now();
    const safeSession = request.sessionId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80) || 'session';
    return `local://capture/${safeSession}/${request.action}/${phase}/${ts}`;
};

const createCaptureAdapter = (): ActionCaptureAdapter => ({
    async captureBefore(action) {
        return {
            screenshot: createSnapshotUri(action, 'before'),
            domSnapshot: JSON.stringify({ phase: 'before', action: action.action, target: action.target }),
        };
    },
    async captureAfter(action) {
        return {
            screenshot: createSnapshotUri(action, 'after'),
            domSnapshot: JSON.stringify({ phase: 'after', action: action.action, target: action.target }),
        };
    },
});

export const executeObservedAction = async <T>(
    request: ObservabilityActionRequest,
    executeAction: () => Promise<T>,
): Promise<T> => {
    const writer = getAuditLogWriter();
    const interceptor = new ActionInterceptor({
        capture: createCaptureAdapter(),
        eventSink: {
            async emit(event) {
                writer.append({
                    ...event,
                    sessionId: request.sessionId,
                    actionType: request.action,
                    verified: event.success,
                });
            },
        },
    });

    return interceptor.execute(request, executeAction);
};

const parseJson = (value: string): unknown => {
    try {
        return JSON.parse(value);
    } catch {
        return null;
    }
};
