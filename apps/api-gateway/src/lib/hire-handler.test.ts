/**
 * hire-handler.test.ts
 *
 * Tests for enrollAgentAfterPayment():
 *   1. success — finds existing bot by role, creates ProvisioningJob
 *   2. new role — creates bot when none exists for the purchased role, then creates job
 *   3. workspace not found — throws, nothing created
 *   4. idempotent — returns existing job for the same orderId without duplicating
 *   5. multi-agent isolation — different plan roles produce separate bots and jobs
 */

import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { enrollAgentAfterPayment } from './hire-handler.js';
import type { PrismaClient } from '@prisma/client';
import { CONTRACT_VERSIONS } from '@agentfarm/shared-types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TENANT_ID = 'tenant-hire-001';
const WORKSPACE_ID = 'ws-hire-001';
const BOT_ID = 'bot-hire-001';
const ORDER_ID = 'ord-hire-001';
const PLAN_ID = 'plan-hire-001';

const stubWorkspace = {
    id: WORKSPACE_ID,
    tenantId: TENANT_ID,
    name: 'Hire Workspace',
    status: 'pending',
    createdAt: new Date(),
};

const stubPlan = {
    roleType: 'developer_agent',
};

const stubBot = {
    id: BOT_ID,
    workspaceId: WORKSPACE_ID,
    role: 'developer_agent',
    status: 'created',
    createdAt: new Date(),
    updatedAt: new Date(),
};

