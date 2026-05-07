import type { FastifyInstance, FastifyRequest } from 'fastify';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { parseApprovalPacket, type ArtifactReference, type EvidenceBundle } from '../lib/approval-packet.js';

const getPrisma = async () => {
    const db = await import('../lib/db.js');
    return db.prisma;
};

type SessionContext = {
    userId: string;
    tenantId: string;
    workspaceIds: string[];
    expiresAt: number;
};

type RiskLevel = 'low' | 'medium' | 'high';
type DecisionStatus = 'approved' | 'rejected' | 'timeout_rejected';

type ApprovalRecord = {
    id: string;
    tenantId: string;
    workspaceId: string;
    botId: string;
    taskId: string;
    actionId: string;
    llmProvider?: string;
    llmModel?: string;
    riskLevel: RiskLevel;
    actionSummary: string;
    requestedBy: string;
    policyPackVersion: string;
    escalationTimeoutSeconds: number;
    decision: 'pending' | 'approved' | 'rejected' | 'timeout_rejected';
    createdAt: Date;
    escalatedAt: Date | null;
};

type ApprovalRepo = {
    findById(input: {
        approvalId: string;
        tenantId: string;
        workspaceId: string;
    }): Promise<ApprovalRecord | null>;
    findByAction(input: {
        tenantId: string;
        workspaceId: string;
        actionId: string;
    }): Promise<ApprovalRecord | null>;
    createPending(input: {
        tenantId: string;
        workspaceId: string;
        botId: string;
        taskId: string;
        actionId: string;
        riskLevel: Exclude<RiskLevel, 'low'>;
        actionSummary: string;
        requestedBy: string;
        policyPackVersion: string;
        escalationTimeoutSeconds: number;
        llmProvider?: string;
        llmModel?: string;
    }): Promise<ApprovalRecord>;
    listEscalationCandidates(input: {
        tenantId: string;
        workspaceId: string;
        asOf: Date;
    }): Promise<ApprovalRecord[]>;
    markEscalated(input: {
        approvalId: string;
        escalatedAt: Date;
    }): Promise<void>;
    setDecision(input: {
        approvalId: string;
        decision: DecisionStatus;
        reason: string | null;
        approverId: string;
        decidedAt: Date;
        decisionLatencySeconds: number;
    }): Promise<void>;
    createAuditEvent(input: {
        tenantId: string;
        workspaceId: string;
        botId: string;
        summary: string;
        correlationId: string;
        severity?: 'info' | 'warn' | 'error';
    }): Promise<void>;
    findRuntimeDecisionEndpoint(input: {
        tenantId: string;
        workspaceId: string;
        botId: string;
    }): Promise<string | null>;
    findActionTypeByActionId(input: {
        tenantId: string;
        workspaceId: string;
        actionId: string;
    }): Promise<string | null>;
};

type DecisionWebhookNotifier = (input: {
    runtimeEndpoint: string;
    runtimeToken: string | null;
    taskId: string;
    decision: DecisionStatus;
    reason: string | null;
    actor: string;
    selectedOptionId: string | null;
}) => Promise<{
    ok: boolean;
    statusCode: number;
    errorMessage?: string;
}>;

type RegisterApprovalRoutesOptions = {
    getSession: (request: FastifyRequest) => SessionContext | null;
    repo?: ApprovalRepo;
    approvalBatcher?: ApprovalBatcher;
    now?: () => number;
    serviceAuthToken?: string;
    runtimeDecisionToken?: string;
    decisionWebhookNotifier?: DecisionWebhookNotifier;
    qualitySignalNotifier?: QualitySignalNotifier;
    evidenceReader?: EvidenceReader;
};

type IntakeBody = {
    tenant_id?: string;
    workspace_id?: string;
    bot_id?: string;
    task_id?: string;
    action_id?: string;
    action_summary?: string;
    risk_level?: string;
    requested_by?: string;
    policy_pack_version?: string;
    escalation_timeout_seconds?: number;
    llm_provider?: string;
    llm_model?: string;
    session_id?: string;
};

type QualitySignalNotifier = (input: {
    runtimeEndpoint: string;
    runtimeToken: string | null;
    provider: string;
    model: string;
    actionType: string;
    signal: 'action_approved' | 'action_rejected' | 'action_escalated';
    reason: string | null;
    taskId: string;
    correlationId: string;
}) => Promise<{
    ok: boolean;
    statusCode: number;
    errorMessage?: string;
}>;

type EscalateBody = {
    workspace_id?: string;
};

type DecisionBody = {
    workspace_id?: string;
    decision?: string;
    reason?: string;
    selected_option_id?: string;
};

type DecisionParams = {
    approvalId: string;
};

type BatchDecision = 'approve_all' | 'reject_all' | 'review_individually';

type BatchAction = {
    taskId: string;
    actionType: string;
    riskLevel: 'medium' | 'high';
    payload: Record<string, unknown>;
};

type BatchRecord = {
    batchId: string;
    taskId: string;
    workspaceId: string;
    tenantId: string;
    actions: BatchAction[];
    totalCount: number;
    status: 'pending' | 'approved_all' | 'rejected_all' | 'partial';
    decision?: BatchDecision;
    decidedBy?: string;
    decidedAt?: string;
    reason?: string;
    createdAt: string;
    updatedAt: string;
};

type BatchIntakeBody = {
    workspace_id?: string;
    task_id?: string;
    actions?: Array<{
        task_id?: string;
        action_type?: string;
        risk_level?: string;
        payload?: Record<string, unknown>;
    }>;
};

