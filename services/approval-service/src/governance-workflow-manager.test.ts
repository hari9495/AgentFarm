import test from 'node:test';
import assert from 'node:assert/strict';
import { CONTRACT_VERSIONS, type GovernanceWorkflowTemplate } from '@agentfarm/shared-types';
import { GovernanceWorkflowManager } from './governance-workflow-manager.js';

const makeTemplate = (): GovernanceWorkflowTemplate => ({
    id: 'tpl-governance',
    contractVersion: CONTRACT_VERSIONS.GOVERNANCE_WORKFLOW,
    tenantId: 'tenant-1',
    workspaceId: 'ws-1',
    templateName: 'org-governance-default',
    policyPackVersion: 'policy-v3',
    stages: [
        {
            stageId: 'stage-1',
            stageName: 'Team Lead Review',
            minApprovers: 2,
            escalationTimeoutSeconds: 180,
        },
        {
            stageId: 'stage-2',
            stageName: 'Security Review',
            minApprovers: 1,
            escalationTimeoutSeconds: 300,
        },
    ],
    routingRules: [
        {
            id: 'risk-high',
            riskLevel: 'high',
            approverIds: ['lead-1', 'lead-2', 'sec-1'],
        },
    ],
    createdBy: 'admin-1',
    correlationId: 'corr-template',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
});

test('C1 manager supports multi-approver chain progression', () => {
    const manager = new GovernanceWorkflowManager();
    manager.createTemplate(makeTemplate());

    const workflow = manager.startWorkflow({
        templateId: 'tpl-governance',
        tenantId: 'tenant-1',
        workspaceId: 'ws-1',
        botId: 'bot-1',
        taskId: 'task-1',
        actionId: 'action-1',
        actionSummary: 'Deploy production release',
        actionType: 'deploy.release',
        riskLevel: 'high',
        correlationId: 'corr-start',
    });

    assert.equal(workflow.currentStageId, 'stage-1');

    const afterFirstDecision = manager.recordDecision({
        workflowId: workflow.id,
        approverId: 'lead-1',
        decision: 'approved',
        reasonCode: 'approved_with_controls',
        reasonText: 'Approved with standard release controls.',
        evidenceLinks: ['https://evidence.local/change-1'],
        correlationId: 'corr-dec-1',
    });

    assert.equal(afterFirstDecision.currentStageId, 'stage-1');
    assert.equal(afterFirstDecision.status, 'in_review');

    const afterSecondDecision = manager.recordDecision({
        workflowId: workflow.id,
        approverId: 'lead-2',
        decision: 'approved',
        reasonCode: 'approved_with_controls',
        reasonText: 'Second approver confirmed.',
        evidenceLinks: ['https://evidence.local/change-2'],
        correlationId: 'corr-dec-2',
    });

    assert.equal(afterSecondDecision.currentStageId, 'stage-2');
    assert.equal(afterSecondDecision.status, 'in_review');
});

test('C1 manager decision records include policy version and immutable evidence links', () => {
    const manager = new GovernanceWorkflowManager();
    manager.createTemplate(makeTemplate());

    const workflow = manager.startWorkflow({
        templateId: 'tpl-governance',
        tenantId: 'tenant-1',
        workspaceId: 'ws-1',
        botId: 'bot-2',
        taskId: 'task-2',
        actionId: 'action-2',
        actionSummary: 'Modify RBAC policy',
        actionType: 'rbac.modify',
        riskLevel: 'high',
        correlationId: 'corr-start-2',
    });

    manager.recordDecision({
        workflowId: workflow.id,
        approverId: 'lead-1',
        decision: 'rejected',
        reasonCode: 'policy_violation',
        reasonText: 'Violates least privilege baseline.',
        evidenceLinks: ['https://evidence.local/rbac-review'],
        correlationId: 'corr-dec-3',
    });

    const decisions = manager.getWorkflowDecisions(workflow.id);
    assert.equal(decisions.length, 1);
    assert.equal(decisions[0]?.policyPackVersion, 'policy-v3');
    assert.equal(decisions[0]?.reasonCode, 'policy_violation');
    assert.deepEqual(decisions[0]?.evidenceLinks, ['https://evidence.local/rbac-review']);
});

test('C1 manager diagnostics report workflow SLA and bottleneck stage', () => {
    const manager = new GovernanceWorkflowManager();
    manager.createTemplate(makeTemplate());

    manager.startWorkflow({
        templateId: 'tpl-governance',
        tenantId: 'tenant-1',
        workspaceId: 'ws-1',
        botId: 'bot-a',
        taskId: 'task-a',
        actionId: 'action-a',
        actionSummary: 'High risk action A',
        actionType: 'deploy.release',
        riskLevel: 'high',
        correlationId: 'corr-a',
    });

    manager.startWorkflow({
        templateId: 'tpl-governance',
        tenantId: 'tenant-1',
        workspaceId: 'ws-1',
        botId: 'bot-b',
        taskId: 'task-b',
        actionId: 'action-b',
        actionSummary: 'High risk action B',
        actionType: 'deploy.release',
        riskLevel: 'high',
        correlationId: 'corr-b',
    });

    const diagnostics = manager.getDiagnostics('tenant-1', 'ws-1', 1);

    assert.equal(diagnostics.pendingWorkflows, 2);
    assert.equal(diagnostics.bottleneckStageId, 'stage-1');
    assert.equal(diagnostics.bottleneckStagePendingCount, 2);
    assert.ok(diagnostics.generatedAt.length > 0);
});
