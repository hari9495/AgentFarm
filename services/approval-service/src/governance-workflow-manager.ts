import { randomUUID } from 'node:crypto';
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

export interface StartGovernanceWorkflowInput {
    templateId: string;
    tenantId: string;
    workspaceId: string;
    botId: string;
    taskId: string;
    actionId: string;
    actionSummary: string;
    actionType: string;
    riskLevel: RiskLevel;
    correlationId: string;
}

export interface RecordGovernanceDecisionInput {
    workflowId: string;
    approverId: string;
    decision: Exclude<ApprovalDecision, 'pending'>;
    reasonCode: GovernanceReasonCode;
    reasonText: string;
    evidenceLinks: string[];
    correlationId: string;
}

const resolveApprovers = (
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
        for (const approverId of rule.approverIds) {
            approvers.add(approverId);
        }
    }
    return Array.from(approvers);
};

export class GovernanceWorkflowManager {
    private templates = new Map<string, GovernanceWorkflowTemplate>();
    private workflows = new Map<string, GovernanceWorkflowInstance>();
    private decisions = new Map<string, GovernanceWorkflowDecisionRecord[]>();

    createTemplate(template: GovernanceWorkflowTemplate): GovernanceWorkflowTemplate {
        this.templates.set(template.id, template);
        return template;
    }

    startWorkflow(input: StartGovernanceWorkflowInput): GovernanceWorkflowInstance {
        const template = this.templates.get(input.templateId);
        if (!template) {
            throw new Error(`Governance template not found: ${input.templateId}`);
        }

        const firstStage = template.stages[0];
        if (!firstStage) {
            throw new Error(`Governance template has no stages: ${input.templateId}`);
        }

        const assignedApproverIds = resolveApprovers(
            template,
            input.tenantId,
            input.workspaceId,
            input.riskLevel,
            input.actionType,
        );

        const nowIso = new Date().toISOString();
        const workflow: GovernanceWorkflowInstance = {
            id: randomUUID(),
            contractVersion: CONTRACT_VERSIONS.GOVERNANCE_WORKFLOW,
            templateId: template.id,
            tenantId: input.tenantId,
            workspaceId: input.workspaceId,
            botId: input.botId,
            taskId: input.taskId,
            actionId: input.actionId,
            actionSummary: input.actionSummary,
            riskLevel: input.riskLevel,
            policyPackVersion: template.policyPackVersion,
            status: 'pending',
            currentStageId: firstStage.stageId,
            currentStageIndex: 0,
            assignedApproverIds,
            correlationId: input.correlationId,
            createdAt: nowIso,
            updatedAt: nowIso,
        };

        this.workflows.set(workflow.id, workflow);
        this.decisions.set(workflow.id, []);
        return workflow;
    }

    recordDecision(input: RecordGovernanceDecisionInput): GovernanceWorkflowInstance {
        const workflow = this.workflows.get(input.workflowId);
        if (!workflow) {
            throw new Error(`Governance workflow not found: ${input.workflowId}`);
        }

        const template = this.templates.get(workflow.templateId);
        if (!template) {
            throw new Error(`Governance template not found: ${workflow.templateId}`);
        }

        const stage = template.stages[workflow.currentStageIndex];
        if (!stage) {
            throw new Error(`Governance workflow stage missing: ${workflow.currentStageIndex}`);
        }

        const current = this.decisions.get(workflow.id) ?? [];
        const decision: GovernanceWorkflowDecisionRecord = {
            id: randomUUID(),
            contractVersion: CONTRACT_VERSIONS.GOVERNANCE_WORKFLOW,
            workflowId: workflow.id,
            stageId: stage.stageId,
            tenantId: workflow.tenantId,
            workspaceId: workflow.workspaceId,
            approverId: input.approverId,
            decision: input.decision,
            reasonCode: input.reasonCode,
            reasonText: input.reasonText,
            evidenceLinks: [...input.evidenceLinks],
            policyPackVersion: workflow.policyPackVersion,
            correlationId: input.correlationId,
            decidedAt: new Date().toISOString(),
        };

        current.push(decision);
        this.decisions.set(workflow.id, current);

        if (input.decision === 'rejected' || input.decision === 'timeout_rejected') {
            workflow.status = input.decision === 'rejected' ? 'rejected' : 'timed_out';
            workflow.updatedAt = decision.decidedAt;
            workflow.completedAt = decision.decidedAt;
            this.workflows.set(workflow.id, workflow);
            return workflow;
        }

        const stageApprovedCount = current.filter(
            (item) => item.stageId === stage.stageId && item.decision === 'approved',
        ).length;

        if (stageApprovedCount >= stage.minApprovers) {
            const nextIndex = workflow.currentStageIndex + 1;
            const nextStage = template.stages[nextIndex];
            if (!nextStage) {
                workflow.status = 'approved';
                workflow.completedAt = decision.decidedAt;
            } else {
                workflow.status = 'in_review';
                workflow.currentStageIndex = nextIndex;
                workflow.currentStageId = nextStage.stageId;
            }
        } else {
            workflow.status = 'in_review';
        }

        workflow.updatedAt = decision.decidedAt;
        this.workflows.set(workflow.id, workflow);
        return workflow;
    }

    getWorkflowDecisions(workflowId: string): GovernanceWorkflowDecisionRecord[] {
        return [...(this.decisions.get(workflowId) ?? [])];
    }

    getDiagnostics(tenantId: string, workspaceId: string, workflowSlaSeconds: number): GovernanceWorkflowDiagnostics {
        const now = Date.now();
        const inScope = Array.from(this.workflows.values()).filter(
            (workflow) => workflow.tenantId === tenantId && workflow.workspaceId === workspaceId,
        );

        const pending = inScope.filter((workflow) => workflow.status === 'pending' || workflow.status === 'in_review');
        const overdue = pending.filter((workflow) => {
            const startedMs = new Date(workflow.createdAt).getTime();
            return now - startedMs > workflowSlaSeconds * 1000;
        });

        const stagePendingCounts = new Map<string, number>();
        for (const workflow of pending) {
            stagePendingCounts.set(workflow.currentStageId, (stagePendingCounts.get(workflow.currentStageId) ?? 0) + 1);
        }

        let bottleneckStageId: string | undefined;
        let bottleneckStagePendingCount = 0;
        for (const [stageId, count] of stagePendingCounts) {
            if (count > bottleneckStagePendingCount) {
                bottleneckStageId = stageId;
                bottleneckStagePendingCount = count;
            }
        }

        const latencies: number[] = [];
        for (const workflow of inScope) {
            const workflowDecisions = this.decisions.get(workflow.id) ?? [];
            for (const decision of workflowDecisions) {
                const startMs = new Date(workflow.createdAt).getTime();
                const endMs = new Date(decision.decidedAt).getTime();
                if (endMs >= startMs) {
                    latencies.push(Math.floor((endMs - startMs) / 1000));
                }
            }
        }

        const avgStageLatencySeconds =
            latencies.length === 0 ? 0 : Math.floor(latencies.reduce((sum, value) => sum + value, 0) / latencies.length);

        return {
            tenantId,
            workspaceId,
            generatedAt: new Date(now).toISOString(),
            workflowSlaSeconds,
            pendingWorkflows: pending.length,
            overdueWorkflows: overdue.length,
            bottleneckStageId,
            bottleneckStagePendingCount,
            avgStageLatencySeconds,
        };
    }
}
