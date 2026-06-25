/**
 * Integration test (C1 + C2): GovernancePolicy store + publish lifecycle against
 * a real Postgres. OPA sync is exercised via an injected fetch spy (no live OPA
 * needed). Skips automatically when the database is unreachable.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { getActivePolicy, publishPolicy, nextVersion } from './policy-store.js';

const prisma = new PrismaClient();

async function dbReachable(): Promise<boolean> {
    try {
        await prisma.$queryRaw`SELECT 1`;
        return true;
    } catch {
        return false;
    }
}

const reachable = await dbReachable();
const maybe = reachable ? test : test.skip;
if (!reachable) {
    // eslint-disable-next-line no-console
    console.warn('[policy-store] database not reachable — skipping store integration tests.');
}

const TENANT = `itest-store-${Date.now()}`;

async function createDraft(version: number, rules: unknown[]) {
    return prisma.governancePolicy.create({
        data: {
            tenantId: TENANT,
            scope: 'tenant',
            scopeRef: '',
            version,
            status: 'draft',
            name: `policy v${version}`,
            rulesJson: rules as never,
            createdBy: 'itest',
            updatedBy: 'itest',
        },
    });
}

test.after(async () => {
    if (reachable) {
        await prisma.governancePolicy.deleteMany({ where: { tenantId: TENANT } });
    }
    await prisma.$disconnect();
});

maybe('C1: getActivePolicy returns null when no active policy exists', async () => {
    const found = await getActivePolicy(prisma, TENANT);
    assert.equal(found, null);
});

maybe('C1 + C2: publish flips draft to active and getActivePolicy returns it', async () => {
    const v1 = await createDraft(await nextVersion(prisma, TENANT), [
        { actionType: 'deploy_production', effect: 'require_approval' },
    ]);

    let pushedOverlay: unknown;
    const fetchSpy = (async (_url: string, init: { body: string }) => {
        pushedOverlay = JSON.parse(init.body);
        return { ok: true, status: 204, text: async () => '' };
    }) as unknown as typeof fetch;

    const { policy, archivedVersions } = await publishPolicy(prisma, v1.id, { fetchImpl: fetchSpy });
    assert.equal(policy.status, 'active');
    assert.equal(archivedVersions.length, 0, 'nothing to archive on first publish');

    // OPA overlay pushed with provenance + rules
    assert.equal((pushedOverlay as { policyId: string }).policyId, v1.id);
    assert.equal((pushedOverlay as { version: number }).version, v1.version);
    assert.equal((pushedOverlay as { rules: unknown[] }).rules.length, 1);

    const active = await getActivePolicy(prisma, TENANT);
    assert.equal(active?.id, v1.id);
    assert.equal(active?.rules[0]?.actionType, 'deploy_production');
});

maybe('C2: publishing a new version archives the prior active version', async () => {
    const prior = await getActivePolicy(prisma, TENANT);
    assert.ok(prior, 'precondition: an active policy from the previous test');

    const v2 = await createDraft(await nextVersion(prisma, TENANT), [
        { actionType: 'deploy_production', effect: 'deny' },
    ]);

    const { policy, archivedVersions } = await publishPolicy(prisma, v2.id, { skipOpaSync: true });
    assert.equal(policy.status, 'active');
    assert.equal(policy.version, v2.version);
    assert.ok(archivedVersions.includes(prior!.version), 'prior active version archived');

    // Only one active remains, and it is v2
    const active = await getActivePolicy(prisma, TENANT);
    assert.equal(active?.id, v2.id);
    assert.equal(active?.rules[0]?.effect, 'deny');

    const activeCount = await prisma.governancePolicy.count({
        where: { tenantId: TENANT, scope: 'tenant', scopeRef: '', status: 'active' },
    });
    assert.equal(activeCount, 1, 'exactly one active version per scope');
});
