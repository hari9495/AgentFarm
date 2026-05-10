/**
 * db-smoke.test.ts — agent-runtime real-DB smoke test
 *
 * Skip logic:
 *   - Skips if DATABASE_URL is not set.
 *   - Skips if DATABASE_URL contains 'localhost:5432' (dev DB) unless
 *     FORCE_DB_SMOKE=true is set — prevents accidental dev DB pollution.
 *   - Runs when DATABASE_URL contains ':5433' (test DB from docker-compose.test.yml)
 *     OR when FORCE_DB_SMOKE=true (e.g. GitHub Actions native service on port 5432).
 *
 * Cleanup: all rows created use a unique testRunId prefix; deleted in after().
 */

import { test, describe, after } from 'node:test';
import * as assert from 'node:assert';
import { PrismaClient } from '@prisma/client';

const dbUrl = process.env['DATABASE_URL'] ?? '';
const forceSmoke = process.env['FORCE_DB_SMOKE'] === 'true';
const isTestDb = dbUrl.includes(':5433') || forceSmoke;

const skipReason: string | undefined = !isTestDb
    ? 'DATABASE_URL is not pointing at the test DB (port 5433). Set FORCE_DB_SMOKE=true to override.'
    : undefined;

const prisma = isTestDb
    ? new PrismaClient({ datasources: { db: { url: dbUrl } } })
    : null;

const testRunId = `smoke_${Date.now()}`;

describe('agent-runtime db-smoke', { skip: skipReason }, () => {
    after(async () => {
        if (!prisma) return;
        await prisma.agentShortTermMemory.deleteMany({
            where: { taskId: { startsWith: `task_${testRunId}` } },
        });
        await prisma.taskExecutionRecord.deleteMany({
            where: { taskId: { startsWith: `task_${testRunId}` } },
        });
        await prisma.$disconnect();
    });

    test('Prisma can connect ($queryRaw SELECT 1)', async () => {
        assert.ok(prisma, 'prisma should be initialised');
        const result = await prisma!.$queryRaw<[{ result: number }]>`SELECT 1 AS result`;
        assert.equal(Number(result[0]?.result), 1, 'SELECT 1 should return 1');
    });

    test('Can create AgentShortTermMemory row and read it back', async () => {
        assert.ok(prisma);
        const created = await prisma!.agentShortTermMemory.create({
            data: {
                workspaceId: `ws_${testRunId}`,
                tenantId: `tenant_${testRunId}`,
                taskId: `task_${testRunId}_mem`,
                actionsTaken: ['read_file', 'write_file'],
                approvalOutcomes: [],
                connectorsUsed: ['github'],
                llmProvider: 'openai',
                executionStatus: 'success',
                summary: `Smoke test memory for run ${testRunId}`,
                correlationId: `corr_${testRunId}`,
            },
        });

        assert.ok(created.id, 'id should be set (cuid)');
        assert.equal(created.taskId, `task_${testRunId}_mem`);
        assert.equal(created.executionStatus, 'success');

        const found = await prisma!.agentShortTermMemory.findUnique({
            where: { id: created.id },
        });
        assert.ok(found, 'should find AgentShortTermMemory by id');
        assert.equal(found!.summary, created.summary);
        assert.equal(found!.llmProvider, 'openai');
    });

    test('Can create TaskExecutionRecord row and read it back', async () => {
        assert.ok(prisma);
        const created = await prisma!.taskExecutionRecord.create({
            data: {
                botId: `bot_${testRunId}`,
                tenantId: `tenant_${testRunId}`,
                workspaceId: `ws_${testRunId}`,
                taskId: `task_${testRunId}_rec`,
                modelProvider: 'openai',
                modelProfile: 'gpt-4o',
                latencyMs: 120,
                outcome: 'success',
                executedAt: new Date(),
            },
        });

        assert.ok(created.id, 'id should be set (cuid)');
        assert.equal(created.outcome, 'success');
        assert.equal(created.taskId, `task_${testRunId}_rec`);
        assert.equal(created.modelProvider, 'openai');

        const found = await prisma!.taskExecutionRecord.findUnique({
            where: { id: created.id },
        });
        assert.ok(found, 'should find TaskExecutionRecord by id');
        assert.equal(found!.modelProfile, 'gpt-4o');
        assert.equal(found!.latencyMs, 120);
    });
});