const stubJob = {
    id: 'job-hire-001',
    tenantId: TENANT_ID,
    workspaceId: WORKSPACE_ID,
    botId: BOT_ID,
    planId: PLAN_ID,
    runtimeTier: 'dedicated_vm',
    roleType: 'developer_agent',
    correlationId: 'corr_hire_ord-hire-001_123',
    triggerSource: 'payment_webhook',
    status: 'queued' as const,
    requestedBy: 'payment_webhook',
    requestedAt: new Date(),
    orderId: ORDER_ID,
    triggeredBy: 'billing',
    metadata: '{"source":"payment_webhook"}',
    createdAt: new Date(),
    updatedAt: new Date(),
    startedAt: null,
    completedAt: null,
    failureReason: null,
    remediationHint: null,
    cleanupResult: null,
    failedAt: null,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePrisma(overrides: Partial<{
    workspaceFindFirst: unknown;
    planFindUnique: unknown;
    botFindFirst: unknown;
    botCreate: unknown;
    jobFindFirst: unknown;
}>): PrismaClient & { _created: unknown[] } {
    const created: unknown[] = [];
    return {
        workspace: {
            findFirst: async () => overrides.workspaceFindFirst ?? null,
        },
        plan: {
            findUnique: async () => overrides.planFindUnique ?? stubPlan,
        },
        bot: {
            findFirst: async () => overrides.botFindFirst ?? null,
            create: async (args: { data: Record<string, unknown> }) => {
                const bot = overrides.botCreate ?? {
                    id: 'bot-new-001',
                    workspaceId: args.data['workspaceId'],
                    role: args.data['role'],
                    status: 'created',
                };
                created.push({ _type: 'bot', ...(bot as object) });
                return bot;
            },
        },
        provisioningJob: {
            findFirst: async () => overrides.jobFindFirst ?? null,
            create: async (args: { data: Record<string, unknown> }) => {
                const job = { ...stubJob, ...args.data, id: 'job-new-001' };
                created.push({ _type: 'job', ...job });
                return job;
            },
        },
        _created: created,
    } as unknown as PrismaClient & { _created: unknown[] };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('enrollAgentAfterPayment', () => {

    test('success — finds bot by plan role, creates queued ProvisioningJob', async () => {
        const prisma = makePrisma({
            workspaceFindFirst: stubWorkspace,
            planFindUnique: stubPlan,
            botFindFirst: stubBot,   // bot already exists for this role
            jobFindFirst: null,      // no prior job for this orderId
        });

        const result = await enrollAgentAfterPayment({
            orderId: ORDER_ID,
            tenantId: TENANT_ID,
            planId: PLAN_ID,
            requestedBy: 'payment_webhook',
        }, prisma);

        assert.equal(result.botId, BOT_ID);
        assert.equal(result.workspaceId, WORKSPACE_ID);
        assert.equal(result.reused, false);
        assert.equal(result.hireRecord.contractVersion, CONTRACT_VERSIONS.AGENT_HIRE);
        assert.equal(result.hireRecord.triggerSource, 'payment_webhook');
        assert.equal(result.hireRecord.tenantId, TENANT_ID);
        assert.equal(result.hireRecord.orderId, ORDER_ID);

        // Only the provisioning job was created (bot already existed)
        assert.equal(prisma._created.length, 1);
        assert.equal((prisma._created[0] as any)._type, 'job');
    });

    test('new role — creates bot when none exists for the purchased plan role', async () => {
        const testerPlan = { roleType: 'tester_agent' };
        const prisma = makePrisma({
            workspaceFindFirst: stubWorkspace,
            planFindUnique: testerPlan,
            botFindFirst: null,   // no tester_agent bot yet
            jobFindFirst: null,
        });

        const result = await enrollAgentAfterPayment({
            orderId: 'ord-tester-001',
            tenantId: TENANT_ID,
            planId: 'plan-tester-001',
            requestedBy: 'payment_webhook',
        }, prisma);

        assert.equal(result.reused, false);

        // Bot was created, then provisioning job was created
        assert.equal(prisma._created.length, 2);
        assert.equal((prisma._created[0] as any)._type, 'bot');
        assert.equal((prisma._created[0] as any).role, 'tester_agent');
        assert.equal((prisma._created[1] as any)._type, 'job');
        assert.equal((prisma._created[1] as any).roleType, 'tester_agent');
    });

    test('workspace not found — throws, nothing created', async () => {
        const prisma = makePrisma({
            workspaceFindFirst: null,
        });

        await assert.rejects(
            () => enrollAgentAfterPayment({
                orderId: ORDER_ID,
                tenantId: TENANT_ID,
                planId: PLAN_ID,
                requestedBy: 'payment_webhook',
            }, prisma),
            (err: Error) => {
                assert.match(err.message, /No workspace found/);
                return true;
            },
        );

        assert.equal(prisma._created.length, 0);
    });

    test('idempotent — returns existing job for the same orderId without creating a duplicate', async () => {
        const existingJob = { id: 'job-existing-001', botId: BOT_ID };
        const prisma = makePrisma({
            workspaceFindFirst: stubWorkspace,
            planFindUnique: stubPlan,
            jobFindFirst: existingJob,  // job for this orderId already exists
        });

        const result = await enrollAgentAfterPayment({
            orderId: ORDER_ID,
            tenantId: TENANT_ID,
            planId: PLAN_ID,
            requestedBy: 'payment_webhook',
        }, prisma);

        assert.equal(result.reused, true);
        assert.equal(result.jobId, existingJob.id);
        assert.equal(result.botId, BOT_ID);

        // No bot or job was created
        assert.equal(prisma._created.length, 0);
    });

    test('multi-agent — developer and tester plans target different bots', async () => {
        const devBot = { id: 'bot-dev-001', workspaceId: WORKSPACE_ID, role: 'developer_agent', status: 'active' };

        // First call: developer_agent plan — bot already exists
        const prisma1 = makePrisma({
            workspaceFindFirst: stubWorkspace,
            planFindUnique: { roleType: 'developer_agent' },
            botFindFirst: devBot,
            jobFindFirst: null,
        });
        const devResult = await enrollAgentAfterPayment({
            orderId: 'ord-dev-001',
            tenantId: TENANT_ID,
            planId: 'plan-dev',
            requestedBy: 'payment_webhook',
        }, prisma1);

        assert.equal(devResult.botId, devBot.id);
        assert.equal(prisma1._created.length, 1);  // only job, bot existed
        assert.equal((prisma1._created[0] as any)._type, 'job');

        // Second call: tester_agent plan — no bot exists yet for this role
        const prisma2 = makePrisma({
            workspaceFindFirst: stubWorkspace,
            planFindUnique: { roleType: 'tester_agent' },
            botFindFirst: null,    // no tester bot yet
            botCreate: { id: 'bot-tester-001', workspaceId: WORKSPACE_ID, role: 'tester_agent', status: 'created' },
            jobFindFirst: null,
        });
        const testerResult = await enrollAgentAfterPayment({
            orderId: 'ord-tester-001',
            tenantId: TENANT_ID,
            planId: 'plan-tester',
            requestedBy: 'payment_webhook',
        }, prisma2);

        assert.equal(testerResult.botId, 'bot-tester-001');
        assert.notEqual(testerResult.botId, devResult.botId);  // different bots
        assert.equal(prisma2._created.length, 2);  // bot + job both created
        assert.equal((prisma2._created[0] as any)._type, 'bot');
        assert.equal((prisma2._created[1] as any)._type, 'job');
    });

});
