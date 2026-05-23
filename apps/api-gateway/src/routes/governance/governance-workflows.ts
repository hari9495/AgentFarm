import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
    CONTRACT_VERSIONS,
    type ApprovalDecision,
    type GovernanceReasonCode,
    type GovernanceWorkflowDecisionRecord,
    type GovernanceWorkflowDiagnostics,
    type GovernanceWorkflowInstance,
    type GovernanceWorkflowTemplate,
    type RiskLevel,
} from '@agentfarm/shared-types';
import { randomUUID } from 'node:crypto';

type SessionContext = {
    userId: string;
    tenantId: string;
    workspaceIds: string[];
    expiresAt: number;
};

interface GovernanceStore {
    templates: Map<string, GovernanceWorkflowTemplate>;
    workflows: Map<string, GovernanceWorkflowInstance>;
    decisions: Map<string, GovernanceWorkflowDecisionRecord[]>;
}

const createStore = (): GovernanceStore => ({
    templates: new Map(),
    workflows: new Map(),
    decisions: new Map(),
});

const normalizeRiskLevel = (value: unknown): RiskLevel | null => {
    if (typeof value !== 'string') return null;
    const normalized = value.trim().toLowerCase();
    if (normalized === 'low' || normalized === 'medium' || normalized === 'high') {
        return normalized;
    }
    return null;
};

const normalizeDecision = (value: unknown): Exclude<ApprovalDecision, 'pending'> | null => {
    if (typeof value !== 'string') return null;
    const normalized = value.trim().toLowerCase();
    if (normalized === 'approved' || normalized === 'rejected' || normalized === 'timeout_rejected') {
        return normalized;
    }
    return null;
};

const normalizeReasonCode = (value: unknown): GovernanceReasonCode | null => {
    if (typeof value !== 'string') return null;
    const normalized = value.trim().toLowerCase();
    if (
        normalized === 'policy_violation'
        || normalized === 'insufficient_evidence'
        || normalized === 'manual_override'
        || normalized === 'risk_threshold_exceeded'
        || normalized === 'sla_timeout'
        || normalized === 'approved_with_controls'
    ) {
        return normalized;
    }
    return null;
};

const resolveApproverIds = (
    template: GovernanceWorkflowTemplate,
    tenantId: string,
    workspaceId: string,
    riskLevel: RiskLevel,
    actionType: string,
): string[] => {
    const approvers = new Set<string>();
    for (const rule of template.routingRules) {
        if (rule.tenantId && rule.tenantId !== tenantId) continue;
        if (rule.workspaceId && rule.workspaceId !== workspaceId) continue;
        if (rule.riskLevel && rule.riskLevel !== riskLevel) continue;
        if (rule.actionTypePrefix && !actionType.startsWith(rule.actionTypePrefix)) continue;
        for (const approverId of rule.approverIds) approvers.add(approverId);
    }
    return Array.from(approvers);
};

type RegisterGovernanceWorkflowRoutesOptions = {
    getSession: (request: FastifyRequest) => SessionContext | null;
    now?: () => number;
    store?: GovernanceStore;
    workflowSlaSeconds?: number;
};

