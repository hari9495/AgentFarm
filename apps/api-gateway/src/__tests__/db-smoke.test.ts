/**
 * db-smoke.test.ts — api-gateway real-DB smoke test
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

describe('api-gateway db-smoke', { skip: skipReason }, () => {
    after(async () => {
        if (!prisma) return;
        // Delete workspaces first (FK references tenant)
        await prisma.workspace.deleteMany({
            where: { name: { startsWith: `ws_${testRunId}` } },
        });
        await prisma.tenant.deleteMany({
            where: { name: { startsWith: `tenant_${testRunId}` } },
        });
        await prisma.$disconnect();
    });

    test('Prisma can connect ($queryRaw SELECT 1)', async () => {
        assert.ok(prisma, 'prisma should be initialised');
        const result = await prisma!.$queryRaw<[{ result: number }]>`SELECT 1 AS result`;
        assert.equal(Number(result[0]?.result), 1, 'SELECT 1 should return 1');
    });

    test('Can create a Tenant row and read it back', async () => {
        assert.ok(prisma);
        const created = await prisma!.tenant.create({
            data: { name: `tenant_${testRunId}_a` },
        });

        assert.ok(created.id, 'tenant.id should be set (cuid)');
        assert.equal(created.name, `tenant_${testRunId}_a`);
        assert.equal(created.status, 'pending', 'default status should be pending');

        const found = await prisma!.tenant.findUnique({ where: { id: created.id } });
        assert.ok(found, 'should find tenant by id');
        assert.equal(found!.id, created.id);
        assert.equal(found!.name, created.name);
    });

    test('Can create a Workspace linked to a Tenant and read it back', async () => {
        assert.ok(prisma);
        const tenant = await prisma!.tenant.create({
            data: { name: `tenant_${testRunId}_b` },
        });

        const workspace = await prisma!.workspace.create({
            data: {
                tenantId: tenant.id,
                name: `ws_${testRunId}_a`,
            },
        });

        assert.ok(workspace.id, 'workspace.id should be set (cuid)');
        assert.equal(workspace.tenantId, tenant.id, 'tenantId FK should match');
        assert.equal(workspace.name, `ws_${testRunId}_a`);
        assert.equal(workspace.status, 'pending', 'default workspace status should be pending');

        const found = await prisma!.workspace.findUnique({
            where: { id: workspace.id },
            include: { tenant: true },
        });

        assert.ok(found, 'should find workspace by id');
        assert.equal(found!.tenantId, tenant.id);
        assert.equal(found!.tenant.name, `tenant_${testRunId}_b`, 'included tenant name should match');
    });
});
