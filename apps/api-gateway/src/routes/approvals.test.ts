import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerApprovalRoutes } from './approvals.js';

type StoredApproval = {
    id: string;
    tenantId: string;
    workspaceId: string;
    botId: string;
    taskId: string;
    actionId: string;
    riskLevel: 'medium' | 'high';
    actionSummary: string;
    requestedBy: string;
    policyPackVersion: string;
    escalationTimeoutSeconds: number;
    decision: 'pending' | 'approved' | 'rejected' | 'timeout_rejected';
    createdAt: Date;
    escalatedAt: Date | null;
};

const session = () => ({
    userId: 'user_1',
    tenantId: 'tenant_1',
    workspaceIds: ['ws_1'],
    expiresAt: Date.now() + 60_000,
});

const createRepo = () => {
    const approvals = new Map<string, StoredApproval>();
    const auditEvents: Array<{ summary: string; severity?: 'info' | 'warn' | 'error' }> = [];
    const runtimeEndpoints = new Map<string, string>();

    return {
        approvals,
        auditEvents,
        runtimeEndpoints,
        repo: {
            async findByAction(input: { tenantId: string; workspaceId: string; actionId: string }) {
                for (const approval of approvals.values()) {
                    if (
                        approval.tenantId === input.tenantId
                        && approval.workspaceId === input.workspaceId
                        && approval.actionId === input.actionId
                    ) {
                        return approval;
                    }
                }
                return null;
            },
            async findById(input: { approvalId: string; tenantId: string; workspaceId: string }) {
                const approval = approvals.get(input.approvalId);
                if (!approval) {
                    return null;
                }

                if (approval.tenantId !== input.tenantId || approval.workspaceId !== input.workspaceId) {
                    return null;
                }

                return approval;
            },
            async createPending(input: {
                tenantId: string;
                workspaceId: string;
                botId: string;
                taskId: string;
                actionId: string;
                riskLevel: 'medium' | 'high';
                actionSummary: string;
                requestedBy: string;
                policyPackVersion: string;
                escalationTimeoutSeconds: number;
            }) {
                const id = `apr_${approvals.size + 1}`;
                const record: StoredApproval = {
                    id,
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
                    createdAt: new Date(),
                    escalatedAt: null,
                };
                approvals.set(id, record);
                return record;
            },
            async listEscalationCandidates(input: { tenantId: string; workspaceId: string; asOf: Date }) {
                return Array.from(approvals.values()).filter((approval) => (
                    approval.tenantId === input.tenantId
                    && approval.workspaceId === input.workspaceId
                    && approval.decision === 'pending'
                    && approval.escalatedAt === null
                    && approval.createdAt.getTime() + approval.escalationTimeoutSeconds * 1000
                    <= input.asOf.getTime()
                ));
            },
            async markEscalated(input: { approvalId: string; escalatedAt: Date }) {
                const existing = approvals.get(input.approvalId);
                if (!existing) {
                    return;
                }
                existing.escalatedAt = input.escalatedAt;
                approvals.set(input.approvalId, existing);
            },
            async setDecision(input: {
                approvalId: string;
                decision: 'approved' | 'rejected' | 'timeout_rejected';
                reason: string | null;
                approverId: string;
                decidedAt: Date;
                decisionLatencySeconds: number;
            }) {
                const existing = approvals.get(input.approvalId);
                if (!existing) {
                    return;
                }

                existing.decision = input.decision;
                approvals.set(input.approvalId, existing);
            },
            async createAuditEvent(input: { summary: string; severity?: 'info' | 'warn' | 'error' }) {
                auditEvents.push(input);
                return;
            },
            async findRuntimeDecisionEndpoint(input: { tenantId: string; workspaceId: string; botId: string }) {
                const key = `${input.tenantId}:${input.workspaceId}:${input.botId}`;
                return runtimeEndpoints.get(key) ?? null;
            },
        },
    };
};

test('intake queues medium/high risk actions for approval', async () => {
    const app = Fastify();
    const fake = createRepo();

    await registerApprovalRoutes(app, {
        getSession: () => session(),
        repo: fake.repo,
    });

    try {
        const response = await app.inject({
            method: 'POST',
            url: '/v1/approvals/intake',
            payload: {
                workspace_id: 'ws_1',
                bot_id: 'bot_1',
                task_id: 'task_1',
                action_id: 'act_1',
                action_summary: 'Merge release branch',
                risk_level: 'high',
                requested_by: 'runtime:bot_1',
                policy_pack_version: 'mvp-v1',
            },
        });

        assert.equal(response.statusCode, 201);
        const body = response.json() as { status: string; approval_id: string };
        assert.equal(body.status, 'queued_for_approval');
        assert.equal(body.approval_id, 'apr_1');
    } finally {
        await app.close();
    }
});

