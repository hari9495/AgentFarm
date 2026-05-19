/**
 * hire-handler.test.ts — Sprint 5: Agent Hire → Provisioning Wire
 *
 * Tests for enrollAgentAfterPayment():
 *   1. success — creates a ProvisioningJob with status='queued'
 *   2. workspace not found — throws, no job created
 *   3. bot not found — throws, no job created
 *   4. idempotent — returns existing active job without creating a duplicate
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
// Helpers to build stub Prisma clients
// ---------------------------------------------------------------------------

function makePrisma(overrides: Partial<{
    workspaceFindFirst: unknown;
    botFindFirst: unknown;
    jobFindFirst: unknown;
    jobCreate: unknown;
}>): PrismaClient {
    const created: unknown[] = [];
    return {
        workspace: {
            findFirst: async () => overrides.workspaceFindFirst ?? null,
        },
        bot: {
            findFirst: async () => overrides.botFindFirst ?? null,
        },
        provisioningJob: {
            findFirst: async () => overrides.jobFindFirst ?? null,
            create: async (args: { data: Record<string, unknown> }) => {
                const job = { ...stubJob, ...args.data, id: 'job-new-001' };
                created.push(job);
                return job;
            },
        },
        _created: created,
    } as unknown as PrismaClient;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('enrollAgentAfterPayment', () => {

    test('success — creates a queued ProvisioningJob and returns hireRecord', async () => {
        const prisma = makePrisma({
            workspaceFindFirst: stubWorkspace,
            botFindFirst: stubBot,
            jobFindFirst: null, // no existing active job
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

        // Verify a job was actually created
        const internalPrisma = prisma as unknown as { _created: unknown[] };
        assert.equal(internalPrisma._created.length, 1);
    });

    test('workspace not found — throws, no job created', async () => {
        const prisma = makePrisma({
            workspaceFindFirst: null,
            botFindFirst: stubBot,
            jobFindFirst: null,
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

        const internalPrisma = prisma as unknown as { _created: unknown[] };
        assert.equal(internalPrisma._created.length, 0);
    });

    test('bot not found — throws, no job created', async () => {
        const prisma = makePrisma({
            workspaceFindFirst: stubWorkspace,
            botFindFirst: null,
            jobFindFirst: null,
        });

        await assert.rejects(
            () => enrollAgentAfterPayment({
                orderId: ORDER_ID,
                tenantId: TENANT_ID,
                planId: PLAN_ID,
                requestedBy: 'payment_webhook',
            }, prisma),
            (err: Error) => {
                assert.match(err.message, /No bot found/);
                return true;
            },
        );

        const internalPrisma = prisma as unknown as { _created: unknown[] };
        assert.equal(internalPrisma._created.length, 0);
    });

    test('idempotent — returns existing active job, no duplicate created', async () => {
        const activeJob = { ...stubJob, status: 'validating' as const };
        const prisma = makePrisma({
            workspaceFindFirst: stubWorkspace,
            botFindFirst: stubBot,
            jobFindFirst: activeJob, // existing active job
        });

        const result = await enrollAgentAfterPayment({
            orderId: ORDER_ID,
            tenantId: TENANT_ID,
            planId: PLAN_ID,
            requestedBy: 'payment_webhook',
        }, prisma);

        assert.equal(result.reused, true);
        assert.equal(result.jobId, activeJob.id);

        // No new job created
        const internalPrisma = prisma as unknown as { _created: unknown[] };
        assert.equal(internalPrisma._created.length, 0);
    });

});
