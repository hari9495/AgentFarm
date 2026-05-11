import test from 'node:test';
import assert from 'node:assert/strict';
import {
    listListings,
    installSkill,
    uninstallSkill,
    publishListing,
} from './marketplace-service.js';

// ---------------------------------------------------------------------------
// Mock data helpers
// ---------------------------------------------------------------------------

const listingRecord = (overrides: Record<string, unknown> = {}) => ({
    id: 'listing_1',
    skillId: 'skill_1',
    name: 'My Skill',
    description: 'Does things',
    version: '1.0.0',
    author: 'AgentFarm',
    permissions: ['read'],
    source: 'https://example.com',
    tags: ['automation', 'productivity'],
    status: 'active',
    createdAt: new Date('2026-05-01T00:00:00Z'),
    updatedAt: new Date('2026-05-01T00:00:00Z'),
    ...overrides,
});

const installRecord = (overrides: Record<string, unknown> = {}) => ({
    id: 'install_1',
    tenantId: 'tenant_1',
    skillId: 'skill_1',
    listingId: 'listing_1',
    approvedPermissions: ['read'],
    pinVersion: false,
    status: 'installed',
    installedAt: new Date('2026-05-01T00:00:00Z'),
    uninstalledAt: null,
    ...overrides,
});

// ---------------------------------------------------------------------------
// 1. listListings — returns active listings by default
// ---------------------------------------------------------------------------

test('listListings — returns active listings by default', async () => {
    let capturedWhere: Record<string, unknown> | undefined;
    const prisma: any = {
        marketplaceListing: {
            findMany: async ({ where }: any) => {
                capturedWhere = where;
                return [listingRecord()];
            },
        },
    };

    const result = await listListings(prisma);
    assert.equal(result.length, 1);
    assert.deepEqual(capturedWhere, { status: 'active' });
});

// ---------------------------------------------------------------------------
// 2. listListings — filters by tag in JS (not SQL)
// ---------------------------------------------------------------------------

test('listListings — filters by tag in JS (not SQL)', async () => {
    const records = [
        listingRecord({ id: 'l1', skillId: 'sk1', tags: ['automation'] }),
        listingRecord({ id: 'l2', skillId: 'sk2', tags: ['analytics'] }),
        listingRecord({ id: 'l3', skillId: 'sk3', tags: ['automation', 'analytics'] }),
    ];
    let capturedWhere: Record<string, unknown> | undefined;
    const prisma: any = {
        marketplaceListing: {
            findMany: async ({ where }: any) => {
                capturedWhere = where;
                return records;
            },
        },
    };

    const result = await listListings(prisma, { tag: 'automation' }) as any[];
    assert.equal(result.length, 2);
    assert.ok(result.every((r: any) => r.tags.includes('automation')));
    // SQL query only uses status filter — tag filtering is done in JS
    assert.deepEqual(capturedWhere, { status: 'active' });
});

// ---------------------------------------------------------------------------
// 3. listListings — filters by custom status
// ---------------------------------------------------------------------------

test('listListings — filters by custom status', async () => {
    let capturedWhere: Record<string, unknown> | undefined;
    const prisma: any = {
        marketplaceListing: {
            findMany: async ({ where }: any) => {
                capturedWhere = where;
                return [listingRecord({ status: 'deprecated' })];
            },
        },
    };

    const result = await listListings(prisma, { status: 'deprecated' });
    assert.equal(result.length, 1);
    assert.deepEqual(capturedWhere, { status: 'deprecated' });
});

// ---------------------------------------------------------------------------
// 4. installSkill — throws 404 when listing not found
// ---------------------------------------------------------------------------

test('installSkill — throws 404 when listing not found', async () => {
    const prisma: any = {
        marketplaceListing: {
            findUnique: async () => null,
        },
    };

    await assert.rejects(
        () => installSkill(prisma, { tenantId: 'tenant_1', skillId: 'missing_skill' }),
        (err: any) => {
            assert.equal(err.statusCode, 404);
            assert.equal(err.message, 'listing_not_found');
            return true;
        },
    );
});

// ---------------------------------------------------------------------------
// 5. installSkill — throws 404 when listing is deprecated/removed
// ---------------------------------------------------------------------------

test('installSkill — throws 404 when listing is deprecated/removed', async () => {
    const prisma: any = {
        marketplaceListing: {
            findUnique: async () => listingRecord({ status: 'deprecated' }),
        },
    };

    await assert.rejects(
        () => installSkill(prisma, { tenantId: 'tenant_1', skillId: 'skill_1' }),
        (err: any) => {
            assert.equal(err.statusCode, 404);
            return true;
        },
    );
});

// ---------------------------------------------------------------------------
// 6. installSkill — throws 409 when already installed
// ---------------------------------------------------------------------------

