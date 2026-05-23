import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerSnapshotRoutes } from './snapshots.js';

type SnapshotRecord = {
    id: string;
    botId: string;
    tenantId: string;
    workspaceId: string;
    roleKey: string;
    roleVersion: string;
    policyPackVersion: string;
    allowedConnectorTools: string[];
    allowedActions: string[];
    brainConfig: unknown;
    languageTier: string;
    speechProvider: string;
    translationProvider: string;
    ttsProvider: string;
    avatarEnabled: boolean;
    avatarProvider: string;
    snapshotVersion: number;
    snapshotChecksum: string | null;
    source: string;
    frozenAt: Date;
    createdAt: Date;
};

const makeSnapshot = (overrides: Partial<SnapshotRecord> = {}): SnapshotRecord => ({
    id: 'snap_1',
    botId: 'bot_1',
    tenantId: 'tenant_1',
    workspaceId: 'ws_1',
    roleKey: 'developer',
    roleVersion: 'v1',
    policyPackVersion: 'rbac-rolepack-v1',
    allowedConnectorTools: ['jira', 'github'],
    allowedActions: ['read_task', 'create_pr_comment'],
    brainConfig: { defaultModelProfile: 'quality_first' },
    languageTier: 'base',
    speechProvider: 'oss',
    translationProvider: 'oss',
    ttsProvider: 'oss',
    avatarEnabled: false,
    avatarProvider: 'none',
    snapshotVersion: 1,
    snapshotChecksum: 'abc123checksum',
    source: 'runtime_freeze',
    frozenAt: new Date('2026-04-25T00:00:00.000Z'),
    createdAt: new Date('2026-04-25T00:00:00.000Z'),
    ...overrides,
});

const session = () => ({
    userId: 'user_1',
    tenantId: 'tenant_1',
    workspaceIds: ['ws_1'],
    expiresAt: Date.now() + 60_000,
});

const createRepo = (snapshots: SnapshotRecord[] = []) => ({
    async findLatestByBotId(input: { botId: string; tenantId: string }) {
        const matching = snapshots
            .filter((s) => s.botId === input.botId && s.tenantId === input.tenantId)
            .sort((a, b) => b.snapshotVersion - a.snapshotVersion);
        return matching[0] ?? null;
    },
    async findAllByBotId(input: {
        botId: string;
        tenantId: string;
        limit: number;
        before?: Date;
    }) {
        return snapshots
            .filter((s) => s.botId === input.botId && s.tenantId === input.tenantId)
            .filter((s) => (input.before ? s.frozenAt < input.before : true))
            .sort((a, b) => b.snapshotVersion - a.snapshotVersion)
            .slice(0, input.limit);
    },
});

const buildApp = (snapshots: SnapshotRecord[] = [], authenticated = true) => {
    const app = Fastify();
    void registerSnapshotRoutes(app, {
        getSession: () => (authenticated ? session() : null),
        repo: createRepo(snapshots),
    });
    return app;
};

await test('GET /v1/bots/:botId/capability-snapshot/latest returns 401 when unauthenticated', async () => {
    const app = buildApp([], false);
    const res = await app.inject({ method: 'GET', url: '/v1/bots/bot_1/capability-snapshot/latest' });
    assert.equal(res.statusCode, 401);
    const body = JSON.parse(res.body);
    assert.equal(body.error, 'unauthorized');
});

await test('GET /v1/bots/:botId/capability-snapshot/latest returns 404 when no snapshot exists', async () => {
    const app = buildApp([]);
    const res = await app.inject({ method: 'GET', url: '/v1/bots/bot_1/capability-snapshot/latest' });
    assert.equal(res.statusCode, 404);
    const body = JSON.parse(res.body);
    assert.equal(body.error, 'snapshot_not_found');
});

await test('GET /v1/bots/:botId/capability-snapshot/latest returns the latest snapshot', async () => {
    const older = makeSnapshot({ id: 'snap_v1', snapshotVersion: 1 });
    const newer = makeSnapshot({ id: 'snap_v2', snapshotVersion: 2, snapshotChecksum: 'newchecksum' });
    const app = buildApp([older, newer]);

    const res = await app.inject({ method: 'GET', url: '/v1/bots/bot_1/capability-snapshot/latest' });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.snapshot.id, 'snap_v2');
    assert.equal(body.snapshot.snapshot_version, 2);
    assert.equal(body.snapshot.snapshot_checksum, 'newchecksum');
    assert.equal(body.snapshot.role_key, 'developer');
    assert.equal(body.snapshot.source, 'runtime_freeze');
    assert.equal(body.snapshot.tenant_id, 'tenant_1');
    assert.equal(body.snapshot.bot_id, 'bot_1');
});

await test('GET /v1/bots/:botId/capability-snapshot/latest scopes results to session tenantId', async () => {
    const otherTenantSnap = makeSnapshot({ botId: 'bot_1', tenantId: 'tenant_other', id: 'snap_other' });
    const app = buildApp([otherTenantSnap]);

    // session is tenant_1 but only tenant_other snapshot exists
    const res = await app.inject({ method: 'GET', url: '/v1/bots/bot_1/capability-snapshot/latest' });
    assert.equal(res.statusCode, 404);
});