type BatchDecisionBody = {
    workspace_id?: string;
    decision?: BatchDecision;
    reason?: string;
};

type BatchParams = {
    batchId: string;
};

type ApprovalBatcher = {
    createBatch(input: {
        tenantId: string;
        workspaceId: string;
        taskId: string;
        actions: BatchAction[];
    }): Promise<BatchRecord>;
    decideBatch(input: {
        batchId: string;
        tenantId: string;
        workspaceId: string;
        decision: BatchDecision;
        actor: string;
        reason: string | null;
    }): Promise<BatchRecord | null>;
    getBatch(input: {
        batchId: string;
        tenantId: string;
        workspaceId: string;
    }): Promise<BatchRecord | null>;
};
type EvidenceParams = {
    approvalId: string;
};

type EvidenceQuery = {
    workspace_id?: string;
    limit?: string;
    offset?: string;
};

type EvidenceExecutionLog = {
    timestamp: string;
    level: 'info' | 'warn' | 'error' | 'debug';
    message: string;
};

type EvidenceQualityGateResult = {
    checkType: string;
    status: 'passed' | 'failed' | 'skipped' | 'not_run';
    details?: string;
    errorMessage?: string;
    executedAt?: string;
    durationMs?: number;
};

type EvidenceRecord = {
    evidenceId: string;
    taskId: string;
    approvalId?: string;
    workspaceId: string;
    actionStatus: string;
    executionLogs: EvidenceExecutionLog[];
    qualityGateResults: EvidenceQualityGateResult[];
    actionOutcome: {
        success: boolean;
        resultSummary?: string;
        errorReason?: string;
        failureClass?: string;
    };
    connectorUsed?: string;
    actorId?: string;
    approvalReason?: string;
};

type EvidenceReader = (input: {
    approvalId: string;
    taskId: string;
    workspaceId: string;
}) => Promise<EvidenceRecord[]>;

const DEFAULT_ESCALATION_TIMEOUT_SECONDS = 3600;
const DEFAULT_EVIDENCE_RECORD_PATH = 'data/evidence-records.ndjson';

const createInMemoryApprovalBatcher = (): ApprovalBatcher => {
    const batches = new Map<string, BatchRecord>();

    return {
        async createBatch(input) {
            const nowIso = new Date().toISOString();
            const record: BatchRecord = {
                batchId: randomUUID(),
                taskId: input.taskId,
                workspaceId: input.workspaceId,
                tenantId: input.tenantId,
                actions: input.actions,
                totalCount: input.actions.length,
                status: 'pending',
                createdAt: nowIso,
                updatedAt: nowIso,
            };
            batches.set(record.batchId, record);
            return record;
        },
        async decideBatch(input) {
            const existing = batches.get(input.batchId);
            if (!existing || existing.tenantId !== input.tenantId || existing.workspaceId !== input.workspaceId) {
                return null;
            }

            const status =
                input.decision === 'approve_all'
                    ? 'approved_all'
                    : input.decision === 'reject_all'
                        ? 'rejected_all'
                        : 'partial';

            const updated: BatchRecord = {
                ...existing,
                decision: input.decision,
                status,
                reason: input.reason ?? undefined,
                decidedBy: input.actor,
                decidedAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            };
            batches.set(updated.batchId, updated);
            return updated;
        },
        async getBatch(input) {
            const existing = batches.get(input.batchId);
            if (!existing || existing.tenantId !== input.tenantId || existing.workspaceId !== input.workspaceId) {
                return null;
            }
            return existing;
        },
    };
};

const resolveEvidenceRecordPath = (env: NodeJS.ProcessEnv, cwd: string = process.cwd()): string => {
    const configured = env.AF_EVIDENCE_RECORD_PATH ?? env.AGENTFARM_EVIDENCE_RECORD_PATH;
    if (!configured || !configured.trim()) {
        return resolve(cwd, DEFAULT_EVIDENCE_RECORD_PATH);
    }
    return resolve(cwd, configured);
};

const readServiceToken = (request: FastifyRequest): string | null => {
    const direct = request.headers['x-approval-intake-token'];
    if (typeof direct === 'string' && direct.trim()) {
        return direct.trim();
    }

    const authHeader = request.headers.authorization;
    if (typeof authHeader === 'string' && authHeader.toLowerCase().startsWith('bearer ')) {
        return authHeader.slice(7).trim();
    }

    return null;
};

const normalizeRiskLevel = (value: string | undefined): RiskLevel | null => {
    if (!value) {
        return null;
    }
    const normalized = value.trim().toLowerCase();
    if (normalized === 'low' || normalized === 'medium' || normalized === 'high') {
        return normalized;
    }
    return null;
};

const normalizeDecision = (value: string | undefined): DecisionStatus | null => {
    if (!value) {
        return null;
    }

    const normalized = value.trim().toLowerCase();
    if (normalized === 'approved' || normalized === 'rejected' || normalized === 'timeout_rejected') {
        return normalized;
    }

    return null;
};

const immutableFieldsMatch = (existing: ApprovalRecord, incoming: {
    botId: string;
    taskId: string;
    riskLevel: Exclude<RiskLevel, 'low'>;
    actionSummary: string;
    requestedBy: string;
    policyPackVersion: string;
    escalationTimeoutSeconds: number;
}): boolean => {
    return existing.botId === incoming.botId
        && existing.taskId === incoming.taskId
        && existing.riskLevel === incoming.riskLevel
        && existing.actionSummary === incoming.actionSummary
        && existing.requestedBy === incoming.requestedBy
        && existing.policyPackVersion === incoming.policyPackVersion
        && existing.escalationTimeoutSeconds === incoming.escalationTimeoutSeconds;
};