test('intake returns execute route for low risk actions', async () => {
    const app = Fastify();
    const fake = createRepo();

    await registerApprovalRoutes(app, {
        getSession: () => session(),
        repo: fake.repo,
    });

    try {
        const response = await app.inject({
            method: 'POST',
            url: '/v1/approvals/intake',
            payload: {
                workspace_id: 'ws_1',
                bot_id: 'bot_1',
                task_id: 'task_1',
                action_id: 'act_1',
                action_summary: 'Read issue summary',
                risk_level: 'low',
                requested_by: 'runtime:bot_1',
                policy_pack_version: 'mvp-v1',
            },
        });

        assert.equal(response.statusCode, 200);
        const body = response.json() as { route: string; status: string };
        assert.equal(body.route, 'execute');
        assert.equal(body.status, 'execute_without_approval');
        assert.equal(fake.approvals.size, 0);
    } finally {
        await app.close();
    }
});

test('intake enforces approval immutability for existing action records', async () => {
    const app = Fastify();
    const fake = createRepo();

    await registerApprovalRoutes(app, {
        getSession: () => session(),
        repo: fake.repo,
    });

    try {
        const first = await app.inject({
            method: 'POST',
            url: '/v1/approvals/intake',
            payload: {
                workspace_id: 'ws_1',
                bot_id: 'bot_1',
                task_id: 'task_1',
                action_id: 'act_immutable',
                action_summary: 'Update permissions for release role',
                risk_level: 'high',
                requested_by: 'runtime:bot_1',
                policy_pack_version: 'mvp-v1',
            },
        });
        assert.equal(first.statusCode, 201);

        const conflicting = await app.inject({
            method: 'POST',
            url: '/v1/approvals/intake',
            payload: {
                workspace_id: 'ws_1',
                bot_id: 'bot_1',
                task_id: 'task_1',
                action_id: 'act_immutable',
                action_summary: 'Changed summary should fail immutability',
                risk_level: 'high',
                requested_by: 'runtime:bot_1',
                policy_pack_version: 'mvp-v1',
            },
        });

        assert.equal(conflicting.statusCode, 409);
        const body = conflicting.json() as { error: string };
        assert.equal(body.error, 'immutable_record_violation');
    } finally {
        await app.close();
    }
});

test('intake immutability rejects changes to all protected fields including task_id', async () => {
    const app = Fastify();
    const fake = createRepo();

    await registerApprovalRoutes(app, {
        getSession: () => session(),
        repo: fake.repo,
    });

    const basePayload = {
        workspace_id: 'ws_1',
        bot_id: 'bot_1',
        task_id: 'task_immutable',
        action_id: 'act_immutable_matrix',
        action_summary: 'Immutable baseline summary',
        risk_level: 'high',
        requested_by: 'runtime:bot_1',
        policy_pack_version: 'mvp-v1',
        escalation_timeout_seconds: 3600,
    } as const;

    try {
        const first = await app.inject({
            method: 'POST',
            url: '/v1/approvals/intake',
            payload: basePayload,
        });
        assert.equal(first.statusCode, 201);

        const variants = [
            { ...basePayload, task_id: 'task_changed' },
            { ...basePayload, bot_id: 'bot_2' },
            { ...basePayload, risk_level: 'medium' },
            { ...basePayload, action_summary: 'changed summary' },
            { ...basePayload, requested_by: 'runtime:bot_2' },
            { ...basePayload, policy_pack_version: 'mvp-v2' },
            { ...basePayload, escalation_timeout_seconds: 1800 },
        ];

        for (const payload of variants) {
            const response = await app.inject({
                method: 'POST',
                url: '/v1/approvals/intake',
                payload,
            });

            assert.equal(response.statusCode, 409);
            const body = response.json() as { error: string };
            assert.equal(body.error, 'immutable_record_violation');
        }
    } finally {
        await app.close();
    }
});

