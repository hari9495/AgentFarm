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
    /** Returned when the findFirst query contains `orderId` (step 3 idempotency). */
    orderJobFindFirst: unknown;
    /** Returned when the findFirst query contains `botId` (step 4b bot-level guard). */
    liveJobFindFirst: unknown;
    /** Returned for workspaceVm.findUnique — null means first agent (initial_provision). */
    workspaceVmFindUnique: unknown;
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
            // Distinguish the two findFirst calls by inspecting the where clause.
            findFirst: async (args: { where: Record<string, unknown> }) => {
                if ('orderId' in args.where) {
                    return overrides.orderJobFindFirst ?? null;
                }
                // botId + status.notIn — the bot-level live-job guard
                return overrides.liveJobFindFirst ?? null;
            },
            create: async (args: { data: Record<string, unknown> }) => {
                const job = { ...stubJob, ...args.data, id: 'job-new-001' };
                created.push({ _type: 'job', ...job });
                return job;
            },
        },
        workspaceVm: {
            // null → first agent in workspace (initial_provision)
            // non-null → VM already exists (vm_resize)
            findUnique: async () => overrides.workspaceVmFindUnique ?? null,
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
            botFindFirst: stubBot,          // bot already exists for this role
            orderJobFindFirst: null,        // no prior job for this orderId
            liveJobFindFirst: null,         // no live job for this bot
            workspaceVmFindUnique: { vmSize: 'Standard_B2s' },  // VM exists → vm_resize
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
        // VM already exists → resize, not initial provision
        assert.equal((prisma._created[0] as any).runtimeTier, 'vm_resize');
    });

    test('new role — creates bot when none exists for the purchased plan role', async () => {
        const testerPlan = { roleType: 'tester_agent' };
        const prisma = makePrisma({
            workspaceFindFirst: stubWorkspace,
            planFindUnique: testerPlan,
            botFindFirst: null,          // no tester_agent bot yet
            orderJobFindFirst: null,
            liveJobFindFirst: null,
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
            orderJobFindFirst: existingJob,  // job for this orderId already exists
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
            orderJobFindFirst: null,
            liveJobFindFirst: null,
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
            orderJobFindFirst: null,
            liveJobFindFirst: null,
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

    test('runtimeTier=initial_provision — first agent in workspace, no WorkspaceVm yet', async () => {
        const prisma = makePrisma({
            workspaceFindFirst: stubWorkspace,
            planFindUnique: stubPlan,
            botFindFirst: null,             // no bot yet
            orderJobFindFirst: null,
            liveJobFindFirst: null,
            workspaceVmFindUnique: null,    // no VM exists → initial_provision
        });

        const result = await enrollAgentAfterPayment({
            orderId: 'ord-first-001',
            tenantId: TENANT_ID,
            planId: PLAN_ID,
            requestedBy: 'payment_webhook',
        }, prisma);

        assert.equal(result.reused, false);
        assert.equal(prisma._created.length, 2);  // bot + job
        assert.equal((prisma._created[0] as any)._type, 'bot');
        assert.equal((prisma._created[1] as any)._type, 'job');
        assert.equal((prisma._created[1] as any).runtimeTier, 'initial_provision');
    });

    test('runtimeTier=vm_resize — second agent added, WorkspaceVm already exists', async () => {
        const existingVm = { vmSize: 'Standard_B2s' };
        const testerPlan = { roleType: 'tester_agent' };
        const prisma = makePrisma({
            workspaceFindFirst: stubWorkspace,
            planFindUnique: testerPlan,
            botFindFirst: null,             // no tester bot yet
            orderJobFindFirst: null,
            liveJobFindFirst: null,
            workspaceVmFindUnique: existingVm,  // VM already exists → resize
        });

        const result = await enrollAgentAfterPayment({
            orderId: 'ord-tester-002',
            tenantId: TENANT_ID,
            planId: 'plan-tester-001',
            requestedBy: 'payment_webhook',
        }, prisma);

        assert.equal(result.reused, false);
        assert.equal(prisma._created.length, 2);  // bot + job
        assert.equal((prisma._created[0] as any)._type, 'bot');
        assert.equal((prisma._created[1] as any)._type, 'job');
        assert.equal((prisma._created[1] as any).runtimeTier, 'vm_resize');
    });

    test('repeated purchase — same plan bought again reuses live job, no new provisioning cycle', async () => {
        // Simulates buying the same developer_agent plan a second (or 10th) time.
        // The bot already exists and has a live (non-failed) ProvisioningJob.
        const liveJob = { id: 'job-live-001', botId: BOT_ID };
        const prisma = makePrisma({
            workspaceFindFirst: stubWorkspace,
            planFindUnique: stubPlan,            // roleType = 'developer_agent'
            botFindFirst: stubBot,               // bot already exists
            orderJobFindFirst: null,             // this new orderId has no prior job
            liveJobFindFirst: liveJob,           // but bot already has a live job
        });

        const result = await enrollAgentAfterPayment({
            orderId: 'ord-repeat-002',           // fresh orderId — different from prior purchases
            tenantId: TENANT_ID,
            planId: PLAN_ID,
            requestedBy: 'payment_webhook',
        }, prisma);

        // Must be reused — no new Azure provisioning cycle
        assert.equal(result.reused, true);
        assert.equal(result.jobId, liveJob.id);
        assert.equal(result.botId, BOT_ID);

        // Nothing was created — neither a new bot nor a new job
        assert.equal(prisma._created.length, 0);
    });

});
