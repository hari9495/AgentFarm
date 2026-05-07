import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
    generateActionId,
    generateScreenshotId,
    screenshotPath,
    domSnapshotPath,
} from '@agentfarm/shared-types';
import type {
    BrowserActionAuditEvent,
    SessionAuditRecord,
} from '@agentfarm/shared-types';
import {
    buildRuntimeAuditContext,
    deriveSequenceFromActionId,
    hashDomSnapshot,
    persistBrowserActionAudit,
} from './runtime-audit-integration.js';

export type ObservabilityActionCategory = 'browser' | 'desktop';
export type ObservabilityRiskLevel = 'low' | 'medium' | 'high';

export type ObservabilityActionRequest = {
    tenantId: string;
    agentId: string;
    workspaceId: string;
    taskId: string;
    sessionId: string;
    role?: string;
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
    screenshotBeforeArtifact?: ArtifactReference;
    screenshotAfterArtifact?: ArtifactReference;
    domSnapshotBefore?: string;
    domSnapshotAfter?: string;
    startedAt: Date;
    completedAt: Date;
    durationMs: number;
    success: boolean;
    errorMessage?: string;
    riskLevel: ObservabilityRiskLevel;
    domSnapshotHash?: string;
    networkRequests?: NetworkRequestSummary[];
    evidenceBundle?: EvidenceBundle;
};

export type NetworkRequestSummary = {
    method: string;
    url: string;
    status?: number;
};

export type ArtifactReference = {
    url: string;
    sha256: string;
    sizeBytes: number;
    contentType: string;
    provider: 'azure_blob' | 'inline';
};

export type EvidenceBundle = {
    screenshotBefore: ArtifactReference;
    screenshotAfter: ArtifactReference;
    domCheckpoint: ArtifactReference | null;
    domSnapshotStored: boolean;
};

type CaptureSnapshot = {
    screenshot: string;
    screenshotReference: ArtifactReference;
    domSnapshot?: string;
};

type ActionCaptureAdapter = {
    captureBefore(action: ObservabilityActionRequest, actionId: string): Promise<CaptureSnapshot>;
    captureAfter(action: ObservabilityActionRequest, actionId: string): Promise<CaptureSnapshot>;
};

type ActionEventSink = {
    emit(event: ObservabilityActionEvent): Promise<void>;
};

type InterceptorHooks = {
    capture: ActionCaptureAdapter;
    eventSink: ActionEventSink;
    riskClassifier?: (action: ObservabilityActionRequest) => ObservabilityRiskLevel;
    nextSequence?: (sessionId: string) => number;
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
    error_message TEXT,
    dom_snapshot_hash TEXT,
    network_requests JSON,
    evidence_bundle JSON
);
`;

const ADD_DOM_HASH_COLUMN_SQL = 'ALTER TABLE agent_action_events ADD COLUMN dom_snapshot_hash TEXT;';
const ADD_NETWORK_REQUESTS_COLUMN_SQL = 'ALTER TABLE agent_action_events ADD COLUMN network_requests JSON;';
const ADD_EVIDENCE_BUNDLE_COLUMN_SQL = 'ALTER TABLE agent_action_events ADD COLUMN evidence_bundle JSON;';

const INSERT_SQL = `
INSERT INTO agent_action_events (
  id, agent_id, workspace_id, task_id, session_id, action_type, target, payload,
  screenshot_before_url, screenshot_after_url, diff_image_url,
  dom_snapshot_before, dom_snapshot_after, assertions, verified, risk_level,
    started_at, completed_at, duration_ms, success, error_message,
    dom_snapshot_hash, network_requests, evidence_bundle
)
VALUES (
  ?, ?, ?, ?, ?, ?, ?, ?,
  ?, ?, ?,
  ?, ?, ?, ?, ?,
    ?, ?, ?, ?, ?,
    ?, ?, ?
);
`;

const SELECT_SESSION_SQL = `
SELECT
  id, agent_id, workspace_id, task_id, session_id, action_type, target, payload,
  screenshot_before_url, screenshot_after_url, diff_image_url,
  dom_snapshot_before, dom_snapshot_after, assertions, verified, risk_level,
    started_at, completed_at, duration_ms, success, error_message,
    dom_snapshot_hash, network_requests, evidence_bundle