test('escalate marks overdue pending approvals after one hour threshold', async () => {
    const app = Fastify();
    const fake = createRepo();
    const now = Date.now();

    const oldRecord: StoredApproval = {
        id: 'apr_old',
        tenantId: 'tenant_1',
        workspaceId: 'ws_1',
        botId: 'bot_1',
        taskId: 'task_old',
        actionId: 'act_old',
        riskLevel: 'medium',
        actionSummary: 'Old approval pending',
        requestedBy: 'runtime:bot_1',
        policyPackVersion: 'mvp-v1',
        escalationTimeoutSeconds: 3600,
        decision: 'pending',
        createdAt: new Date(now - 3700 * 1000),
        escalatedAt: null,
    };

    const freshRecord: StoredApproval = {
        id: 'apr_fresh',
        tenantId: 'tenant_1',
        workspaceId: 'ws_1',
        botId: 'bot_1',
        taskId: 'task_fresh',
        actionId: 'act_fresh',
        riskLevel: 'high',
        actionSummary: 'Fresh approval pending',
        requestedBy: 'runtime:bot_1',
        policyPackVersion: 'mvp-v1',
        escalationTimeoutSeconds: 3600,
        decision: 'pending',
        createdAt: new Date(now - 300 * 1000),
        escalatedAt: null,
    };

    fake.approvals.set(oldRecord.id, oldRecord);
    fake.approvals.set(freshRecord.id, freshRecord);

    await registerApprovalRoutes(app, {
        getSession: () => session(),
        repo: fake.repo,
        now: () => now,
    });

    try {
        const response = await app.inject({
            method: 'POST',
            url: '/v1/approvals/escalate',
            payload: {
                workspace_id: 'ws_1',
            },
        });

        assert.equal(response.statusCode, 200);
        const body = response.json() as { escalated_count: number; escalated_approval_ids: string[] };
        assert.equal(body.escalated_count, 1);
        assert.deepEqual(body.escalated_approval_ids, ['apr_old']);
        assert.ok(fake.approvals.get('apr_old')?.escalatedAt instanceof Date);
        assert.equal(fake.approvals.get('apr_fresh')?.escalatedAt, null);
        assert.equal(fake.auditEvents.length, 1);
        assert.ok(fake.auditEvents[0]?.summary.includes('apr_old'));
    } finally {
        await app.close();
    }
});

test('escalate uses per-record timeout instead of global default', async () => {
    const app = Fastify();
    const fake = createRepo();
    const now = Date.now();

    const shortTimeoutDue: StoredApproval = {
        id: 'apr_short_due',
        tenantId: 'tenant_1',
        workspaceId: 'ws_1',
        botId: 'bot_1',
        taskId: 'task_short_due',
        actionId: 'act_short_due',
        riskLevel: 'medium',
        actionSummary: 'Short timeout should escalate',
        requestedBy: 'runtime:bot_1',
        policyPackVersion: 'mvp-v1',
        escalationTimeoutSeconds: 60,
        decision: 'pending',
        createdAt: new Date(now - 90 * 1000),
        escalatedAt: null,
    };

    const longTimeoutNotDue: StoredApproval = {
        id: 'apr_long_not_due',
        tenantId: 'tenant_1',
        workspaceId: 'ws_1',
        botId: 'bot_1',
        taskId: 'task_long_not_due',
        actionId: 'act_long_not_due',
        riskLevel: 'high',
        actionSummary: 'Long timeout should remain pending',
        requestedBy: 'runtime:bot_1',
        policyPackVersion: 'mvp-v1',
        escalationTimeoutSeconds: 7200,
        decision: 'pending',
        createdAt: new Date(now - 3700 * 1000),
        escalatedAt: null,
    };

    fake.approvals.set(shortTimeoutDue.id, shortTimeoutDue);
    fake.approvals.set(longTimeoutNotDue.id, longTimeoutNotDue);

    await registerApprovalRoutes(app, {
        getSession: () => session(),
        repo: fake.repo,
        now: () => now,
    });

    try {
        const response = await app.inject({
            method: 'POST',
            url: '/v1/approvals/escalate',
            payload: {
                workspace_id: 'ws_1',
            },
        });

        assert.equal(response.statusCode, 200);
        const body = response.json() as { escalated_count: number; escalated_approval_ids: string[] };
        assert.equal(body.escalated_count, 1);
        assert.deepEqual(body.escalated_approval_ids, ['apr_short_due']);
        assert.ok(fake.approvals.get('apr_short_due')?.escalatedAt instanceof Date);
        assert.equal(fake.approvals.get('apr_long_not_due')?.escalatedAt, null);
        assert.equal(fake.auditEvents.length, 1);
        assert.ok(fake.auditEvents[0]?.summary.includes('apr_short_due'));
    } finally {
        await app.close();
    }
});