const fetchApprovalLlmMetadata = async (
    prisma: Awaited<ReturnType<typeof getPrisma>>,
    approvalId: string,
): Promise<{ llmProvider?: string; llmModel?: string }> => {
    const rows = await prisma.$queryRaw<Array<{ llmProvider: string | null; llmModel: string | null }>>`
        SELECT "llmProvider", "llmModel"
        FROM "Approval"
        WHERE id = ${approvalId}
        LIMIT 1
    `;
    const row = rows[0];

    return {
        llmProvider: row?.llmProvider ?? undefined,
        llmModel: row?.llmModel ?? undefined,
    };
};

const defaultRepo: ApprovalRepo = {
    async findById(input) {
        const prisma = await getPrisma();
        const approval = await prisma.approval.findFirst({
            where: {
                id: input.approvalId,
                tenantId: input.tenantId,
                workspaceId: input.workspaceId,
            },
        });

        if (!approval) {
            return null;
        }

        return {
            id: approval.id,
            tenantId: approval.tenantId,
            workspaceId: approval.workspaceId,
            botId: approval.botId,
            taskId: approval.taskId,
            actionId: approval.actionId,
            ...(await fetchApprovalLlmMetadata(prisma, approval.id)),
            riskLevel: approval.riskLevel as RiskLevel,
            actionSummary: approval.actionSummary,
            requestedBy: approval.requestedBy,
            policyPackVersion: approval.policyPackVersion,
            escalationTimeoutSeconds: approval.escalationTimeoutSeconds,
            decision: approval.decision,
            createdAt: approval.createdAt,
            escalatedAt: approval.escalatedAt,
        };
    },
    async findByAction(input) {
        const prisma = await getPrisma();
        const approval = await prisma.approval.findFirst({
            where: {
                tenantId: input.tenantId,
                workspaceId: input.workspaceId,
                actionId: input.actionId,
            },
            orderBy: { createdAt: 'desc' },
        });
        if (!approval) {
            return null;
        }
        return {
            id: approval.id,
            tenantId: approval.tenantId,
            workspaceId: approval.workspaceId,
            botId: approval.botId,
            taskId: approval.taskId,
            actionId: approval.actionId,
            ...(await fetchApprovalLlmMetadata(prisma, approval.id)),
            riskLevel: approval.riskLevel as RiskLevel,
            actionSummary: approval.actionSummary,
            requestedBy: approval.requestedBy,
            policyPackVersion: approval.policyPackVersion,
            escalationTimeoutSeconds: approval.escalationTimeoutSeconds,
            decision: approval.decision,
            createdAt: approval.createdAt,
            escalatedAt: approval.escalatedAt,
        };
    },
    async createPending(input) {
        const prisma = await getPrisma();
        const created = await prisma.approval.create({
            data: {
                tenantId: input.tenantId,
                workspaceId: input.workspaceId,
                botId: input.botId,
                taskId: input.taskId,
                actionId: input.actionId,
                riskLevel: input.riskLevel,
                actionSummary: input.actionSummary,
                requestedBy: input.requestedBy,
                policyPackVersion: input.policyPackVersion,
                escalationTimeoutSeconds: input.escalationTimeoutSeconds,
                decision: 'pending',
            },
        });
        if (input.llmProvider || input.llmModel) {
            await prisma.$executeRaw`
                UPDATE "Approval"
                SET "llmProvider" = ${input.llmProvider ?? null},
                    "llmModel" = ${input.llmModel ?? null}
                WHERE id = ${created.id}
            `;
        }
        return {
            id: created.id,
            tenantId: created.tenantId,
            workspaceId: created.workspaceId,
            botId: created.botId,
            taskId: created.taskId,
            actionId: created.actionId,
            llmProvider: input.llmProvider,
            llmModel: input.llmModel,
            riskLevel: created.riskLevel as RiskLevel,
            actionSummary: created.actionSummary,
            requestedBy: created.requestedBy,
            policyPackVersion: created.policyPackVersion,
            escalationTimeoutSeconds: created.escalationTimeoutSeconds,
            decision: created.decision,
            createdAt: created.createdAt,
            escalatedAt: created.escalatedAt,
        };
    },
    async listEscalationCandidates(input) {
        const prisma = await getPrisma();
        const approvals = await prisma.approval.findMany({
            where: {
                tenantId: input.tenantId,
                workspaceId: input.workspaceId,
                decision: 'pending',
                escalatedAt: null,
            },
            orderBy: { createdAt: 'asc' },
        });
        return approvals
            .filter((approval: (typeof approvals)[number]) => {
                const timeoutMs = approval.escalationTimeoutSeconds * 1000;
                return approval.createdAt.getTime() + timeoutMs <= input.asOf.getTime();
            })
            .map((approval: (typeof approvals)[number]) => ({
                id: approval.id,
                tenantId: approval.tenantId,
                workspaceId: approval.workspaceId,
                botId: approval.botId,
                taskId: approval.taskId,
                actionId: approval.actionId,
                riskLevel: approval.riskLevel as RiskLevel,
                actionSummary: approval.actionSummary,
                requestedBy: approval.requestedBy,
                policyPackVersion: approval.policyPackVersion,
                escalationTimeoutSeconds: approval.escalationTimeoutSeconds,
                decision: approval.decision,
                createdAt: approval.createdAt,
                escalatedAt: approval.escalatedAt,
            }));
    },
    async markEscalated(input) {
        const prisma = await getPrisma();
        await prisma.approval.update({
            where: { id: input.approvalId },
            data: { escalatedAt: input.escalatedAt },
        });
    },
    async setDecision(input) {
        const prisma = await getPrisma();
        await prisma.approval.update({
            where: { id: input.approvalId },
            data: {
                decision: input.decision,
                decisionReason: input.reason,
                approverId: input.approverId,
                decidedAt: input.decidedAt,
                decisionLatencySeconds: input.decisionLatencySeconds,
            },
        });
    },
    async createAuditEvent(input) {
        const prisma = await getPrisma();
        await prisma.auditEvent.create({
            data: {
                tenantId: input.tenantId,
                workspaceId: input.workspaceId,
                botId: input.botId,
                eventType: 'approval_event',
                severity: (input.severity ?? 'info') as never,
                summary: input.summary,
                sourceSystem: 'approval-service',
                correlationId: input.correlationId,
            },
        });
    },
    async findRuntimeDecisionEndpoint(input) {
        const prisma = await getPrisma();
        const runtime = await prisma.runtimeInstance.findFirst({
            where: {
                tenantId: input.tenantId,
                workspaceId: input.workspaceId,
                botId: input.botId,
                endpoint: {
                    not: null,
                },
            },
            orderBy: {
                updatedAt: 'desc',
            },
        });

        return runtime?.endpoint ?? null;
    },
    async findActionTypeByActionId(input) {
        const prisma = await getPrisma();
        const action = await prisma.actionRecord.findFirst({
            where: {
                id: input.actionId,
                tenantId: input.tenantId,
                workspaceId: input.workspaceId,
            },
            select: {
                actionType: true,
            },
        });

        return action?.actionType ?? null;
    },
};