FROM agent_action_events
WHERE session_id = ?
ORDER BY started_at ASC;
`;

export type ActionAuditRecord = ObservabilityActionEvent & {
    sessionId: string;
    actionType: string;
    verified: boolean;
};

type ArtifactSink = {
    uploadBinary(input: {
        path: string;
        contentType: string;
        bytes: Uint8Array;
    }): Promise<ArtifactReference>;
};

class InlineArtifactSink implements ArtifactSink {
    async uploadBinary(input: {
        path: string;
        contentType: string;
        bytes: Uint8Array;
    }): Promise<ArtifactReference> {
        const base64 = Buffer.from(input.bytes).toString('base64');
        const sha256 = createHash('sha256').update(input.bytes).digest('hex');
        return {
            url: `data:${input.contentType};base64,${base64}`,
            sha256,
            sizeBytes: input.bytes.length,
            contentType: input.contentType,
            provider: 'inline',
        };
    }
}

class AzureBlobArtifactSink implements ArtifactSink {
    private readonly accountUrl: string;
    private readonly container: string;
    private readonly writeSasToken: string;
    private readonly readSasToken: string;

    constructor(input: {
        accountUrl: string;
        container: string;
        writeSasToken: string;
        readSasToken?: string;
    }) {
        this.accountUrl = input.accountUrl.replace(/\/+$/, '');
        this.container = input.container;
        this.writeSasToken = input.writeSasToken.replace(/^\?/, '');
        this.readSasToken = (input.readSasToken ?? input.writeSasToken).replace(/^\?/, '');
    }

    async uploadBinary(input: {
        path: string;
        contentType: string;
        bytes: Uint8Array;
    }): Promise<ArtifactReference> {
        const safePath = input.path.replace(/^\/+/, '');
        const blobUrlBase = `${this.accountUrl}/${this.container}/${safePath}`;
        const putUrl = `${blobUrlBase}?${this.writeSasToken}`;

        const response = await fetch(putUrl, {
            method: 'PUT',
            headers: {
                'x-ms-blob-type': 'BlockBlob',
                'content-type': input.contentType,
            },
            body: Buffer.from(input.bytes),
        });

        if (!response.ok) {
            const reason = await response.text().catch(() => 'blob_upload_failed');
            throw new Error(`blob_upload_failed:${response.status}:${reason.slice(0, 200)}`);
        }

        return {
            url: `${blobUrlBase}?${this.readSasToken}`,
            sha256: createHash('sha256').update(input.bytes).digest('hex'),
            sizeBytes: input.bytes.length,
            contentType: input.contentType,
            provider: 'azure_blob',
        };
    }
}

export class AuditLogWriter {
    private readonly db: DatabaseSync;

    constructor(databasePath: string) {
        this.db = new DatabaseSync(databasePath);
        this.db.exec(CREATE_TABLE_SQL);
        this.applyMigrations();
    }

    private applyMigrations(): void {
        const migrationStatements = [
            ADD_DOM_HASH_COLUMN_SQL,
            ADD_NETWORK_REQUESTS_COLUMN_SQL,
            ADD_EVIDENCE_BUNDLE_COLUMN_SQL,
        ];

        for (const statement of migrationStatements) {
            try {
                this.db.exec(statement);
            } catch {
                // Ignore duplicate-column migration failures for existing DBs.
            }
        }
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
            record.domSnapshotHash ?? null,
            JSON.stringify(record.networkRequests ?? []),
            JSON.stringify(record.evidenceBundle ?? null),
        );
    }

    nextSequence(sessionId: string): number {
        const row = this.db.prepare('SELECT COUNT(1) as count FROM agent_action_events WHERE session_id = ?;').get(sessionId) as { count?: number } | undefined;
        return typeof row?.count === 'number' ? row.count : 0;
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
            dom_snapshot_hash: string | null;
            network_requests: string | null;
            evidence_bundle: string | null;
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
            domSnapshotHash: row.dom_snapshot_hash ?? undefined,
            networkRequests: parseJson<NetworkRequestSummary[]>(row.network_requests),
            evidenceBundle: parseJson<EvidenceBundle>(row.evidence_bundle) ?? undefined,
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
        const sequence = (this.hooks.nextSequence?.(action.sessionId) ?? 0);
        const actionId = generateActionId(action.sessionId, sequence);
        const riskLevel = (this.hooks.riskClassifier ?? classifyObservabilityRisk)(action);
        const before = await this.hooks.capture.captureBefore(action, actionId);

        try {
            const output = await executeAction();
            const after = await this.hooks.capture.captureAfter(action, actionId);
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
                screenshotBeforeArtifact: before.screenshotReference,
                screenshotAfterArtifact: after.screenshotReference,
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
            const after = await this.hooks.capture.captureAfter(action, actionId);
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
                screenshotBeforeArtifact: before.screenshotReference,
                screenshotAfterArtifact: after.screenshotReference,
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
let sharedSink: ArtifactSink | null = null;
let sharedPrismaClient: unknown | null | undefined;

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

const resolveArtifactSink = (): ArtifactSink => {
    if (sharedSink) {
        return sharedSink;
    }

    const accountUrl = process.env['AGENT_OBSERVABILITY_BLOB_ACCOUNT_URL']?.trim() ?? '';
    const container = process.env['AGENT_OBSERVABILITY_BLOB_CONTAINER']?.trim() ?? '';
    const writeSasToken = process.env['AGENT_OBSERVABILITY_BLOB_WRITE_SAS_TOKEN']?.trim() ?? '';
    const readSasToken = process.env['AGENT_OBSERVABILITY_BLOB_READ_SAS_TOKEN']?.trim() ?? '';

    if (accountUrl && container && writeSasToken) {
        sharedSink = new AzureBlobArtifactSink({
            accountUrl,
            container,
            writeSasToken,
            readSasToken: readSasToken || undefined,
        });
        return sharedSink;
    }

    sharedSink = new InlineArtifactSink();
    return sharedSink;
};

const shouldPersistDomCheckpoint = (request: ObservabilityActionRequest): boolean => {
    if (typeof request.payload !== 'object' || request.payload === null) {
        return false;
    }

    const payload = request.payload as Record<string, unknown>;
    return payload['dom_checkpoint'] === true || payload['checkpoint'] === true;
};

const buildDomSnapshot = (action: ObservabilityActionRequest, phase: 'before' | 'after'): string => {
    return JSON.stringify({
        phase,
        action: action.action,
        target: action.target,
        payload: action.payload,
        captured_at: new Date().toISOString(),
    });
};

const buildPlaceholderImage = (action: ObservabilityActionRequest, phase: 'before' | 'after'): Uint8Array => {
    const safeAction = action.action.replace(/[^a-zA-Z0-9 _-]/g, '').slice(0, 80);
    const safeTarget = action.target.replace(/[^a-zA-Z0-9 _\-.:/]/g, '').slice(0, 120);
    const text = `${phase.toUpperCase()} | ${safeAction} | ${safeTarget}`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="660"><rect width="100%" height="100%" fill="#0b1220"/><text x="40" y="90" fill="#93c5fd" font-size="28" font-family="monospace">AgentFarm Observability</text><text x="40" y="150" fill="#e2e8f0" font-size="22" font-family="monospace">${text}</text></svg>`;
    return Buffer.from(svg, 'utf8');
};