test('intake accepts runtime service token auth without user session', async () => {
    const app = Fastify();
    const fake = createRepo();

    await registerApprovalRoutes(app, {
        getSession: () => null,
        repo: fake.repo,
        serviceAuthToken: 'shared-runtime-token',
    });

    try {
        const response = await app.inject({
            method: 'POST',
            url: '/v1/approvals/intake',
            headers: {
                'x-approval-intake-token': 'shared-runtime-token',
            },
            payload: {
                tenant_id: 'tenant_1',
                workspace_id: 'ws_1',
                bot_id: 'bot_1',
                task_id: 'task_s2s_1',
                action_id: 'act_s2s_1',
                action_summary: 'Runtime created approval request',
                risk_level: 'medium',
                requested_by: 'runtime:bot_1',
                policy_pack_version: 'mvp-v1',
            },
        });

        assert.equal(response.statusCode, 201);
        const body = response.json() as { status: string };
        assert.equal(body.status, 'queued_for_approval');
        assert.equal(fake.approvals.get('apr_1')?.taskId, 'task_s2s_1');
    } finally {
        await app.close();
    }
});

test('decision endpoint captures approve decision with latency and marks immutable state', async () => {
    const app = Fastify();
    const fake = createRepo();
    const baseNow = 1_000_000;

    const approval: StoredApproval = {
        id: 'apr_decide_1',
        tenantId: 'tenant_1',
        workspaceId: 'ws_1',
        botId: 'bot_1',
        taskId: 'task_decide_1',
        actionId: 'act_decide_1',
        riskLevel: 'high',
        actionSummary: 'Merge release PR',
        requestedBy: 'runtime:bot_1',
        policyPackVersion: 'mvp-v1',
        escalationTimeoutSeconds: 3600,
        decision: 'pending',
        createdAt: new Date(baseNow - 15_000),
        escalatedAt: null,
    };
    fake.approvals.set(approval.id, approval);

    await registerApprovalRoutes(app, {
        getSession: () => session(),
        repo: fake.repo,
        now: () => baseNow,
    });

    try {
        const response = await app.inject({
            method: 'POST',
            url: '/v1/approvals/apr_decide_1/decision',
            payload: {
                workspace_id: 'ws_1',
                decision: 'approved',
                reason: 'Reviewed and safe to execute',
            },
        });

        assert.equal(response.statusCode, 200);
        const body = response.json() as { decision: string; decision_latency_seconds: number };
        assert.equal(body.decision, 'approved');
        assert.equal(body.decision_latency_seconds, 15);
        assert.equal(fake.approvals.get('apr_decide_1')?.decision, 'approved');
        assert.equal(fake.auditEvents.length, 1);
        assert.ok(fake.auditEvents[0]?.summary.includes('apr_decide_1'));

        const second = await app.inject({
            method: 'POST',
            url: '/v1/approvals/apr_decide_1/decision',
            payload: {
                workspace_id: 'ws_1',
                decision: 'rejected',
                reason: 'Should be immutable now',
            },
        });
        assert.equal(second.statusCode, 409);
    } finally {
        await app.close();
    }
});

test('decision endpoint requires reason for rejected and timeout_rejected', async () => {
    const app = Fastify();
    const fake = createRepo();

    const approval: StoredApproval = {
        id: 'apr_decide_reason',
        tenantId: 'tenant_1',
        workspaceId: 'ws_1',
        botId: 'bot_1',
        taskId: 'task_reason_1',
        actionId: 'act_reason_1',
        riskLevel: 'medium',
        actionSummary: 'Update ticket status',
        requestedBy: 'runtime:bot_1',
        policyPackVersion: 'mvp-v1',
        escalationTimeoutSeconds: 3600,
        decision: 'pending',
        createdAt: new Date(),
        escalatedAt: null,
    };
    fake.approvals.set(approval.id, approval);

    await registerApprovalRoutes(app, {
        getSession: () => session(),
        repo: fake.repo,
    });

    try {
        const rejected = await app.inject({
            method: 'POST',
            url: '/v1/approvals/apr_decide_reason/decision',
            payload: {
                workspace_id: 'ws_1',
                decision: 'rejected',
            },
        });
        assert.equal(rejected.statusCode, 400);

        const timeoutRejected = await app.inject({
            method: 'POST',
            url: '/v1/approvals/apr_decide_reason/decision',
            payload: {
                workspace_id: 'ws_1',
                decision: 'timeout_rejected',
            },
        });
        assert.equal(timeoutRejected.statusCode, 400);
    } finally {
        await app.close();
    }
});