const defaultDecisionWebhookNotifier: DecisionWebhookNotifier = async (input) => {
    try {
        const url = new URL('/decision', input.runtimeEndpoint).toString();
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                ...(input.runtimeToken ? { 'x-runtime-decision-token': input.runtimeToken } : {}),
            },
            body: JSON.stringify({
                task_id: input.taskId,
                decision: input.decision,
                reason: input.reason,
                actor: input.actor,
                selected_option_id: input.selectedOptionId,
            }),
            signal: AbortSignal.timeout(4_000),
        });

        let errorMessage: string | undefined;
        if (!response.ok) {
            try {
                const body = await response.json() as { message?: string; error?: string };
                errorMessage = body.message ?? body.error;
            } catch {
                errorMessage = undefined;
            }
        }

        return {
            ok: response.ok,
            statusCode: response.status,
            errorMessage,
        };
    } catch (err: unknown) {
        return {
            ok: false,
            statusCode: 0,
            errorMessage: err instanceof Error ? err.message : String(err),
        };
    }
};

const defaultQualitySignalNotifier: QualitySignalNotifier = async (input) => {
    try {
        const url = new URL('/runtime/quality/signals', input.runtimeEndpoint).toString();
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                ...(input.runtimeToken ? { 'x-runtime-decision-token': input.runtimeToken } : {}),
            },
            body: JSON.stringify({
                provider: input.provider,
                model: input.model,
                action_type: input.actionType,
                signal: input.signal,
                weight: 1,
                source: 'user_feedback',
                reason: input.reason,
                task_id: input.taskId,
                correlation_id: input.correlationId,
            }),
            signal: AbortSignal.timeout(4_000),
        });

        let errorMessage: string | undefined;
        if (!response.ok) {
            try {
                const body = await response.json() as { message?: string; error?: string };
                errorMessage = body.message ?? body.error;
            } catch {
                errorMessage = undefined;
            }
        }

        return {
            ok: response.ok,
            statusCode: response.status,
            errorMessage,
        };
    } catch (err: unknown) {
        return {
            ok: false,
            statusCode: 0,
            errorMessage: err instanceof Error ? err.message : String(err),
        };
    }
};

const parseEvidenceRecord = (line: string): EvidenceRecord | null => {
    if (!line.trim()) {
        return null;
    }

    try {
        const parsed = JSON.parse(line) as Partial<EvidenceRecord>;
        if (!parsed || typeof parsed !== 'object') {
            return null;
        }
        if (typeof parsed.evidenceId !== 'string' || typeof parsed.taskId !== 'string') {
            return null;
        }
        if (typeof parsed.workspaceId !== 'string' || typeof parsed.actionStatus !== 'string') {
            return null;
        }
        if (!Array.isArray(parsed.executionLogs) || !Array.isArray(parsed.qualityGateResults)) {
            return null;
        }
        if (!parsed.actionOutcome || typeof parsed.actionOutcome !== 'object') {
            return null;
        }

        return parsed as EvidenceRecord;
    } catch {
        return null;
    }
};

const defaultEvidenceReader: EvidenceReader = async (input) => {
    const evidencePath = resolveEvidenceRecordPath(process.env);
    let fileContent: string;
    try {
        fileContent = await readFile(evidencePath, 'utf8');
    } catch {
        return [];
    }

    const lines = fileContent
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

    const matched: EvidenceRecord[] = [];
    for (let index = lines.length - 1; index >= 0; index -= 1) {
        const record = parseEvidenceRecord(lines[index] ?? '');
        if (!record) {
            continue;
        }
        if (record.workspaceId !== input.workspaceId) {
            continue;
        }
        if (record.approvalId === input.approvalId || record.taskId === input.taskId) {
            matched.push(record);
        }
    }

    return matched;
};