export const registerGovernanceWorkflowRoutes = async (
    app: FastifyInstance,
    options: RegisterGovernanceWorkflowRoutesOptions,
): Promise<void> => {
    const store = options.store ?? createStore();
    const now = options.now ?? (() => Date.now());
    const workflowSlaSeconds = options.workflowSlaSeconds ?? 300;

    // ── GET /v1/governance/workflows/templates — list all templates for tenant
    app.get('/v1/governance/workflows/templates', async (request, reply) => {
        const session = options.getSession(request);
        if (!session) {
            return reply.code(401).send({ error: 'unauthorized', message: 'A valid authenticated session is required.' });
        }
        const templates = Array.from(store.templates.values()).filter(
            (t) => t.tenantId === session.tenantId,
        );
        return reply.code(200).send({ templates, total: templates.length });
    });

    app.post('/v1/governance/workflows/templates', async (request, reply) => {
        const session = options.getSession(request);
        if (!session) {
            return reply.code(401).send({ error: 'unauthorized', message: 'A valid authenticated session is required.' });
        }

        const body = (request.body ?? {}) as Record<string, unknown>;
        const templateName = typeof body.template_name === 'string' ? body.template_name.trim() : '';
        const policyPackVersion = typeof body.policy_pack_version === 'string' ? body.policy_pack_version.trim() : '';
        const stages = Array.isArray(body.stages) ? body.stages : [];
        const routingRules = Array.isArray(body.routing_rules) ? body.routing_rules : [];

        if (!templateName || !policyPackVersion || stages.length === 0 || routingRules.length === 0) {
            return reply.code(400).send({
                error: 'invalid_request',
                message: 'template_name, policy_pack_version, stages, and routing_rules are required.',
            });
        }

        const workspaceId = typeof body.workspace_id === 'string' ? body.workspace_id.trim() : undefined;
        if (workspaceId && !session.workspaceIds.includes(workspaceId)) {
            return reply.code(403).send({
                error: 'workspace_scope_violation',
                message: 'workspace_id is not in your authenticated session scope.',
            });
        }

        const nowIso = new Date(now()).toISOString();
        const template: GovernanceWorkflowTemplate = {
            id: randomUUID(),
            contractVersion: CONTRACT_VERSIONS.GOVERNANCE_WORKFLOW,
            tenantId: session.tenantId,
            workspaceId,
            templateName,
            policyPackVersion,
            stages: stages.map((item, index) => {
                const row = item as Record<string, unknown>;
                return {
                    stageId: typeof row.stage_id === 'string' ? row.stage_id : `stage-${index + 1}`,
                    stageName: typeof row.stage_name === 'string' ? row.stage_name : `Stage ${index + 1}`,
                    minApprovers: typeof row.min_approvers === 'number' ? row.min_approvers : 1,
                    escalationTimeoutSeconds: typeof row.escalation_timeout_seconds === 'number' ? row.escalation_timeout_seconds : 300,
                };
            }),
            routingRules: routingRules.map((item, index) => {
                const row = item as Record<string, unknown>;
                return {
                    id: typeof row.id === 'string' ? row.id : `rule-${index + 1}`,
                    riskLevel: normalizeRiskLevel(row.risk_level) ?? undefined,
                    actionTypePrefix: typeof row.action_type_prefix === 'string' ? row.action_type_prefix : undefined,
                    tenantId: typeof row.tenant_id === 'string' ? row.tenant_id : undefined,
                    workspaceId: typeof row.workspace_id === 'string' ? row.workspace_id : undefined,
                    approverIds: Array.isArray(row.approver_ids)
                        ? row.approver_ids.filter((entry): entry is string => typeof entry === 'string')
                        : [],
                };
            }),
            createdBy: session.userId,
            correlationId: `governance_template_${Math.floor(now())}`,
            createdAt: nowIso,
            updatedAt: nowIso,
        };

        store.templates.set(template.id, template);

        return reply.code(201).send({
            template_id: template.id,
            template_name: template.templateName,
            policy_pack_version: template.policyPackVersion,
            stage_count: template.stages.length,
        });
    });

    app.post('/v1/governance/workflows/start', async (request, reply) => {
        const session = options.getSession(request);
        if (!session) {
            return reply.code(401).send({ error: 'unauthorized', message: 'A valid authenticated session is required.' });
        }

        const body = (request.body ?? {}) as Record<string, unknown>;
        const templateId = typeof body.template_id === 'string' ? body.template_id.trim() : '';
        const workspaceId = typeof body.workspace_id === 'string' ? body.workspace_id.trim() : '';
        const botId = typeof body.bot_id === 'string' ? body.bot_id.trim() : '';
        const taskId = typeof body.task_id === 'string' ? body.task_id.trim() : '';
        const actionId = typeof body.action_id === 'string' ? body.action_id.trim() : '';
        const actionSummary = typeof body.action_summary === 'string' ? body.action_summary.trim() : '';
        const actionType = typeof body.action_type === 'string' ? body.action_type.trim() : '';
        const riskLevel = normalizeRiskLevel(body.risk_level);

        if (!templateId || !workspaceId || !botId || !taskId || !actionId || !actionSummary || !actionType || !riskLevel) {
            return reply.code(400).send({
                error: 'invalid_request',
                message: 'template_id, workspace_id, bot_id, task_id, action_id, action_summary, action_type, and risk_level are required.',
            });
        }

        if (!session.workspaceIds.includes(workspaceId)) {
            return reply.code(403).send({ error: 'workspace_scope_violation', message: 'workspace_id is not in your authenticated session scope.' });
        }

        const template = store.templates.get(templateId);
        if (!template || template.tenantId !== session.tenantId) {
            return reply.code(404).send({ error: 'template_not_found', message: 'Governance template not found for tenant.' });
        }

        const firstStage = template.stages[0];
        if (!firstStage) {
            return reply.code(409).send({ error: 'invalid_template', message: 'Template has no review stages configured.' });
        }

        const assignedApproverIds = resolveApproverIds(template, session.tenantId, workspaceId, riskLevel, actionType);
        const nowIso = new Date(now()).toISOString();

        const workflow: GovernanceWorkflowInstance = {
            id: randomUUID(),
            contractVersion: CONTRACT_VERSIONS.GOVERNANCE_WORKFLOW,
            templateId,
            tenantId: session.tenantId,
            workspaceId,
            botId,
            taskId,
            actionId,
            actionSummary,
            riskLevel,
            policyPackVersion: template.policyPackVersion,
            status: 'pending',
            currentStageId: firstStage.stageId,
            currentStageIndex: 0,
            assignedApproverIds,
            correlationId: `governance_workflow_${Math.floor(now())}`,
            createdAt: nowIso,
            updatedAt: nowIso,
        };

        store.workflows.set(workflow.id, workflow);
        store.decisions.set(workflow.id, []);

        return reply.code(201).send({
            workflow_id: workflow.id,
            template_id: workflow.templateId,
            status: workflow.status,
            current_stage_id: workflow.currentStageId,
            assigned_approver_ids: workflow.assignedApproverIds,
            policy_pack_version: workflow.policyPackVersion,
        });
    });

    app.post('/v1/governance/workflows/:workflowId/decision', async (request, reply) => {
        const session = options.getSession(request);
        if (!session) {
            return reply.code(401).send({ error: 'unauthorized', message: 'A valid authenticated session is required.' });
        }

        const params = request.params as { workflowId: string };
        const workflow = store.workflows.get(params.workflowId);
        if (!workflow || workflow.tenantId !== session.tenantId) {
            return reply.code(404).send({ error: 'workflow_not_found', message: 'Governance workflow not found.' });
        }

        if (!session.workspaceIds.includes(workflow.workspaceId)) {
            return reply.code(403).send({ error: 'workspace_scope_violation', message: 'workspace_id is not in your authenticated session scope.' });
        }

        const body = (request.body ?? {}) as Record<string, unknown>;
        const decision = normalizeDecision(body.decision);
        const reasonCode = normalizeReasonCode(body.reason_code);
        const reasonText = typeof body.reason_text === 'string' ? body.reason_text.trim() : '';
        const evidenceLinks = Array.isArray(body.evidence_links)
            ? body.evidence_links.filter((entry): entry is string => typeof entry === 'string')
            : [];

        if (!decision || !reasonCode || !reasonText || evidenceLinks.length === 0) {
            return reply.code(400).send({
                error: 'invalid_request',
                message: 'decision, reason_code, reason_text, and evidence_links are required.',
            });
        }

        const template = store.templates.get(workflow.templateId);
        if (!template) {
            return reply.code(404).send({ error: 'template_not_found', message: 'Workflow template was not found.' });
        }

        const stage = template.stages[workflow.currentStageIndex];
        if (!stage) {
            return reply.code(409).send({ error: 'workflow_state_invalid', message: 'Current workflow stage is invalid.' });
        }

        const nowIso = new Date(now()).toISOString();
        const decisionRecord: GovernanceWorkflowDecisionRecord = {
            id: randomUUID(),
            contractVersion: CONTRACT_VERSIONS.GOVERNANCE_WORKFLOW,
            workflowId: workflow.id,
            stageId: stage.stageId,
            tenantId: workflow.tenantId,
            workspaceId: workflow.workspaceId,
            approverId: session.userId,
            decision,
            reasonCode,
            reasonText,
            evidenceLinks: [...evidenceLinks],
            policyPackVersion: workflow.policyPackVersion,
            correlationId: `governance_decision_${Math.floor(now())}`,
            decidedAt: nowIso,
        };

        const decisions = store.decisions.get(workflow.id) ?? [];
        decisions.push(decisionRecord);
        store.decisions.set(workflow.id, decisions);

        if (decision === 'rejected' || decision === 'timeout_rejected') {
            workflow.status = decision === 'rejected' ? 'rejected' : 'timed_out';
            workflow.updatedAt = nowIso;
            workflow.completedAt = nowIso;
            store.workflows.set(workflow.id, workflow);
            return {
                workflow_id: workflow.id,
                status: workflow.status,
                current_stage_id: workflow.currentStageId,
                policy_pack_version: workflow.policyPackVersion,
                reason_code: reasonCode,
                evidence_links: decisionRecord.evidenceLinks,
            };
        }

        const approvalsForStage = decisions.filter((item) => item.stageId === stage.stageId && item.decision === 'approved').length;
        if (approvalsForStage >= stage.minApprovers) {
            const nextIndex = workflow.currentStageIndex + 1;
            const nextStage = template.stages[nextIndex];
            if (nextStage) {
                workflow.currentStageIndex = nextIndex;
                workflow.currentStageId = nextStage.stageId;
                workflow.status = 'in_review';
            } else {
                workflow.status = 'approved';
                workflow.completedAt = nowIso;
            }
        } else {
            workflow.status = 'in_review';
        }

        workflow.updatedAt = nowIso;
        store.workflows.set(workflow.id, workflow);

        return {
            workflow_id: workflow.id,
            status: workflow.status,
            current_stage_id: workflow.currentStageId,
            policy_pack_version: workflow.policyPackVersion,
            reason_code: reasonCode,
            evidence_links: decisionRecord.evidenceLinks,
        };
    });

    app.get('/v1/governance/workflows/diagnostics', async (request, reply) => {
        const session = options.getSession(request);
        if (!session) {
            return reply.code(401).send({ error: 'unauthorized', message: 'A valid authenticated session is required.' });
        }

        const query = request.query as { workspace_id?: string };
        const workspaceId = query.workspace_id?.trim() ?? session.workspaceIds[0];

        if (!workspaceId || !session.workspaceIds.includes(workspaceId)) {
            return reply.code(403).send({ error: 'workspace_scope_violation', message: 'workspace_id is not in your authenticated session scope.' });
        }

        const inScope = Array.from(store.workflows.values()).filter(
            (workflow) => workflow.tenantId === session.tenantId && workflow.workspaceId === workspaceId,
        );

        const pending = inScope.filter((workflow) => workflow.status === 'pending' || workflow.status === 'in_review');
        const overdue = pending.filter((workflow) => now() - new Date(workflow.createdAt).getTime() > workflowSlaSeconds * 1000);

        const stageCounts = new Map<string, number>();
        for (const workflow of pending) {
            stageCounts.set(workflow.currentStageId, (stageCounts.get(workflow.currentStageId) ?? 0) + 1);
        }

        let bottleneckStageId: string | undefined;
        let bottleneckStagePendingCount = 0;
        for (const [stageId, count] of stageCounts) {
            if (count > bottleneckStagePendingCount) {
                bottleneckStageId = stageId;
                bottleneckStagePendingCount = count;
            }
        }

        const latencies: number[] = [];
        for (const workflow of inScope) {
            const decisions = store.decisions.get(workflow.id) ?? [];
            for (const decision of decisions) {
                const elapsed = new Date(decision.decidedAt).getTime() - new Date(workflow.createdAt).getTime();
                if (elapsed >= 0) {
                    latencies.push(Math.floor(elapsed / 1000));
                }
            }
        }

        const avgStageLatencySeconds =
            latencies.length === 0 ? 0 : Math.floor(latencies.reduce((sum, value) => sum + value, 0) / latencies.length);

        const diagnostics: GovernanceWorkflowDiagnostics = {
            tenantId: session.tenantId,
            workspaceId,
            generatedAt: new Date(now()).toISOString(),
            workflowSlaSeconds,
            pendingWorkflows: pending.length,
            overdueWorkflows: overdue.length,
            bottleneckStageId,
            bottleneckStagePendingCount,
            avgStageLatencySeconds,
        };

        return diagnostics;
    });

    app.get('/v1/governance/workflows', async (request, reply) => {
        const session = options.getSession(request);
        if (!session) {
            return reply.code(401).send({ error: 'unauthorized', message: 'A valid authenticated session is required.' });
        }

        const query = request.query as { workspace_id?: string };
        const workspaceIdFilter = query.workspace_id?.trim();

        const workflows = Array.from(store.workflows.values()).filter(
            (wf) =>
                wf.tenantId === session.tenantId &&
                (!workspaceIdFilter || wf.workspaceId === workspaceIdFilter),
        );

        return reply.code(200).send({ workflows, total: workflows.length });
    });

    app.get('/v1/governance/workflows/:workflowId', async (request, reply) => {
        const session = options.getSession(request);
        if (!session) {
            return reply.code(401).send({ error: 'unauthorized', message: 'A valid authenticated session is required.' });
        }

        const params = request.params as { workflowId: string };
        const wf = store.workflows.get(params.workflowId);
        if (!wf) {
            return reply.code(404).send({ error: 'not_found', message: 'Governance workflow not found.' });
        }

        if (wf.tenantId !== session.tenantId) {
            return reply.code(403).send({ error: 'forbidden', message: 'Access denied.' });
        }

        const decisions = store.decisions.get(params.workflowId) ?? [];
        return reply.code(200).send({ workflow: wf, decisions });
    });
};