const normalizeNetworkRequests = (payload: unknown): NetworkRequestSummary[] => {
    if (typeof payload !== 'object' || payload === null) {
        return [];
    }

    const candidate = payload as Record<string, unknown>;
    const raw = candidate['network_requests'];
    if (!Array.isArray(raw)) {
        return [];
    }

    return raw
        .map((entry): NetworkRequestSummary | null => {
            if (typeof entry !== 'object' || entry === null) {
                return null;
            }
            const record = entry as Record<string, unknown>;
            const method = typeof record['method'] === 'string' ? record['method'].toUpperCase() : null;
            const url = typeof record['url'] === 'string' ? record['url'] : null;
            const status = typeof record['status'] === 'number' && Number.isFinite(record['status'])
                ? Math.trunc(record['status'])
                : undefined;
            if (!method || !url) {
                return null;
            }
            if (typeof status === 'number') {
                return { method, url, status };
            }
            return { method, url };
        })
        .filter((entry): entry is NetworkRequestSummary => entry !== null)
        .slice(0, 50);
};

const buildDomCheckpointPath = (request: ObservabilityActionRequest, actionId: string): string => {
    return domSnapshotPath(request.tenantId, request.sessionId, actionId);
};

const createCaptureAdapter = (sink: ArtifactSink): ActionCaptureAdapter => ({
    async captureBefore(action, actionId) {
        const artifact = await sink.uploadBinary({
            path: screenshotPath(action.tenantId, action.agentId, action.sessionId, generateScreenshotId(actionId, 'before')),
            contentType: 'image/svg+xml',
            bytes: buildPlaceholderImage(action, 'before'),
        });

        return {
            screenshot: artifact.url,
            screenshotReference: artifact,
            domSnapshot: buildDomSnapshot(action, 'before'),
        };
    },
    async captureAfter(action, actionId) {
        const artifact = await sink.uploadBinary({
            path: screenshotPath(action.tenantId, action.agentId, action.sessionId, generateScreenshotId(actionId, 'after')),
            contentType: 'image/svg+xml',
            bytes: buildPlaceholderImage(action, 'after'),
        });

        return {
            screenshot: artifact.url,
            screenshotReference: artifact,
            domSnapshot: buildDomSnapshot(action, 'after'),
        };
    },
});

const getAuditPrismaClient = async (): Promise<unknown | null> => {
    if (sharedPrismaClient !== undefined) {
        return sharedPrismaClient;
    }

    if (!process.env.DATABASE_URL?.trim()) {
        sharedPrismaClient = null;
        return sharedPrismaClient;
    }

    try {
        const prismaModule = await import('@prisma/client');
        const PrismaClientCtor = prismaModule.PrismaClient;
        sharedPrismaClient = new PrismaClientCtor();
        return sharedPrismaClient;
    } catch {
        sharedPrismaClient = null;
        return sharedPrismaClient;
    }
};