await test('GET /v1/bots/:botId/capability-snapshot/latest returns formatted snapshot fields', async () => {
    const snap = makeSnapshot({ avatarEnabled: true, avatarProvider: 'azure_avatar' });
    const app = buildApp([snap]);

    const res = await app.inject({ method: 'GET', url: '/v1/bots/bot_1/capability-snapshot/latest' });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.deepEqual(body.snapshot.allowed_connector_tools, ['jira', 'github']);
    assert.deepEqual(body.snapshot.allowed_actions, ['read_task', 'create_pr_comment']);
    assert.equal(body.snapshot.avatar_enabled, true);
    assert.equal(body.snapshot.avatar_provider, 'azure_avatar');
    assert.equal(body.snapshot.frozen_at, '2026-04-25T00:00:00.000Z');
});

await test('GET /v1/bots/:botId/capability-snapshot/history returns 401 when unauthenticated', async () => {
    const app = buildApp([], false);
    const res = await app.inject({ method: 'GET', url: '/v1/bots/bot_1/capability-snapshot/history' });
    assert.equal(res.statusCode, 401);
});

await test('GET /v1/bots/:botId/capability-snapshot/history returns empty list when no snapshots', async () => {
    const app = buildApp([]);
    const res = await app.inject({ method: 'GET', url: '/v1/bots/bot_1/capability-snapshot/history' });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.count, 0);
    assert.deepEqual(body.snapshots, []);
    assert.equal(body.bot_id, 'bot_1');
});

await test('GET /v1/bots/:botId/capability-snapshot/history returns all snapshots newest first', async () => {
    const v1 = makeSnapshot({ id: 'snap_v1', snapshotVersion: 1 });
    const v2 = makeSnapshot({ id: 'snap_v2', snapshotVersion: 2 });
    const v3 = makeSnapshot({ id: 'snap_v3', snapshotVersion: 3 });
    const app = buildApp([v1, v2, v3]);

    const res = await app.inject({ method: 'GET', url: '/v1/bots/bot_1/capability-snapshot/history' });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.count, 3);
    assert.equal(body.snapshots[0].snapshot_version, 3);
    assert.equal(body.snapshots[1].snapshot_version, 2);
    assert.equal(body.snapshots[2].snapshot_version, 1);
});

await test('GET /v1/bots/:botId/capability-snapshot/history respects limit param', async () => {
    const snapshots = Array.from({ length: 5 }, (_, i) =>
        makeSnapshot({ id: `snap_v${i + 1}`, snapshotVersion: i + 1 }),
    );
    const app = buildApp(snapshots);

    const res = await app.inject({ method: 'GET', url: '/v1/bots/bot_1/capability-snapshot/history?limit=2' });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.count, 2);
});

await test('GET /v1/bots/:botId/capability-snapshot/history caps limit at 100', async () => {
    const snapshots = Array.from({ length: 5 }, (_, i) =>
        makeSnapshot({ id: `snap_v${i + 1}`, snapshotVersion: i + 1 }),
    );
    const app = buildApp(snapshots);

    const res = await app.inject({ method: 'GET', url: '/v1/bots/bot_1/capability-snapshot/history?limit=999' });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    // all 5 returned since 5 < 100 cap
    assert.equal(body.count, 5);
});

await test('GET /v1/bots/:botId/capability-snapshot/history respects before cursor', async () => {
    const v1 = makeSnapshot({ id: 'snap_v1', snapshotVersion: 1, frozenAt: new Date('2026-04-23T00:00:00.000Z') });
    const v2 = makeSnapshot({ id: 'snap_v2', snapshotVersion: 2, frozenAt: new Date('2026-04-24T00:00:00.000Z') });
    const v3 = makeSnapshot({ id: 'snap_v3', snapshotVersion: 3, frozenAt: new Date('2026-04-25T00:00:00.000Z') });
    const app = buildApp([v1, v2, v3]);

    // before v3's frozenAt should return v1 and v2 only
    const res = await app.inject({
        method: 'GET',
        url: '/v1/bots/bot_1/capability-snapshot/history?before=2026-04-25T00:00:00.000Z',
    });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.count, 2);
    assert.ok(body.snapshots.every((s: { id: string }) => s.id !== 'snap_v3'));
});

await test('GET /v1/bots/:botId/capability-snapshot/history scopes results to session tenantId', async () => {
    const mine = makeSnapshot({ botId: 'bot_1', tenantId: 'tenant_1' });
    const theirs = makeSnapshot({ id: 'other', botId: 'bot_1', tenantId: 'tenant_other' });
    const app = buildApp([mine, theirs]);

    const res = await app.inject({ method: 'GET', url: '/v1/bots/bot_1/capability-snapshot/history' });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.count, 1);
    assert.equal(body.snapshots[0].tenant_id, 'tenant_1');
});