test('installSkill — throws 409 when already installed', async () => {
    const prisma: any = {
        marketplaceListing: {
            findUnique: async () => listingRecord(),
        },
        marketplaceInstall: {
            findUnique: async () => installRecord({ status: 'installed' }),
        },
    };

    await assert.rejects(
        () => installSkill(prisma, { tenantId: 'tenant_1', skillId: 'skill_1' }),
        (err: any) => {
            assert.equal(err.statusCode, 409);
            assert.equal(err.message, 'already_installed');
            return true;
        },
    );
});

// ---------------------------------------------------------------------------
// 7. installSkill — creates new MarketplaceInstall on first install
// ---------------------------------------------------------------------------

test('installSkill — creates new MarketplaceInstall on first install', async () => {
    let createData: Record<string, unknown> | undefined;
    const prisma: any = {
        marketplaceListing: {
            findUnique: async () => listingRecord(),
        },
        marketplaceInstall: {
            findUnique: async () => null,
            create: async ({ data }: any) => {
                createData = data;
                return { ...installRecord(), ...data };
            },
        },
    };
    // suppress runtime sync
    (globalThis as any).fetch = async () => ({ ok: true });

    const result: any = await installSkill(prisma, {
        tenantId: 'tenant_1',
        skillId: 'skill_1',
        approvedPermissions: ['read', 'write'],
    });

    assert.equal(result.status, 'installed');
    assert.deepEqual(createData?.['approvedPermissions'], ['read', 'write']);
    assert.equal(createData?.['listingId'], 'listing_1');
});

// ---------------------------------------------------------------------------
// 8. installSkill — re-installs (updates status) when previously uninstalled
// ---------------------------------------------------------------------------

test('installSkill — re-installs when previously uninstalled', async () => {
    let updateData: Record<string, unknown> | undefined;
    const prisma: any = {
        marketplaceListing: {
            findUnique: async () => listingRecord(),
        },
        marketplaceInstall: {
            findUnique: async () => installRecord({ status: 'uninstalled', uninstalledAt: new Date() }),
            update: async ({ data }: any) => {
                updateData = data;
                return { ...installRecord(), ...data };
            },
        },
    };
    (globalThis as any).fetch = async () => ({ ok: true });

    const result: any = await installSkill(prisma, { tenantId: 'tenant_1', skillId: 'skill_1' });

    assert.equal(result.status, 'installed');
    assert.equal(updateData?.['status'], 'installed');
    assert.equal(updateData?.['uninstalledAt'], null);
});

// ---------------------------------------------------------------------------
// 9. installSkill — fires runtime sync (fetch) without throwing on failure
// ---------------------------------------------------------------------------

test('installSkill — fires runtime sync without throwing on failure', async (t) => {
    t.mock.method(globalThis, 'fetch', async () => {
        throw new Error('network error');
    });

    const prisma: any = {
        marketplaceListing: {
            findUnique: async () => listingRecord(),
        },
        marketplaceInstall: {
            findUnique: async () => null,
            create: async ({ data }: any) => ({ ...installRecord(), ...data }),
        },
    };

    // Should not throw even though fetch will fail
    const result: any = await installSkill(prisma, { tenantId: 'tenant_1', skillId: 'skill_1' });
    assert.equal(result.status, 'installed');

    // Drain microtasks to allow catch handler to run without surfacing errors
    await new Promise((resolve) => setImmediate(resolve));
});

// ---------------------------------------------------------------------------
// 10. uninstallSkill — throws 404 when install not found
// ---------------------------------------------------------------------------

test('uninstallSkill — throws 404 when install not found', async () => {
    const prisma: any = {
        marketplaceInstall: {
            findUnique: async () => null,
        },
    };

    await assert.rejects(
        () => uninstallSkill(prisma, { tenantId: 'tenant_1', skillId: 'skill_1' }),
        (err: any) => {
            assert.equal(err.statusCode, 404);
            assert.equal(err.message, 'install_not_found');
            return true;
        },
    );
});

// ---------------------------------------------------------------------------
// 11. uninstallSkill — throws 404 when already uninstalled
// ---------------------------------------------------------------------------

test('uninstallSkill — throws 404 when already uninstalled', async () => {
    const prisma: any = {
        marketplaceInstall: {
            findUnique: async () => installRecord({ status: 'uninstalled' }),
        },
    };

    await assert.rejects(
        () => uninstallSkill(prisma, { tenantId: 'tenant_1', skillId: 'skill_1' }),
        (err: any) => {
            assert.equal(err.statusCode, 404);
            return true;
        },
    );
});

// ---------------------------------------------------------------------------
// 12. uninstallSkill — updates status to 'uninstalled' and sets uninstalledAt
// ---------------------------------------------------------------------------