type FetchedActionData = {
    id: string;
    sessionId: string;
    evidenceBundle?: EvidenceBundle;
    domSnapshotHash?: string;
    networkRequests?: Array<{ method: string; url: string; status?: number }>;
};

const fetchActionEvidenceFromRuntime = async (input: {
    runtimeEndpoint: string;
    runtimeToken: string | null;
    workspaceId: string;
    sessionId: string;
    actionId: string;
}): Promise<FetchedActionData | null> => {
    try {
        const url = new URL(
            `/runtime/observability/sessions/${encodeURIComponent(input.sessionId)}/actions`,
            input.runtimeEndpoint,
        ).toString();

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'content-type': 'application/json',
                ...(input.runtimeToken ? { 'x-runtime-decision-token': input.runtimeToken } : {}),
            },
            signal: AbortSignal.timeout(5_000),
        });

        if (!response.ok) {
            return null;
        }

        const data = await response.json() as {
            actions?: Array<{
                id: string;
                sessionId: string;
                evidenceBundle?: EvidenceBundle;
                domSnapshotHash?: string;
                networkRequests?: Array<{ method: string; url: string; status?: number }>;
            }>;
        };

        if (!data.actions || !Array.isArray(data.actions)) {
            return null;
        }

        const action = data.actions.find((a) => a.id === input.actionId);
        return action ?? null;
    } catch {
        return null;
    }
};

