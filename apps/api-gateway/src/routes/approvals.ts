import type { FastifyInstance, FastifyRequest } from 'fastify';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseApprovalPacket } from '../lib/approval-packet.js';

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
};

type DecisionWebhookNotifier = (input: {
    runtimeEndpoint: string;
    runtimeToken: string | null;
    taskId: string;
    decision: DecisionStatus;
    reason: string | null;
    actor: string;
}) => Promise<{
    ok: boolean;
    statusCode: number;
    errorMessage?: string;
}>;

type RegisterApprovalRoutesOptions = {
    getSession: (request: FastifyRequest) => SessionContext | null;
    repo?: ApprovalRepo;
    now?: () => number;
    serviceAuthToken?: string;
    runtimeDecisionToken?: string;
    decisionWebhookNotifier?: DecisionWebhookNotifier;
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
};

type EscalateBody = {
    workspace_id?: string;
};

type DecisionBody = {
    workspace_id?: string;
    decision?: string;
    reason?: string;
};

type DecisionParams = {
    approvalId: string;
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
        return {
            id: created.id,
            tenantId: created.tenantId,
            workspaceId: created.workspaceId,
            botId: created.botId,
            taskId: created.taskId,
            actionId: created.actionId,
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

export const registerApprovalRoutes = async (
    app: FastifyInstance,
    options: RegisterApprovalRoutesOptions,
): Promise<void> => {
    const repo = options.repo ?? defaultRepo;
    const now = options.now ?? (() => Date.now());
    const decisionWebhookNotifier = options.decisionWebhookNotifier ?? defaultDecisionWebhookNotifier;
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

            const approvalPacket = parseApprovalPacket(existing.actionSummary);
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
        });

        const approvalPacket = parseApprovalPacket(created.actionSummary);
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
        }

        return {
            approval_id: approval.id,
            workspace_id: approval.workspaceId,
            decision,
            decision_reason: reason,
            decision_latency_seconds: decisionLatencySeconds,
            decided_at: decidedAt.toISOString(),
            approver_id: session.userId,
            webhook_notified: webhookNotified,
            webhook_status_code: webhookStatusCode,
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
