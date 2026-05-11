import test from 'node:test';
import assert from 'node:assert/strict';
import { snapshotBotConfig, applyBotConfigVersion } from './bot-versioning.js';

// ── Mock helpers ─────────────────────────────────────────────────────────────

const makeBot = (overrides: Record<string, unknown> = {}) => ({
    id: 'bot_1',
    role: 'developer',
    status: 'active',
    workspaceId: 'ws_1',
    ...overrides,
});

const makeVersion = (overrides: Record<string, unknown> = {}) => ({
    id: 'ver_1',
    botId: 'bot_1',
    tenantId: 'tenant_1',
    versionNumber: 1,
    role: 'developer',
    status: 'active',
    roleVersion: null,
    policyPackVersion: null,
    brainConfig: null,
    changeNote: null,
    createdBy: 'user_1',
    createdAt: new Date('2026-05-01T00:00:00Z'),
    ...overrides,
});

type MockPrismaOpts = {
    bot?: ReturnType<typeof makeBot> | null;
    existingVersions?: ReturnType<typeof makeVersion>[];
    findVersion?: ReturnType<typeof makeVersion> | null;
    onBotConfigVersionCreate?: (data: Record<string, unknown>) => void;
    onBotUpdate?: (data: Record<string, unknown>) => void;
};

const makePrisma = (opts: MockPrismaOpts = {}) => {
    const {
        bot = makeBot(),
        existingVersions = [],
        findVersion = makeVersion(),
        onBotConfigVersionCreate,
        onBotUpdate,
    } = opts;

    const createdVersions: ReturnType<typeof makeVersion>[] = [];

    return {
        bot: {
            findUnique: async () => bot,
            update: async ({ data }: { data: Record<string, unknown> }) => {
                if (onBotUpdate) onBotUpdate(data);
                return makeBot({ ...data });
            },
        },
        botConfigVersion: {
            aggregate: async () => ({
                _max: {
                    versionNumber:
                        existingVersions.length > 0
                            ? Math.max(...existingVersions.map((v) => v.versionNumber))
                            : null,
                },
            }),
            findUnique: async ({ where }: { where: { id: string } }) => {
                if (where.id === findVersion?.id) return findVersion;
                return null;
            },
            create: async ({ data }: { data: Record<string, unknown> }) => {
                const ver = makeVersion({
                    ...data,
                    versionNumber: data['versionNumber'],
                    createdAt: new Date(),
                });
                createdVersions.push(ver);
                if (onBotConfigVersionCreate) onBotConfigVersionCreate(data);
                return ver;
            },
        },
        _createdVersions: createdVersions,
    } as any;
};

// ── Tests ─────────────────────────────────────────────────────────────────────

// 1. snapshotBotConfig — versionNumber 1 when no prior versions
test('snapshotBotConfig — versionNumber 1 when no prior versions', async () => {
    const prisma = makePrisma({ existingVersions: [] });
    const result = await snapshotBotConfig(prisma, 'bot_1', 'tenant_1', 'user_1');
    assert.equal(result.versionNumber, 1);
});

// 2. snapshotBotConfig — increments to MAX + 1 when versions exist
test('snapshotBotConfig — increments to MAX + 1 when versions exist', async () => {
    const prisma = makePrisma({
        existingVersions: [makeVersion({ versionNumber: 3 }), makeVersion({ versionNumber: 1 })],
    });
    const result = await snapshotBotConfig(prisma, 'bot_1', 'tenant_1', 'user_1');
    assert.equal(result.versionNumber, 4);
});

// 3. snapshotBotConfig — captures current bot field values correctly
test('snapshotBotConfig — captures current bot field values correctly', async () => {
    let captured: Record<string, unknown> = {};
    const prisma = makePrisma({
        bot: makeBot({ role: 'tester', status: 'paused' }),
        onBotConfigVersionCreate: (data) => { captured = data; },
    });
    await snapshotBotConfig(prisma, 'bot_1', 'tenant_1', 'user_99');
    assert.equal(captured['role'], 'tester');
    assert.equal(captured['status'], 'paused');
    assert.equal(captured['createdBy'], 'user_99');
    assert.equal(captured['tenantId'], 'tenant_1');
    assert.equal(captured['botId'], 'bot_1');
});

// 4. snapshotBotConfig — stores changeNote when provided
test('snapshotBotConfig — stores changeNote when provided', async () => {
    let captured: Record<string, unknown> = {};
    const prisma = makePrisma({ onBotConfigVersionCreate: (data) => { captured = data; } });
    await snapshotBotConfig(prisma, 'bot_1', 'tenant_1', 'user_1', 'manual checkpoint');
    assert.equal(captured['changeNote'], 'manual checkpoint');
});

// 5. applyBotConfigVersion — throws 404 when version not found
test('applyBotConfigVersion — throws 404 when version not found', async () => {
    const prisma = makePrisma({ findVersion: null });
    await assert.rejects(
        () => applyBotConfigVersion(prisma, 'bot_1', 'tenant_1', 'ver_missing', 'user_1'),
        (err: any) => {
            assert.equal(err.statusCode, 404);
            return true;
        },
    );
});

// 6. applyBotConfigVersion — throws 404 on tenantId mismatch
test('applyBotConfigVersion — throws 404 on tenantId mismatch', async () => {
    const prisma = makePrisma({ findVersion: makeVersion({ tenantId: 'other_tenant' }) });
    await assert.rejects(
        () => applyBotConfigVersion(prisma, 'bot_1', 'tenant_1', 'ver_1', 'user_1'),
        (err: any) => {
            assert.equal(err.statusCode, 404);
            return true;
        },
    );
});

// 7. applyBotConfigVersion — snapshots current state before applying restore
test('applyBotConfigVersion — snapshots current state before applying restore', async () => {
    const snapshotNotes: string[] = [];
    const prisma = makePrisma({
        findVersion: makeVersion({ versionNumber: 2 }),
        onBotConfigVersionCreate: (data) => {
            if (data['changeNote']) snapshotNotes.push(data['changeNote'] as string);
        },
    });
    await applyBotConfigVersion(prisma, 'bot_1', 'tenant_1', 'ver_1', 'user_1');
    assert.ok(
        snapshotNotes.some((n) => n.includes('Restored to version')),
        `Expected a "Restored to version" snapshot note, got: ${JSON.stringify(snapshotNotes)}`,
    );
});

// 8. applyBotConfigVersion — updates Bot row with version's field values
test('applyBotConfigVersion — updates Bot row with version field values', async () => {
    let updatedData: Record<string, unknown> = {};
    const prisma = makePrisma({
        findVersion: makeVersion({ role: 'qa_engineer', status: 'paused' }),
        onBotUpdate: (data) => { updatedData = data; },
    });
    await applyBotConfigVersion(prisma, 'bot_1', 'tenant_1', 'ver_1', 'user_1');
    assert.equal(updatedData['role'], 'qa_engineer');
    assert.equal(updatedData['status'], 'paused');
});

// 9. applyBotConfigVersion — returns updated Bot row
test('applyBotConfigVersion — returns updated Bot row', async () => {
    const prisma = makePrisma({
        findVersion: makeVersion({ role: 'designer', status: 'active' }),
    });
    const result = await applyBotConfigVersion(prisma, 'bot_1', 'tenant_1', 'ver_1', 'user_1');
    assert.ok(result, 'should return updated Bot row');
    assert.ok('id' in result, 'returned row should have id');
});