test('uninstallSkill — updates status to uninstalled and sets uninstalledAt', async () => {
    let updateData: Record<string, unknown> | undefined;
    const before = new Date();
    const prisma: any = {
        marketplaceInstall: {
            findUnique: async () => installRecord(),
            update: async ({ data }: any) => {
                updateData = data;
                return { ...installRecord(), ...data };
            },
        },
    };
    (globalThis as any).fetch = async () => ({ ok: true });

    const result: any = await uninstallSkill(prisma, { tenantId: 'tenant_1', skillId: 'skill_1' });

    assert.equal(result.status, 'uninstalled');
    assert.equal(updateData?.['status'], 'uninstalled');
    assert.ok(updateData?.['uninstalledAt'] instanceof Date);
    assert.ok((updateData?.['uninstalledAt'] as Date) >= before);
});

// ---------------------------------------------------------------------------
// 13. uninstallSkill — fires runtime sync without throwing on failure
// ---------------------------------------------------------------------------

test('uninstallSkill — fires runtime sync without throwing on failure', async (t) => {
    t.mock.method(globalThis, 'fetch', async () => {
        throw new Error('network error');
    });

    const prisma: any = {
        marketplaceInstall: {
            findUnique: async () => installRecord(),
            update: async ({ data }: any) => ({ ...installRecord(), ...data }),
        },
    };

    const result: any = await uninstallSkill(prisma, { tenantId: 'tenant_1', skillId: 'skill_1' });
    assert.equal(result.status, 'uninstalled');

    await new Promise((resolve) => setImmediate(resolve));
});

// ---------------------------------------------------------------------------
// 14. publishListing — creates new listing
// ---------------------------------------------------------------------------

test('publishListing — creates new listing', async () => {
    let capturedCreate: Record<string, unknown> | undefined;
    const prisma: any = {
        marketplaceListing: {
            upsert: async ({ create }: any) => {
                capturedCreate = create;
                return { ...listingRecord(), ...create };
            },
        },
    };
    (globalThis as any).fetch = async () => ({ ok: true });

    const result: any = await publishListing(prisma, {
        skillId: 'skill_new',
        name: 'New Skill',
        version: '1.0.0',
        tags: ['ai'],
    });

    assert.equal(result.skillId, 'skill_new');
    assert.equal(capturedCreate?.['skillId'], 'skill_new');
    assert.deepEqual(capturedCreate?.['tags'], ['ai']);
    assert.equal(capturedCreate?.['status'], 'active');
});

// ---------------------------------------------------------------------------
// 15. publishListing — upserts existing listing by skillId
// ---------------------------------------------------------------------------

test('publishListing — upserts existing listing by skillId', async () => {
    let capturedUpdate: Record<string, unknown> | undefined;
    let capturedWhere: Record<string, unknown> | undefined;
    const prisma: any = {
        marketplaceListing: {
            upsert: async ({ where, update }: any) => {
                capturedWhere = where;
                capturedUpdate = update;
                return { ...listingRecord(), ...update };
            },
        },
    };
    (globalThis as any).fetch = async () => ({ ok: true });

    await publishListing(prisma, {
        skillId: 'skill_1',
        name: 'Updated Skill',
        version: '2.0.0',
    });

    assert.deepEqual(capturedWhere, { skillId: 'skill_1' });
    assert.equal(capturedUpdate?.['name'], 'Updated Skill');
    assert.equal(capturedUpdate?.['version'], '2.0.0');
});

// ---------------------------------------------------------------------------
// 16. publishListing — fires runtime catalog sync
// ---------------------------------------------------------------------------

test('publishListing — fires runtime catalog sync', async (t) => {
    let fetchCalled = false;
    let fetchBody: Record<string, unknown> | undefined;

    t.mock.method(globalThis, 'fetch', async (_url: string, init: RequestInit) => {
        fetchCalled = true;
        fetchBody = JSON.parse(init.body as string);
        return { ok: true };
    });

    const prisma: any = {
        marketplaceListing: {
            upsert: async ({ create }: any) => ({ ...listingRecord(), ...create }),
        },
    };

    await publishListing(prisma, {
        skillId: 'skill_1',
        name: 'My Skill',
        version: '1.0.0',
        permissions: ['read'],
        source: 'https://example.com',
    });

    // Drain microtasks
    await new Promise((resolve) => setImmediate(resolve));

    assert.ok(fetchCalled, 'fetch should have been called for runtime sync');
    assert.equal(fetchBody?.['id'], 'skill_1');
    assert.equal(fetchBody?.['name'], 'My Skill');
    assert.equal(fetchBody?.['version'], '1.0.0');
});