export const executeObservedAction = async <T>(
    request: ObservabilityActionRequest,
    executeAction: () => Promise<T>,
): Promise<T> => {
    const writer = getAuditLogWriter();
    const sink = resolveArtifactSink();
    const auditContext = buildRuntimeAuditContext({
        tenantId: request.tenantId,
        role: request.role ?? 'developer',
        taskId: request.taskId,
        workspaceId: request.workspaceId,
        sessionId: request.sessionId,
        agentInstanceId: request.agentId,
        env: process.env,
    });
    const interceptor = new ActionInterceptor({
        capture: createCaptureAdapter(sink),
        nextSequence: (sessionId) => writer.nextSequence(sessionId),
        eventSink: {
            async emit(event) {
                const domSnapshotAfter = event.domSnapshotAfter ?? '';
                const domSnapshotHash = hashDomSnapshot(domSnapshotAfter);
                const domSnapshotHashBefore = hashDomSnapshot(event.domSnapshotBefore);
                const domCheckpointRequested = shouldPersistDomCheckpoint(request);
                const screenshotBeforeId = generateScreenshotId(event.actionId, 'before');
                const screenshotAfterId = generateScreenshotId(event.actionId, 'after');
                const sequence = deriveSequenceFromActionId(event.actionId);

                let domCheckpoint: ArtifactReference | null = null;
                if (domCheckpointRequested && domSnapshotAfter) {
                    domCheckpoint = await sink.uploadBinary({
                        path: buildDomCheckpointPath(request, event.actionId),
                        contentType: 'application/json',
                        bytes: Buffer.from(domSnapshotAfter, 'utf8'),
                    });
                }

                const screenshotBefore = event.screenshotBefore;
                const screenshotAfter = event.screenshotAfter;

                writer.append({
                    ...event,
                    sessionId: request.sessionId,
                    actionType: request.action,
                    verified: event.success,
                    domSnapshotBefore: domCheckpointRequested ? undefined : event.domSnapshotBefore,
                    domSnapshotAfter: domCheckpointRequested ? undefined : event.domSnapshotAfter,
                    domSnapshotHash,
                    networkRequests: normalizeNetworkRequests(request.payload),
                    evidenceBundle: {
                        screenshotBefore: event.screenshotBeforeArtifact ?? {
                            url: screenshotBefore,
                            sha256: createHash('sha256').update(screenshotBefore).digest('hex'),
                            sizeBytes: screenshotBefore.length,
                            contentType: 'image/svg+xml',
                            provider: screenshotBefore.startsWith('http') ? 'azure_blob' : 'inline',
                        },
                        screenshotAfter: event.screenshotAfterArtifact ?? {
                            url: screenshotAfter,
                            sha256: createHash('sha256').update(screenshotAfter).digest('hex'),
                            sizeBytes: screenshotAfter.length,
                            contentType: 'image/svg+xml',
                            provider: screenshotAfter.startsWith('http') ? 'azure_blob' : 'inline',
                        },
                        domCheckpoint,
                        domSnapshotStored: domCheckpointRequested,
                    },
                });

                const prisma = await getAuditPrismaClient();
                if (prisma) {
                    await persistBrowserActionAudit(prisma as never, auditContext, {
                        actionId: event.actionId,
                        sequence,
                        actionType: request.action,
                        targetSelector: request.target,
                        targetText: request.target,
                        inputValue: typeof request.payload === 'object' && request.payload !== null && typeof (request.payload as Record<string, unknown>)['value'] === 'string'
                            ? (request.payload as Record<string, unknown>)['value'] as string
                            : undefined,
                        pageUrl: request.target.startsWith('http') ? request.target : undefined,
                        success: event.success,
                        screenshotBeforeId,
                        screenshotAfterId,
                        screenshotBeforeUrl: screenshotBefore,
                        screenshotAfterUrl: screenshotAfter,
                        networkLog: normalizeNetworkRequests(request.payload),
                        durationMs: event.durationMs,
                        domSnapshotHashBefore,
                        domSnapshotHashAfter: domSnapshotHash,
                        assertions: { verified: event.success },
                        errorMessage: event.errorMessage,
                        failureClass: event.success ? undefined : 'runtime_exception',
                        timestamp: event.completedAt,
                    });
                }
            },
        },
    });

    return interceptor.execute(request, executeAction);
};

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

export const resetObservabilityForTests = (): void => {
    sharedWriter = null;
    sharedSink = null;
    sharedPrismaClient = undefined;
};