test('decision endpoint sends runtime /decision webhook with task context when endpoint is available', async () => {
    const app = Fastify();
    const fake = createRepo();

    const approval: StoredApproval = {
        id: 'apr_decide_webhook',
        tenantId: 'tenant_1',
        workspaceId: 'ws_1',
        botId: 'bot_1',
        taskId: 'task_webhook_1',
        actionId: 'act_webhook_1',
        riskLevel: 'high',
        actionSummary: 'Deploy production service',
        requestedBy: 'runtime:bot_1',
        policyPackVersion: 'mvp-v1',
        escalationTimeoutSeconds: 3600,
        decision: 'pending',
        createdAt: new Date(Date.now() - 10_000),
        escalatedAt: null,
    };
    fake.approvals.set(approval.id, approval);
    fake.runtimeEndpoints.set('tenant_1:ws_1:bot_1', 'http://runtime.bot.local');

    const webhookCalls: Array<Record<string, unknown>> = [];

    await registerApprovalRoutes(app, {
        getSession: () => session(),
        repo: fake.repo,
        runtimeDecisionToken: 'runtime-shared-token',
        decisionWebhookNotifier: async (input) => {
            webhookCalls.push(input as unknown as Record<string, unknown>);
            return {
                ok: true,
                statusCode: 200,
            };
        },
    });

    try {
        const response = await app.inject({
            method: 'POST',
            url: '/v1/approvals/apr_decide_webhook/decision',
            payload: {
                workspace_id: 'ws_1',
                decision: 'approved',
                reason: 'Looks safe',
            },
        });

        assert.equal(response.statusCode, 200);
        const body = response.json() as { webhook_notified: boolean; webhook_status_code: number | null };
        assert.equal(body.webhook_notified, true);
        assert.equal(body.webhook_status_code, 200);

        assert.equal(webhookCalls.length, 1);
        assert.equal(webhookCalls[0]?.runtimeEndpoint, 'http://runtime.bot.local');
        assert.equal(webhookCalls[0]?.runtimeToken, 'runtime-shared-token');
        assert.equal(webhookCalls[0]?.taskId, 'task_webhook_1');
        assert.equal(webhookCalls[0]?.decision, 'approved');
    } finally {
        await app.close();
    }
});

test('decision endpoint records warning audit event when runtime webhook delivery fails', async () => {
    const app = Fastify();
    const fake = createRepo();

    const approval: StoredApproval = {
        id: 'apr_decide_webhook_fail',
        tenantId: 'tenant_1',
        workspaceId: 'ws_1',
        botId: 'bot_1',
        taskId: 'task_webhook_fail_1',
        actionId: 'act_webhook_fail_1',
        riskLevel: 'medium',
        actionSummary: 'Update release ticket',
        requestedBy: 'runtime:bot_1',
        policyPackVersion: 'mvp-v1',
        escalationTimeoutSeconds: 3600,
        decision: 'pending',
        createdAt: new Date(Date.now() - 10_000),
        escalatedAt: null,
    };
    fake.approvals.set(approval.id, approval);
    fake.runtimeEndpoints.set('tenant_1:ws_1:bot_1', 'http://runtime.bot.local');

    await registerApprovalRoutes(app, {
        getSession: () => session(),
        repo: fake.repo,
        decisionWebhookNotifier: async () => ({
            ok: false,
            statusCode: 503,
            errorMessage: 'runtime unavailable',
        }),
    });

    try {
        const response = await app.inject({
            method: 'POST',
            url: '/v1/approvals/apr_decide_webhook_fail/decision',
            payload: {
                workspace_id: 'ws_1',
                decision: 'rejected',
                reason: 'Policy denied',
            },
        });

        assert.equal(response.statusCode, 200);
        const body = response.json() as { webhook_notified: boolean; webhook_status_code: number | null };
        assert.equal(body.webhook_notified, false);
        assert.equal(body.webhook_status_code, 503);

        assert.equal(fake.auditEvents.length, 2);
        assert.ok(fake.auditEvents[1]?.summary.includes('Decision webhook failed'));
    } finally {
        await app.close();
    }
});
