import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerGovernanceWorkflowRoutes } from './governance-workflows.js';

const session = () => ({
    userId: 'approver-1',
    tenantId: 'tenant-1',
    workspaceIds: ['ws-1'],
    expiresAt: Date.now() + 60_000,
});

const createTemplatePayload = () => ({
    workspace_id: 'ws-1',
    template_name: 'org-level-governance',
    policy_pack_version: 'policy-v3',
    stages: [
        {
            stage_id: 'stage-1',
            stage_name: 'Primary Review',
            min_approvers: 2,
            escalation_timeout_seconds: 300,
        },
        {
            stage_id: 'stage-2',
            stage_name: 'Security Review',
            min_approvers: 1,
            escalation_timeout_seconds: 300,
        },
    ],
    routing_rules: [
        {
            id: 'risk-high',
            risk_level: 'high',
            approver_ids: ['approver-1', 'approver-2', 'approver-3'],
        },
    ],
});

test('C1 governance templates and workflow start support multi-approver routing', async () => {
    const app = Fastify();
    await registerGovernanceWorkflowRoutes(app, { getSession: () => session() });

    try {
        const templateRes = await app.inject({
            method: 'POST',
            url: '/v1/governance/workflows/templates',
            payload: createTemplatePayload(),
        });

        assert.equal(templateRes.statusCode, 201);
        const templateBody = templateRes.json() as { template_id: string };

        const startRes = await app.inject({
            method: 'POST',
            url: '/v1/governance/workflows/start',
            payload: {
                template_id: templateBody.template_id,
                workspace_id: 'ws-1',
                bot_id: 'bot-1',
                task_id: 'task-1',
                action_id: 'action-1',
                action_summary: 'Deploy production release',
                action_type: 'deploy.release',
                risk_level: 'high',
            },
        });

        assert.equal(startRes.statusCode, 201);
        const startBody = startRes.json() as { assigned_approver_ids: string[]; current_stage_id: string };
        assert.equal(startBody.current_stage_id, 'stage-1');
        assert.deepEqual(startBody.assigned_approver_ids.sort(), ['approver-1', 'approver-2', 'approver-3']);
    } finally {
        await app.close();
    }
});

test('C1 workflow decisions include reason taxonomy, policy version, and evidence links', async () => {
    const app = Fastify();
    await registerGovernanceWorkflowRoutes(app, { getSession: () => session() });

    try {
        const template = await app.inject({
            method: 'POST',
            url: '/v1/governance/workflows/templates',
            payload: createTemplatePayload(),
        });
        const templateBody = template.json() as { template_id: string };

        const start = await app.inject({
            method: 'POST',
            url: '/v1/governance/workflows/start',
            payload: {
                template_id: templateBody.template_id,
                workspace_id: 'ws-1',
                bot_id: 'bot-2',
                task_id: 'task-2',
                action_id: 'action-2',
                action_summary: 'Update IAM role bindings',
                action_type: 'iam.update',
                risk_level: 'high',
            },
        });
        const startBody = start.json() as { workflow_id: string };

        const decision = await app.inject({
            method: 'POST',
            url: `/v1/governance/workflows/${startBody.workflow_id}/decision`,
            payload: {
                decision: 'rejected',
                reason_code: 'policy_violation',
                reason_text: 'Rejected due to policy violation',
                evidence_links: ['https://evidence.local/iam-review'],
            },
        });

        assert.equal(decision.statusCode, 200);
        const body = decision.json() as { status: string; reason_code: string; evidence_links: string[]; policy_pack_version: string };
        assert.equal(body.status, 'rejected');
        assert.equal(body.reason_code, 'policy_violation');
        assert.deepEqual(body.evidence_links, ['https://evidence.local/iam-review']);
        assert.equal(body.policy_pack_version, 'policy-v3');
    } finally {
        await app.close();
    }
});

