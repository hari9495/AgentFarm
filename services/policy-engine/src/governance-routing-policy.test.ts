import test from 'node:test';
import assert from 'node:assert/strict';
import { CONTRACT_VERSIONS, type GovernanceWorkflowTemplate } from '@agentfarm/shared-types';
import { resolveApproverIds } from './governance-routing-policy.js';

const template: GovernanceWorkflowTemplate = {
    id: 'tpl-1',
    contractVersion: CONTRACT_VERSIONS.GOVERNANCE_WORKFLOW,
    tenantId: 'tenant-1',
    workspaceId: 'ws-1',
    templateName: 'default-governance',
    policyPackVersion: 'policy-v2',
    stages: [
        {
            stageId: 'stage-primary',
            stageName: 'Primary Review',
            minApprovers: 2,
            escalationTimeoutSeconds: 300,
        },
    ],
    routingRules: [
        {
            id: 'rule-risk-high',
            riskLevel: 'high',
            approverIds: ['sec-1', 'sec-2'],
        },
        {
            id: 'rule-action-release',
            actionTypePrefix: 'deploy',
            approverIds: ['ops-1'],
        },
        {
            id: 'rule-tenant-default',
            tenantId: 'tenant-1',
            approverIds: ['lead-1'],
        },
    ],
    createdBy: 'admin-1',
    correlationId: 'corr-1',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
};

test('C1 policy routing resolves approvers from multiple matching rules', () => {
    const approvers = resolveApproverIds(template, {
        tenantId: 'tenant-1',
        workspaceId: 'ws-1',
        riskLevel: 'high',
        actionType: 'deploy.release',
    });

    assert.deepEqual(approvers.sort(), ['lead-1', 'ops-1', 'sec-1', 'sec-2']);
});

test('C1 policy routing returns empty list when no rules match', () => {
    const approvers = resolveApproverIds(template, {
        tenantId: 'tenant-2',
        workspaceId: 'ws-2',
        riskLevel: 'low',
        actionType: 'read.status',
    });

    assert.equal(approvers.length, 0);
});
