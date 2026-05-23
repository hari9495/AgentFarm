import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerBudgetPolicyRoutes } from './budget-policy.js';

const mockSession = {
    userId: 'user_123',
    tenantId: 'tenant_abc',
    workspaceIds: ['ws_001', 'ws_002'],
    scope: 'internal' as const,
    expiresAt: Date.now() + 3600000,
};

const stubPrisma = {
    outboundWebhook: { findMany: async () => [] },
} as any;

async function createTestApp(customBudgetStore?: Map<any, any>) {
    const app = Fastify({ logger: false });
    const budgetStore = customBudgetStore ?? new Map();
    await registerBudgetPolicyRoutes(app, {
        getSession: () => mockSession,
        budgetStore,
        prisma: stubPrisma,
    });
    return { app, budgetStore };
}

async function createTestAppWithOptions(options?: {
    budgetStore?: Map<any, any>;
    repo?: {
        loadBudgetState(input: { tenantId: string; workspaceId: string }): Promise<any>;
        loadBudgetConfig(input: { tenantId: string; workspaceId: string }): Promise<any>;
        appendBudgetEvent(input: any): Promise<void>;
    };
}) {
    const app = Fastify({ logger: false });
    const budgetStore = options?.budgetStore ?? new Map();
    await registerBudgetPolicyRoutes(app, {
        getSession: () => mockSession,
        budgetStore,
        repo: options?.repo,
        prisma: stubPrisma,
    });
    return { app, budgetStore };
}