export const registerApprovalRoutes = async (
    app: FastifyInstance,
    options: RegisterApprovalRoutesOptions,
): Promise<void> => {
    const repo = options.repo ?? defaultRepo;
    const approvalBatcher = options.approvalBatcher ?? createInMemoryApprovalBatcher();
    const now = options.now ?? (() => Date.now());
    const decisionWebhookNotifier = options.decisionWebhookNotifier ?? defaultDecisionWebhookNotifier;
    const qualitySignalNotifier = options.qualitySignalNotifier ?? defaultQualitySignalNotifier;
    const evidenceReader = options.evidenceReader ?? defaultEvidenceReader;
    const serviceAuthToken =
        options.serviceAuthToken
        ?? process.env.APPROVAL_INTAKE_SHARED_TOKEN
        ?? process.env.AGENTFARM_APPROVAL_INTAKE_SHARED_TOKEN
        ?? null;
    const runtimeDecisionToken =
        options.runtimeDecisionToken
        ?? process.env.RUNTIME_DECISION_SHARED_TOKEN
        ?? process.env.AGENTFARM_RUNTIME_DECISION_SHARED_TOKEN
        ?? serviceAuthToken
        ?? null;

    app.post<{ Body: IntakeBody }>('/v1/approvals/intake', async (request, reply) => {
        const session = options.getSession(request);
        const providedServiceToken = readServiceToken(request);
        const serviceAuthorized = Boolean(
            !session && serviceAuthToken && providedServiceToken && providedServiceToken === serviceAuthToken,
        );

        if (!session && !serviceAuthorized) {
            return reply.code(401).send({
                error: 'unauthorized',
                message: 'A valid authenticated session is required.',
            });
        }

        const tenantId = session?.tenantId ?? request.body?.tenant_id;
        const workspaceId = request.body?.workspace_id;

        if (!tenantId || !workspaceId) {
            return reply.code(400).send({
                error: 'invalid_request',
                message: 'tenant_id and workspace_id are required.',
            });
        }

        if (session && !session.workspaceIds.includes(workspaceId)) {
            return reply.code(403).send({
                error: 'workspace_scope_violation',
                message: 'workspace_id is not in your authenticated session scope.',
            });
        }

        const riskLevel = normalizeRiskLevel(request.body?.risk_level);
        if (!riskLevel) {
            return reply.code(400).send({
                error: 'invalid_risk_level',
                message: 'risk_level must be one of low, medium, high',
            });
        }

        const actionId = request.body?.action_id?.trim();
        const taskId = request.body?.task_id?.trim();
        const botId = request.body?.bot_id?.trim();
        const actionSummary = request.body?.action_summary?.trim();
        const requestedBy = request.body?.requested_by?.trim();
        const policyPackVersion = request.body?.policy_pack_version?.trim();
        const escalationTimeoutSeconds =
            request.body?.escalation_timeout_seconds ?? DEFAULT_ESCALATION_TIMEOUT_SECONDS;

        if (!actionId || !taskId || !botId || !actionSummary || !requestedBy || !policyPackVersion) {
            return reply.code(400).send({
                error: 'invalid_request',
                message:
                    'action_id, task_id, bot_id, action_summary, requested_by, and policy_pack_version are required.',
            });
        }

        if (riskLevel === 'low') {
            return {
                status: 'execute_without_approval',
                route: 'execute',
                risk_level: 'low',
            };
        }

        const existing = await repo.findByAction({
            tenantId,
            workspaceId,
            actionId,
        });

        const immutableInput = {
            botId,
            taskId,
            riskLevel,
            actionSummary,
            requestedBy,
            policyPackVersion,
            escalationTimeoutSeconds,
        };

        if (existing) {
            if (!immutableFieldsMatch(existing, immutableInput)) {
                return reply.code(409).send({
                    error: 'immutable_record_violation',
                    message: 'Approval record is immutable once created.',
                    approval_id: existing.id,
                });
            }

            // Fetch evidence bundle for high-risk actions if session ID is available
            let evidenceBundle: EvidenceBundle | undefined;
            const sessionId = request.body?.session_id?.trim();
            if ((existing.riskLevel === 'high' || existing.riskLevel === 'medium') && sessionId) {
                const runtimeEndpoint = await repo.findRuntimeDecisionEndpoint({
                    tenantId,
                    workspaceId,
                    botId,
                });

                if (runtimeEndpoint) {
                    const actionEvidence = await fetchActionEvidenceFromRuntime({
                        runtimeEndpoint,
                        runtimeToken: runtimeDecisionToken,
                        workspaceId,
                        sessionId,
                        actionId,
                    });

                    if (actionEvidence?.evidenceBundle) {
                        evidenceBundle = actionEvidence.evidenceBundle;
                    }
                }
            }

            const approvalPacket = parseApprovalPacket(existing.actionSummary, evidenceBundle);
            return {
                approval_packet: approvalPacket,
                status: 'already_queued',
                approval_id: existing.id,
                decision: existing.decision,
                escalated_at: existing.escalatedAt?.toISOString() ?? null,
            };
        }

        const created = await repo.createPending({
            tenantId,
            workspaceId,
            botId,
            taskId,
            actionId,
            riskLevel,
            actionSummary,
            requestedBy,
            policyPackVersion,
            escalationTimeoutSeconds,
            llmProvider: request.body?.llm_provider?.trim() || undefined,
            llmModel: request.body?.llm_model?.trim() || undefined,
        });

        // Fetch evidence bundle for high-risk actions if session ID is available
        let evidenceBundle: EvidenceBundle | undefined;
        const sessionId = request.body?.session_id?.trim();
        if ((riskLevel === 'high' || riskLevel === 'medium') && sessionId) {
            const runtimeEndpoint = await repo.findRuntimeDecisionEndpoint({
                tenantId,
                workspaceId,
                botId,
            });

            if (runtimeEndpoint) {
                const actionEvidence = await fetchActionEvidenceFromRuntime({
                    runtimeEndpoint,
                    runtimeToken: runtimeDecisionToken,
                    workspaceId,
                    sessionId,
                    actionId,
                });

                if (actionEvidence?.evidenceBundle) {
                    evidenceBundle = actionEvidence.evidenceBundle;
                }
            }
        }

        const approvalPacket = parseApprovalPacket(created.actionSummary, evidenceBundle);
        return reply.code(201).send({
            approval_packet: approvalPacket,
            status: 'queued_for_approval',
            approval_id: created.id,
            decision: created.decision,
            escalation_timeout_seconds: created.escalationTimeoutSeconds,
            requested_at: created.createdAt.toISOString(),
        });
    });

    app.post<{ Body: EscalateBody }>('/v1/approvals/escalate', async (request, reply) => {
        const session = options.getSession(request);
        if (!session) {
            return reply.code(401).send({
                error: 'unauthorized',
                message: 'A valid authenticated session is required.',
            });
        }

        const workspaceId = request.body?.workspace_id ?? session.workspaceIds[0];
        if (!workspaceId || !session.workspaceIds.includes(workspaceId)) {
            return reply.code(403).send({
                error: 'workspace_scope_violation',
                message: 'workspace_id is not in your authenticated session scope.',
            });
        }

        const asOf = new Date(now());
        const candidates = await repo.listEscalationCandidates({
            tenantId: session.tenantId,
            workspaceId,
            asOf,
        });

        const escalatedAt = new Date(now());
        for (const candidate of candidates) {
            await repo.markEscalated({
                approvalId: candidate.id,
                escalatedAt,
            });

            await repo.createAuditEvent({
                tenantId: candidate.tenantId,
                workspaceId: candidate.workspaceId,
                botId: candidate.botId,
                summary: `Approval ${candidate.id} escalated after ${candidate.escalationTimeoutSeconds}s timeout.`,
                correlationId: `approval_escalate_${candidate.id}_${Math.floor(now())}`,
                severity: 'warn',
            });
        }

        return {
            workspace_id: workspaceId,
            evaluated_at: escalatedAt.toISOString(),
            escalated_count: candidates.length,
            escalated_approval_ids: candidates.map((item) => item.id),
        };
    });

    app.post<{ Params: DecisionParams; Body: DecisionBody }>('/v1/approvals/:approvalId/decision', async (request, reply) => {
        const session = options.getSession(request);
        if (!session) {
            return reply.code(401).send({
                error: 'unauthorized',
                message: 'A valid authenticated session is required.',
            });
        }

        const workspaceId = request.body?.workspace_id ?? session.workspaceIds[0];
        if (!workspaceId || !session.workspaceIds.includes(workspaceId)) {
            return reply.code(403).send({
                error: 'workspace_scope_violation',
                message: 'workspace_id is not in your authenticated session scope.',
            });
        }

        const decision = normalizeDecision(request.body?.decision);
        if (!decision) {
            return reply.code(400).send({
                error: 'invalid_decision',
                message: 'decision must be one of approved, rejected, timeout_rejected',
            });
        }

        const reason = request.body?.reason?.trim() ?? null;
        const selectedOptionId = request.body?.selected_option_id?.trim() ?? null;
        if ((decision === 'rejected' || decision === 'timeout_rejected') && !reason) {
            return reply.code(400).send({
                error: 'decision_reason_required',
                message: 'reason is required for rejected and timeout_rejected decisions.',
            });
        }

        const approval = await repo.findById({
            approvalId: request.params.approvalId,
            tenantId: session.tenantId,
            workspaceId,
        });

        if (!approval) {
            return reply.code(404).send({
                error: 'approval_not_found',
                message: 'Approval record not found in current scope.',
            });
        }

        if (approval.decision !== 'pending') {
            return reply.code(409).send({
                error: 'approval_already_decided',
                message: 'Approval decision is immutable once set.',
                decision: approval.decision,
            });
        }

        const decidedAt = new Date(now());
        const decisionLatencySeconds = Math.max(0, Math.floor((decidedAt.getTime() - approval.createdAt.getTime()) / 1000));

        await repo.setDecision({
            approvalId: approval.id,
            decision,
            reason,
            approverId: session.userId,
            decidedAt,
            decisionLatencySeconds,
        });

        await repo.createAuditEvent({
            tenantId: approval.tenantId,
            workspaceId: approval.workspaceId,
            botId: approval.botId,
            summary: `Approval ${approval.id} decided as ${decision} by ${session.userId}.`,
            correlationId: `approval_decision_${approval.id}_${Math.floor(now())}`,
            severity: decision === 'approved' ? 'info' : 'warn',
        });

        const runtimeEndpoint = await repo.findRuntimeDecisionEndpoint({
            tenantId: approval.tenantId,
            workspaceId: approval.workspaceId,
            botId: approval.botId,
        });

        let webhookNotified = false;
        let webhookStatusCode: number | null = null;

        if (runtimeEndpoint) {
            const webhook = await decisionWebhookNotifier({
                runtimeEndpoint,
                runtimeToken: runtimeDecisionToken,
                taskId: approval.taskId,
                decision,
                reason,
                actor: session.userId,
                selectedOptionId,
            });

            webhookNotified = webhook.ok;
            webhookStatusCode = webhook.statusCode;

            if (!webhook.ok) {
                await repo.createAuditEvent({
                    tenantId: approval.tenantId,
                    workspaceId: approval.workspaceId,
                    botId: approval.botId,
                    summary: `Decision webhook failed for approval ${approval.id} (status ${webhook.statusCode}).`,
                    correlationId: `approval_decision_webhook_${approval.id}_${Math.floor(now())}`,
                    severity: 'warn',
                });
            }

            if (approval.llmProvider && approval.llmModel) {
                const actionType = await repo.findActionTypeByActionId({
                    tenantId: approval.tenantId,
                    workspaceId: approval.workspaceId,
                    actionId: approval.actionId,
                });

                if (actionType) {
                    const qualitySignal = await qualitySignalNotifier({
                        runtimeEndpoint,
                        runtimeToken: runtimeDecisionToken,
                        provider: approval.llmProvider,
                        model: approval.llmModel,
                        actionType,
                        signal: decision === 'approved' ? 'action_approved' : decision === 'rejected' ? 'action_rejected' : 'action_escalated',
                        reason,
                        taskId: approval.taskId,
                        correlationId: `approval_quality_${approval.id}_${Math.floor(now())}`,
                    });

                    if (!qualitySignal.ok) {
                        await repo.createAuditEvent({
                            tenantId: approval.tenantId,
                            workspaceId: approval.workspaceId,
                            botId: approval.botId,
                            summary: `Quality signal webhook failed for approval ${approval.id} (status ${qualitySignal.statusCode}).`,
                            correlationId: `approval_quality_webhook_${approval.id}_${Math.floor(now())}`,
                            severity: 'warn',
                        });
                    }
                }
            }
        }

        return {
            approval_id: approval.id,
            workspace_id: approval.workspaceId,
            decision,
            decision_reason: reason,
            selected_option_id: selectedOptionId,
            decision_latency_seconds: decisionLatencySeconds,
            decided_at: decidedAt.toISOString(),
            approver_id: session.userId,
            webhook_notified: webhookNotified,
            webhook_status_code: webhookStatusCode,
        };
    });

    app.post<{ Body: BatchIntakeBody }>('/v1/approvals/batch/intake', async (request, reply) => {
        const session = options.getSession(request);
        if (!session) {
            return reply.code(401).send({
                error: 'unauthorized',
                message: 'A valid authenticated session is required.',
            });
        }

        const workspaceId = request.body?.workspace_id ?? session.workspaceIds[0];
        if (!workspaceId || !session.workspaceIds.includes(workspaceId)) {
            return reply.code(403).send({
                error: 'workspace_scope_violation',
                message: 'workspace_id is not in your authenticated session scope.',
            });
        }

        const rawActions = request.body?.actions ?? [];
        if (!Array.isArray(rawActions) || rawActions.length === 0) {
            return reply.code(400).send({
                error: 'invalid_request',
                message: 'actions is required and must contain at least one action.',
            });
        }

        const actions: BatchAction[] = [];
        for (const action of rawActions) {
            const taskId = typeof action.task_id === 'string' ? action.task_id.trim() : '';
            const actionType = typeof action.action_type === 'string' ? action.action_type.trim() : '';
            const riskLevel = action.risk_level === 'medium' || action.risk_level === 'high' ? action.risk_level : null;
            if (!taskId || !actionType || !riskLevel) {
                return reply.code(400).send({
                    error: 'invalid_request',
                    message: 'each action requires task_id, action_type, and risk_level (medium/high).',
                });
            }

            actions.push({
                taskId,
                actionType,
                riskLevel,
                payload: typeof action.payload === 'object' && action.payload !== null ? action.payload : {},
            });
        }

        const taskId = request.body?.task_id?.trim() || actions[0]?.taskId || 'batch_task';
        const batch = await approvalBatcher.createBatch({
            tenantId: session.tenantId,
            workspaceId,
            taskId,
            actions,
        });

        await repo.createAuditEvent({
            tenantId: session.tenantId,
            workspaceId,
            botId: 'system:approval-batcher',
            summary: `Approval batch ${batch.batchId} created with ${batch.totalCount} action(s).`,
            correlationId: `approval_batch_create_${batch.batchId}`,
            severity: 'info',
        });

        return reply.code(201).send({ batch });
    });

    app.get<{ Params: BatchParams; Querystring: { workspace_id?: string } }>('/v1/approvals/batch/:batchId', async (request, reply) => {
        const session = options.getSession(request);
        if (!session) {
            return reply.code(401).send({
                error: 'unauthorized',
                message: 'A valid authenticated session is required.',
            });
        }

        const workspaceId = request.query?.workspace_id ?? session.workspaceIds[0];
        if (!workspaceId || !session.workspaceIds.includes(workspaceId)) {
            return reply.code(403).send({
                error: 'workspace_scope_violation',
                message: 'workspace_id is not in your authenticated session scope.',
            });
        }

        const batch = await approvalBatcher.getBatch({
            batchId: request.params.batchId,
            tenantId: session.tenantId,
            workspaceId,
        });
        if (!batch) {
            return reply.code(404).send({
                error: 'batch_not_found',
                message: 'Approval batch not found in current scope.',
            });
        }

        return { batch };
    });

    app.post<{ Params: BatchParams; Body: BatchDecisionBody }>('/v1/approvals/batch/:batchId/decision', async (request, reply) => {
        const session = options.getSession(request);
        if (!session) {
            return reply.code(401).send({
                error: 'unauthorized',
                message: 'A valid authenticated session is required.',
            });
        }

        const workspaceId = request.body?.workspace_id ?? session.workspaceIds[0];
        if (!workspaceId || !session.workspaceIds.includes(workspaceId)) {
            return reply.code(403).send({
                error: 'workspace_scope_violation',
                message: 'workspace_id is not in your authenticated session scope.',
            });
        }

        const decision = request.body?.decision;
        if (decision !== 'approve_all' && decision !== 'reject_all' && decision !== 'review_individually') {
            return reply.code(400).send({
                error: 'invalid_decision',
                message: 'decision must be one of approve_all, reject_all, review_individually.',
            });
        }

        const updated = await approvalBatcher.decideBatch({
            batchId: request.params.batchId,
            tenantId: session.tenantId,
            workspaceId,
            decision,
            actor: session.userId,
            reason: request.body?.reason?.trim() ?? null,
        });

        if (!updated) {
            return reply.code(404).send({
                error: 'batch_not_found',
                message: 'Approval batch not found in current scope.',
            });
        }

        await repo.createAuditEvent({
            tenantId: session.tenantId,
            workspaceId,
            botId: 'system:approval-batcher',
            summary: `Approval batch ${updated.batchId} decided as ${decision} by ${session.userId}.`,
            correlationId: `approval_batch_decision_${updated.batchId}`,
            severity: decision === 'approve_all' ? 'info' : 'warn',
        });

        return {
            batch: updated,
        };
    });

    app.get<{ Params: EvidenceParams; Querystring: EvidenceQuery }>('/v1/approvals/:approvalId/evidence', async (request, reply) => {
        const session = options.getSession(request);
        if (!session) {
            return reply.code(401).send({
                error: 'unauthorized',
                message: 'A valid authenticated session is required.',
            });
        }

        const workspaceId = request.query?.workspace_id ?? session.workspaceIds[0];
        if (!workspaceId || !session.workspaceIds.includes(workspaceId)) {
            return reply.code(403).send({
                error: 'workspace_scope_violation',
                message: 'workspace_id is not in your authenticated session scope.',
            });
        }

        const rawLimit = parseInt(request.query?.limit ?? '20', 10);
        const rawOffset = parseInt(request.query?.offset ?? '0', 10);
        const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 100) : 20;
        const offset = Number.isFinite(rawOffset) && rawOffset >= 0 ? rawOffset : 0;

        const approval = await repo.findById({
            approvalId: request.params.approvalId,
            tenantId: session.tenantId,
            workspaceId,
        });

        if (!approval) {
            return reply.code(404).send({
                error: 'approval_not_found',
                message: 'Approval record not found in current scope.',
            });
        }

        const allRecords = await evidenceReader({
            approvalId: approval.id,
            taskId: approval.taskId,
            workspaceId: approval.workspaceId,
        });

        const total = allRecords.length;
        const page = allRecords.slice(offset, offset + limit);

        return {
            approval_id: approval.id,
            workspace_id: approval.workspaceId,
            total,
            limit,
            offset,
            evidence: page.map((record) => ({
                evidence_id: record.evidenceId,
                status: record.actionStatus,
                execution_logs: record.executionLogs,
                quality_gate_results: record.qualityGateResults,
                action_outcome: {
                    success: record.actionOutcome.success,
                    result_summary: record.actionOutcome.resultSummary ?? null,
                    error_reason: record.actionOutcome.errorReason ?? null,
                },
                connector_used: record.connectorUsed ?? null,
                actor_id: record.actorId ?? null,
                approval_reason: record.approvalReason ?? null,
            })),
        };
    });
};