test('C1 workflow advances stage after minimum approvers approve', async () => {
    const app = Fastify();
    const clock = { value: 100_000 };
    let actorId = 'approver-1';

    await registerGovernanceWorkflowRoutes(app, {
        getSession: () => ({ ...session(), userId: actorId }),
        now: () => clock.value,
    });

    try {
        const template = await app.inject({ method: 'POST', url: '/v1/governance/workflows/templates', payload: createTemplatePayload() });
        const templateBody = template.json() as { template_id: string };
        const start = await app.inject({
            method: 'POST',
            url: '/v1/governance/workflows/start',
            payload: {
                template_id: templateBody.template_id,
                workspace_id: 'ws-1',
                bot_id: 'bot-3',
                task_id: 'task-3',
                action_id: 'action-3',
                action_summary: 'Release deployment',
                action_type: 'deploy.release',
                risk_level: 'high',
            },
        });
        const startBody = start.json() as { workflow_id: string };

        const firstDecision = await app.inject({
            method: 'POST',
            url: `/v1/governance/workflows/${startBody.workflow_id}/decision`,
            payload: {
                decision: 'approved',
                reason_code: 'approved_with_controls',
                reason_text: 'Approved with controls',
                evidence_links: ['https://evidence.local/1'],
            },
        });

        assert.equal(firstDecision.statusCode, 200);
        const firstBody = firstDecision.json() as { status: string; current_stage_id: string };
        assert.equal(firstBody.status, 'in_review');
        assert.equal(firstBody.current_stage_id, 'stage-1');

        actorId = 'approver-2';
        clock.value += 1000;

        const secondDecision = await app.inject({
            method: 'POST',
            url: `/v1/governance/workflows/${startBody.workflow_id}/decision`,
            payload: {
                decision: 'approved',
                reason_code: 'approved_with_controls',
                reason_text: 'Second approver validated controls',
                evidence_links: ['https://evidence.local/2'],
            },
        });

        assert.equal(secondDecision.statusCode, 200);
        const secondBody = secondDecision.json() as { current_stage_id: string; status: string };
        assert.equal(secondBody.current_stage_id, 'stage-2');
        assert.equal(secondBody.status, 'in_review');
    } finally {
        await app.close();
    }
});

test('C1 diagnostics expose workflow SLA and bottleneck stage', async () => {
    const app = Fastify();
    let nowTick = 1_000_000;

    await registerGovernanceWorkflowRoutes(app, {
        getSession: () => session(),
        now: () => nowTick,
        workflowSlaSeconds: 1,
    });

    try {
        const template = await app.inject({ method: 'POST', url: '/v1/governance/workflows/templates', payload: createTemplatePayload() });
        const templateBody = template.json() as { template_id: string };

        await app.inject({
            method: 'POST',
            url: '/v1/governance/workflows/start',
            payload: {
                template_id: templateBody.template_id,
                workspace_id: 'ws-1',
                bot_id: 'bot-5',
                task_id: 'task-5',
                action_id: 'action-5',
                action_summary: 'Action A',
                action_type: 'deploy.release',
                risk_level: 'high',
            },
        });

        await app.inject({
            method: 'POST',
            url: '/v1/governance/workflows/start',
            payload: {
                template_id: templateBody.template_id,
                workspace_id: 'ws-1',
                bot_id: 'bot-6',
                task_id: 'task-6',
                action_id: 'action-6',
                action_summary: 'Action B',
                action_type: 'deploy.release',
                risk_level: 'high',
            },
        });

        nowTick += 2_000;

        const diagnostics = await app.inject({
            method: 'GET',
            url: '/v1/governance/workflows/diagnostics?workspace_id=ws-1',
        });

        assert.equal(diagnostics.statusCode, 200);
        const body = diagnostics.json() as {
            pendingWorkflows: number;
            overdueWorkflows: number;
            bottleneckStageId?: string;
            bottleneckStagePendingCount: number;
        };

        assert.equal(body.pendingWorkflows, 2);
        assert.equal(body.overdueWorkflows, 2);
        assert.equal(body.bottleneckStageId, 'stage-1');
        assert.equal(body.bottleneckStagePendingCount, 2);
    } finally {
        await app.close();
    }
});