test('Budget Policy Routes', async (suite) => {
    await suite.test('evaluate returns allowed decision when spend is within limits', async () => {
        const { app } = await createTestApp();

        const response = await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws_001/budget/evaluate',
            payload: { taskId: 'task_1', estimatedCost: 10 },
        });

        assert.strictEqual(response.statusCode, 200);
        const body = JSON.parse(response.body);
        assert.strictEqual(body.decision, 'allowed');
    });

    await suite.test('evaluate includes claim_token and leaseId in decision', async () => {
        const { app } = await createTestApp();

        const response = await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws_001/budget/evaluate',
            payload: {
                taskId: 'task_2',
                estimatedCost: 5,
                claimToken: 'claim_xyz',
                leaseId: 'lease_789',
            },
        });

        assert.strictEqual(response.statusCode, 200);
        const body = JSON.parse(response.body);
        assert.strictEqual(body.claimToken, 'claim_xyz');
        assert.strictEqual(body.leaseId, 'lease_789');
    });

    await suite.test('evaluate returns denied when daily limit exceeded', async () => {
        const { app } = await createTestApp();

        await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws_001/budget/evaluate',
            payload: { taskId: 'task_3a', estimatedCost: 95 },
        });

        const response = await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws_001/budget/evaluate',
            payload: { taskId: 'task_3b', estimatedCost: 10 },
        });

        assert.strictEqual(response.statusCode, 200);
        const body = JSON.parse(response.body);
        assert.strictEqual(body.decision, 'denied');
        assert.strictEqual(body.denialReason, 'daily_limit_exceeded');
    });

    await suite.test('evaluate returns denied when monthly limit exceeded', async () => {
        const seededStore = new Map();
        seededStore.set('ws_001', {
            dailySpent: 20,
            dailyLimit: 100,
            monthlySpent: 999,
            monthlyLimit: 1000,
            isHardStopActive: false,
            lastResetDaily: new Date().toISOString(),
        });
        const { app } = await createTestApp(seededStore);

        const response = await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws_001/budget/evaluate',
            payload: { taskId: 'task_3m2', estimatedCost: 2 },
        });

        assert.strictEqual(response.statusCode, 200);
        const body = JSON.parse(response.body);
        assert.strictEqual(body.decision, 'denied');
        assert.strictEqual(body.denialReason, 'monthly_limit_exceeded');
    });

    await suite.test('evaluate returns warning when approaching 80% threshold', async () => {
        const { app } = await createTestApp();

        await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws_001/budget/evaluate',
            payload: { taskId: 'task_4a', estimatedCost: 68 },
        });

        const response = await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws_001/budget/evaluate',
            payload: { taskId: 'task_4b', estimatedCost: 20 },
        });

        assert.strictEqual(response.statusCode, 200);
        const body = JSON.parse(response.body);
        assert.strictEqual(body.decision, 'warning');
    });

    await suite.test('evaluate returns denied when hard-stop is active', async () => {
        const { app } = await createTestApp();

        await app.inject({
            method: 'PUT',
            url: '/v1/workspaces/ws_001/budget/hard-stop',
            payload: { isActive: true },
        });

        const response = await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws_001/budget/evaluate',
            payload: { taskId: 'task_5', estimatedCost: 5 },
        });

        assert.strictEqual(response.statusCode, 200);
        const body = JSON.parse(response.body);
        assert.strictEqual(body.decision, 'denied');
        assert.strictEqual(body.denialReason, 'hard_stop_active');
    });

    await suite.test('hard-stop denied evaluation does not mutate spend totals', async () => {
        const { app } = await createTestApp();

        await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws_001/budget/evaluate',
            payload: { taskId: 'task_hs_seed', estimatedCost: 25 },
        });

        await app.inject({
            method: 'PUT',
            url: '/v1/workspaces/ws_001/budget/hard-stop',
            payload: { isActive: true },
        });

        const denied = await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws_001/budget/evaluate',
            payload: { taskId: 'task_hs_denied', estimatedCost: 30 },
        });
        assert.strictEqual(denied.statusCode, 200);
        const deniedBody = JSON.parse(denied.body);
        assert.strictEqual(deniedBody.decision, 'denied');
        assert.strictEqual(deniedBody.denialReason, 'hard_stop_active');

        const state = await app.inject({
            method: 'GET',
            url: '/v1/workspaces/ws_001/budget/state',
        });
        assert.strictEqual(state.statusCode, 200);
        const stateBody = JSON.parse(state.body);
        assert.strictEqual(stateBody.dailySpent, 25);
        assert.strictEqual(stateBody.monthlySpent, 25);
    });

    await suite.test('evaluate returns 400 when taskId missing', async () => {
        const { app } = await createTestApp();

        const response = await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws_001/budget/evaluate',
            payload: { estimatedCost: 10 },
        });

        assert.strictEqual(response.statusCode, 400);
    });

    await suite.test('evaluate returns 403 when workspace not in scope', async () => {
        const app = Fastify({ logger: false });
        await registerBudgetPolicyRoutes(app, {
            getSession: () => ({ ...mockSession, workspaceIds: ['ws_999'] }),
        });

        const response = await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws_001/budget/evaluate',
            payload: { taskId: 'task_6', estimatedCost: 10 },
        });

        assert.strictEqual(response.statusCode, 403);
    });

    await suite.test('evaluate includes workspace budget state', async () => {
        const { app } = await createTestApp();

        const response = await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws_001/budget/evaluate',
            payload: { taskId: 'task_7', estimatedCost: 25 },
        });

        assert.strictEqual(response.statusCode, 200);
        const body = JSON.parse(response.body);
        assert.ok(body.workspaceBudgetState);
        assert.strictEqual(body.workspaceBudgetState.dailyLimit, 100);
    });

    await suite.test('hard-stop PUT activates hard-stop', async () => {
        const { app } = await createTestApp();

        const response = await app.inject({
            method: 'PUT',
            url: '/v1/workspaces/ws_001/budget/hard-stop',
            payload: { isActive: true },
        });

        assert.strictEqual(response.statusCode, 200);
        const body = JSON.parse(response.body);
        assert.strictEqual(body.isHardStopActive, true);
    });

    await suite.test('hard-stop PUT deactivates hard-stop', async () => {
        const { app } = await createTestApp();

        await app.inject({
            method: 'PUT',
            url: '/v1/workspaces/ws_001/budget/hard-stop',
            payload: { isActive: true },
        });

        const response = await app.inject({
            method: 'PUT',
            url: '/v1/workspaces/ws_001/budget/hard-stop',
            payload: { isActive: false },
        });

        assert.strictEqual(response.statusCode, 200);
        const body = JSON.parse(response.body);
        assert.strictEqual(body.isHardStopActive, false);
    });

    await suite.test('budget limits PUT updates workspace-specific limits and GET returns them', async () => {
        const { app } = await createTestApp();

        const update = await app.inject({
            method: 'PUT',
            url: '/v1/workspaces/ws_001/budget/limits',
            payload: {
                scope: 'workspace',
                dailyLimit: 250,
                monthlyLimit: 2500,
            },
        });
        assert.strictEqual(update.statusCode, 200);
        const updateBody = JSON.parse(update.body);
        assert.strictEqual(updateBody.scope, 'workspace');
        assert.strictEqual(updateBody.dailyLimit, 250);
        assert.strictEqual(updateBody.monthlyLimit, 2500);

        const getLimits = await app.inject({
            method: 'GET',
            url: '/v1/workspaces/ws_001/budget/limits',
        });
        assert.strictEqual(getLimits.statusCode, 200);
        const limitsBody = JSON.parse(getLimits.body);
        assert.strictEqual(limitsBody.dailyLimit, 250);
        assert.strictEqual(limitsBody.monthlyLimit, 2500);
    });

    await suite.test('evaluation uses configured workspace limits instead of defaults', async () => {
        const { app } = await createTestApp();

        await app.inject({
            method: 'PUT',
            url: '/v1/workspaces/ws_001/budget/limits',
            payload: {
                scope: 'workspace',
                dailyLimit: 50,
                monthlyLimit: 500,
            },
        });

        await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws_001/budget/evaluate',
            payload: { taskId: 'task_limits_1', estimatedCost: 45 },
        });

        const denied = await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws_001/budget/evaluate',
            payload: { taskId: 'task_limits_2', estimatedCost: 10 },
        });
        assert.strictEqual(denied.statusCode, 200);
        const deniedBody = JSON.parse(denied.body);
        assert.strictEqual(deniedBody.decision, 'denied');
        assert.strictEqual(deniedBody.denialReason, 'daily_limit_exceeded');
        assert.strictEqual(deniedBody.limitValue, 50);
    });

    await suite.test('GET /budget/state returns current budget state', async () => {
        const { app } = await createTestApp();

        await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws_001/budget/evaluate',
            payload: { taskId: 'task_8', estimatedCost: 42 },
        });

        const response = await app.inject({
            method: 'GET',
            url: '/v1/workspaces/ws_001/budget/state',
        });

        assert.strictEqual(response.statusCode, 200);
        const body = JSON.parse(response.body);
        assert.strictEqual(body.dailySpent, 42);
        assert.strictEqual(body.dailyLimit, 100);
    });

    await suite.test('budget state is isolated between workspaces', async () => {
        const { app } = await createTestApp();

        await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws_001/budget/evaluate',
            payload: { taskId: 'task_9a', estimatedCost: 50 },
        });

        const response1 = await app.inject({
            method: 'GET',
            url: '/v1/workspaces/ws_001/budget/state',
        });
        const state1 = JSON.parse(response1.body);

        const response2 = await app.inject({
            method: 'GET',
            url: '/v1/workspaces/ws_002/budget/state',
        });
        const state2 = JSON.parse(response2.body);

        assert.strictEqual(state1.dailySpent, 50);
        assert.strictEqual(state2.dailySpent, 0);
    });

    await suite.test('budget state rehydrates from persistent ledger across app instances', async () => {
        type BudgetState = {
            dailySpent: number;
            dailyLimit: number;
            monthlySpent: number;
            monthlyLimit: number;
            isHardStopActive: boolean;
            lastResetDaily: string;
        };
        type LedgerEvent = {
            tenantId: string;
            workspaceId: string;
            correlationId: string;
            event: {
                stateAfter: BudgetState;
            };
        };

        const ledger: LedgerEvent[] = [];
        const repo = {
            async loadBudgetState(input: { tenantId: string; workspaceId: string }) {
                const events = ledger.filter(
                    (item) => item.tenantId === input.tenantId && item.workspaceId === input.workspaceId,
                );
                return events.length > 0 ? events[events.length - 1]?.event.stateAfter ?? null : null;
            },
            async loadBudgetConfig() {
                return null;
            },
            async appendBudgetEvent(input: LedgerEvent) {
                ledger.push(input);
            },
        };

        const app1 = Fastify({ logger: false });
        await registerBudgetPolicyRoutes(app1, {
            getSession: () => mockSession,
            repo,
            budgetStore: new Map(),
        });

        const app2 = Fastify({ logger: false });
        await registerBudgetPolicyRoutes(app2, {
            getSession: () => mockSession,
            repo,
            budgetStore: new Map(),
        });

        try {
            const evalResponse = await app1.inject({
                method: 'POST',
                url: '/v1/workspaces/ws_001/budget/evaluate',
                payload: { taskId: 'task_ledger_1', estimatedCost: 30 },
            });
            assert.strictEqual(evalResponse.statusCode, 200);
            assert.ok(ledger.length > 0);

            const rehydrated = await app2.inject({
                method: 'GET',
                url: '/v1/workspaces/ws_001/budget/state',
            });
            assert.strictEqual(rehydrated.statusCode, 200);
            const body = JSON.parse(rehydrated.body);
            assert.strictEqual(body.dailySpent, 30);
            assert.strictEqual(body.monthlySpent, 30);
        } finally {
            await app1.close();
            await app2.close();
        }
    });

    await suite.test('tenant default limits apply to other workspaces without workspace override', async () => {
        const configLedger: Array<{
            storageWorkspaceId: string;
            event: {
                eventType: string;
                configScope?: 'tenant' | 'workspace';
                dailyLimit?: number;
                monthlyLimit?: number;
            };
        }> = [];

        const repo = {
            async loadBudgetState() {
                return null;
            },
            async loadBudgetConfig(input: { tenantId: string; workspaceId: string }) {
                let tenantConfig: { dailyLimit: number; monthlyLimit: number; scope: 'tenant' | 'workspace' } | null = null;
                let workspaceConfig: { dailyLimit: number; monthlyLimit: number; scope: 'tenant' | 'workspace' } | null = null;

                for (const item of configLedger) {
                    if (item.event.eventType !== 'budget_limits_updated') {
                        continue;
                    }
                    if (item.storageWorkspaceId === '__tenant_budget_defaults__') {
                        tenantConfig = {
                            dailyLimit: item.event.dailyLimit ?? 0,
                            monthlyLimit: item.event.monthlyLimit ?? 0,
                            scope: 'tenant',
                        };
                    }
                    if (item.storageWorkspaceId === input.workspaceId) {
                        workspaceConfig = {
                            dailyLimit: item.event.dailyLimit ?? 0,
                            monthlyLimit: item.event.monthlyLimit ?? 0,
                            scope: 'workspace',
                        };
                    }
                }

                return workspaceConfig ?? tenantConfig;
            },
            async appendBudgetEvent(input: any) {
                configLedger.push({
                    storageWorkspaceId: input.storageWorkspaceId ?? input.workspaceId,
                    event: input.event,
                });
            },
        };

        const { app } = await createTestAppWithOptions({
            budgetStore: new Map(),
            repo,
        });

        try {
            const update = await app.inject({
                method: 'PUT',
                url: '/v1/workspaces/ws_001/budget/limits',
                payload: {
                    scope: 'tenant',
                    dailyLimit: 300,
                    monthlyLimit: 3000,
                },
            });
            assert.strictEqual(update.statusCode, 200);

            const inherited = await app.inject({
                method: 'GET',
                url: '/v1/workspaces/ws_002/budget/limits',
            });
            assert.strictEqual(inherited.statusCode, 200);
            const body = JSON.parse(inherited.body);
            assert.strictEqual(body.scope, 'tenant');
            assert.strictEqual(body.dailyLimit, 300);
            assert.strictEqual(body.monthlyLimit, 3000);
        } finally {
            await app.close();
        }
    });

    await suite.test('evaluate at 95% spend fires budget_alert_critical only', async () => {
        const events: any[] = [];
        const mockRepo = {
            async loadBudgetState(_input: any) { return null; },
            async loadBudgetConfig(_input: any) { return null; },
            async appendBudgetEvent(input: any) { events.push(input.event); },
        };
        const seededStore = new Map<any, any>();
        seededStore.set('ws_001', {
            dailySpent: 75,
            dailyLimit: 100,
            monthlySpent: 75,
            monthlyLimit: 1000,
            isHardStopActive: false,
            lastResetDaily: new Date().toISOString(),
        });
        const { app } = await createTestAppWithOptions({ budgetStore: seededStore, repo: mockRepo });
        try {
            const res = await app.inject({
                method: 'POST',
                url: '/v1/workspaces/ws_001/budget/evaluate',
                payload: { taskId: 'task_alert_critical', estimatedCost: 20 },
            });
            assert.strictEqual(res.statusCode, 200);
            assert.ok(
                events.some((e) => e.eventType === 'budget_alert_critical'),
                'critical alert should fire at 95% spend',
            );
            assert.ok(
                !events.some((e) => e.eventType === 'budget_alert_warn'),
                'warn alert must not fire when critical threshold crossed',
            );
            assert.ok(
                !events.some((e) => e.eventType === 'budget_alert_exceeded'),
                'exceeded alert must not fire at 95% spend',
            );
        } finally {
            await app.close();
        }
    });

    await suite.test('evaluate at 100% spend fires budget_alert_exceeded only', async () => {
        const events: any[] = [];
        const mockRepo = {
            async loadBudgetState(_input: any) { return null; },
            async loadBudgetConfig(_input: any) { return null; },
            async appendBudgetEvent(input: any) { events.push(input.event); },
        };
        const seededStore = new Map<any, any>();
        seededStore.set('ws_001', {
            dailySpent: 80,
            dailyLimit: 100,
            monthlySpent: 80,
            monthlyLimit: 1000,
            isHardStopActive: false,
            lastResetDaily: new Date().toISOString(),
        });
        const { app } = await createTestAppWithOptions({ budgetStore: seededStore, repo: mockRepo });
        try {
            const res = await app.inject({
                method: 'POST',
                url: '/v1/workspaces/ws_001/budget/evaluate',
                payload: { taskId: 'task_alert_exceeded', estimatedCost: 20 },
            });
            assert.strictEqual(res.statusCode, 200);
            assert.ok(
                events.some((e) => e.eventType === 'budget_alert_exceeded'),
                'exceeded alert should fire at 100% spend',
            );
            assert.ok(
                !events.some((e) => e.eventType === 'budget_alert_warn'),
                'warn alert must not fire when exceeded threshold crossed',
            );
            assert.ok(
                !events.some((e) => e.eventType === 'budget_alert_critical'),
                'critical alert must not fire when exceeded threshold crossed',
            );
        } finally {
            await app.close();
        }
    });
});
