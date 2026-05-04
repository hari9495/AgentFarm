// repro-packs.test.ts
// Sprint 4 — F9: Crash Recovery + Repro Pack Generator — route tests

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerReproPackRoutes } from './repro-packs.js';

// ---------------------------------------------------------------------------
// Test session helpers
// ---------------------------------------------------------------------------

type SessionContext = {
    userId: string;
    tenantId: string;
    workspaceIds: string[];
    scope?: 'customer' | 'internal';
    expiresAt: number;
};

function makeSession(overrides: Partial<SessionContext> = {}): SessionContext {
    return {
        userId: 'user-1',
        tenantId: 'tenant-1',
        workspaceIds: ['ws-1'],
        scope: 'customer',
        expiresAt: Date.now() + 3600_000,
        ...overrides,
    };
}

function buildApp(sessionOverride?: SessionContext | null) {
    const app = Fastify({ logger: false });
    registerReproPackRoutes(app, {
        getSession: () =>
            sessionOverride !== undefined ? sessionOverride : makeSession(),
    });
    return app;
}

// ---------------------------------------------------------------------------
// POST /v1/runs/:runId/resume
// ---------------------------------------------------------------------------

describe('POST /v1/runs/:runId/resume', () => {
    it('resumes with last_checkpoint strategy — returns 202', async () => {
        const app = buildApp();
        const res = await app.inject({
            method: 'POST',
            url: '/v1/runs/run-test-abc123/resume',
            payload: { strategy: 'last_checkpoint', workspaceId: 'ws-1' },
        });
        assert.strictEqual(res.statusCode, 202);
        const body = JSON.parse(res.body);
        assert.strictEqual(body.runId, 'run-test-abc123');
        assert.ok(body.resumedFrom.startsWith('ckpt_'));
        assert.strictEqual(body.status, 'resumed');
        assert.strictEqual(body.estimatedLoss, 'minimal');
        assert.ok(body.correlationId);
    });

    it('resumes with latest_state strategy — returns 202', async () => {
        const app = buildApp();
        const res = await app.inject({
            method: 'POST',
            url: '/v1/runs/run-state-xyz789/resume',
            payload: { strategy: 'latest_state', workspaceId: 'ws-1' },
        });
        assert.strictEqual(res.statusCode, 202);
        const body = JSON.parse(res.body);
        assert.ok(body.resumedFrom.startsWith('state_'));
        assert.strictEqual(body.estimatedLoss, 'none');
    });

    it('returns 400 for invalid strategy', async () => {
        const app = buildApp();
        const res = await app.inject({
            method: 'POST',
            url: '/v1/runs/run-bad-strategy/resume',
            payload: { strategy: 'rollback_everything', workspaceId: 'ws-1' },
        });
        assert.strictEqual(res.statusCode, 400);
        const body = JSON.parse(res.body);
        assert.strictEqual(body.error, 'invalid_strategy');
    });

    it('returns 400 when strategy is missing', async () => {
        const app = buildApp();
        const res = await app.inject({
            method: 'POST',
            url: '/v1/runs/run-no-strategy/resume',
            payload: { workspaceId: 'ws-1' },
        });
        assert.strictEqual(res.statusCode, 400);
    });

    it('returns 400 when workspaceId is missing from body and session', async () => {
        const session = makeSession({ workspaceIds: [] });
        const app = buildApp(session);
        const res = await app.inject({
            method: 'POST',
            url: '/v1/runs/run-no-ws/resume',
            payload: { strategy: 'latest_state' },
        });
        assert.strictEqual(res.statusCode, 400);
        const body = JSON.parse(res.body);
        assert.strictEqual(body.error, 'workspace_required');
    });

    it('returns 401 when no session', async () => {
        const app = buildApp(null);
        const res = await app.inject({
            method: 'POST',
            url: '/v1/runs/run-unauth/resume',
            payload: { strategy: 'last_checkpoint', workspaceId: 'ws-1' },
        });
        assert.strictEqual(res.statusCode, 401);
    });
});

// ---------------------------------------------------------------------------
// POST /v1/workspaces/:workspaceId/repro-packs
// ---------------------------------------------------------------------------

describe('POST /v1/workspaces/:workspaceId/repro-packs', () => {
    it('creates a repro pack with all flags — returns 201', async () => {
        const app = buildApp();
        const res = await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws-1/repro-packs',
            payload: {
                runId: 'run-create-pack-001',
                includeScreenshots: true,
                includeDiffs: true,
                includeLogs: true,
            },
        });
        assert.strictEqual(res.statusCode, 201);
        const body = JSON.parse(res.body);
        assert.ok(body.reproPackId);
        assert.ok(body.downloadRef.includes('ws-1'));
        assert.ok(body.expiresAt);
        assert.ok(body.exportAuditEventId, 'export should have an audit event ID');
        assert.ok(body.correlationId);
    });

    it('creates pack with logs only (screenshots + diffs false)', async () => {
        const app = buildApp();
        const res = await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws-1/repro-packs',
            payload: {
                runId: 'run-logs-only-002',
                includeScreenshots: false,
                includeDiffs: false,
                includeLogs: true,
            },
        });
        assert.strictEqual(res.statusCode, 201);
        const body = JSON.parse(res.body);
        assert.ok(body.reproPackId);
    });

    it('returns 400 when runId is missing', async () => {
        const app = buildApp();
        const res = await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws-1/repro-packs',
            payload: { includeScreenshots: true },
        });
        assert.strictEqual(res.statusCode, 400);
    });

    it('returns 401 when no session', async () => {
        const app = buildApp(null);
        const res = await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws-1/repro-packs',
            payload: { runId: 'run-unauth' },
        });
        assert.strictEqual(res.statusCode, 401);
    });

    it('returns 403 when workspaceId not in session workspaceIds', async () => {
        const session = makeSession({ workspaceIds: ['ws-other'] });
        const app = buildApp(session);
        const res = await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws-restricted/repro-packs',
            payload: { runId: 'run-forbidden' },
        });
        assert.strictEqual(res.statusCode, 403);
    });

    it('export event is audited — exportAuditEventId present and unique per pack', async () => {
        const app = buildApp();

        const res1 = await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws-1/repro-packs',
            payload: { runId: 'run-audit-check-001' },
        });
        const res2 = await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws-1/repro-packs',
            payload: { runId: 'run-audit-check-002' },
        });

        const b1 = JSON.parse(res1.body);
        const b2 = JSON.parse(res2.body);
        assert.notStrictEqual(b1.exportAuditEventId, b2.exportAuditEventId, 'audit IDs must be unique');
    });
});

// ---------------------------------------------------------------------------
// GET /v1/workspaces/:workspaceId/repro-packs/:reproPackId
// ---------------------------------------------------------------------------

describe('GET /v1/workspaces/:workspaceId/repro-packs/:reproPackId', () => {
    let packId = '';
    let app: ReturnType<typeof buildApp>;

    before(async () => {
        app = buildApp();
        const createRes = await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws-1/repro-packs',
            payload: {
                runId: 'run-get-test-001',
                includeScreenshots: true,
                includeDiffs: true,
                includeLogs: true,
            },
        });
        packId = JSON.parse(createRes.body).reproPackId;
    });

    it('returns 200 with manifest and downloadRef', async () => {
        const res = await app.inject({
            method: 'GET',
            url: `/v1/workspaces/ws-1/repro-packs/${packId}`,
        });
        assert.strictEqual(res.statusCode, 200);
        const body = JSON.parse(res.body);
        assert.strictEqual(body.reproPackId, packId);
        assert.ok(body.manifest);
        assert.strictEqual(body.manifest.runId, 'run-get-test-001');
        assert.strictEqual(body.manifest.includedScreenshots, true);
        assert.strictEqual(body.manifest.includedDiffs, true);
        assert.strictEqual(body.manifest.includedLogs, true);
        assert.ok(body.downloadRef);
        assert.ok(body.expiresAt);
        assert.ok(body.exportAuditEventId);
    });

    it('manifest contains timeline with repro_pack_generated event', async () => {
        const res = await app.inject({
            method: 'GET',
            url: `/v1/workspaces/ws-1/repro-packs/${packId}`,
        });
        const body = JSON.parse(res.body);
        const generated = body.manifest.timeline.find(
            (e: { event: string }) => e.event === 'repro_pack_generated',
        );
        assert.ok(generated, 'manifest must include repro_pack_generated timeline event');
    });

    it('returns 404 for unknown reproPackId', async () => {
        const res = await app.inject({
            method: 'GET',
            url: '/v1/workspaces/ws-1/repro-packs/not-a-real-pack',
        });
        assert.strictEqual(res.statusCode, 404);
    });

    it('returns 401 when no session', async () => {
        const unauthedApp = buildApp(null);
        const res = await unauthedApp.inject({
            method: 'GET',
            url: `/v1/workspaces/ws-1/repro-packs/fake-id`,
        });
        assert.strictEqual(res.statusCode, 401);
    });

    it('returns 403 when workspace not in session', async () => {
        const restrictedApp = buildApp(makeSession({ workspaceIds: ['ws-other'] }));
        const res = await restrictedApp.inject({
            method: 'GET',
            url: `/v1/workspaces/ws-1/repro-packs/${packId}`,
        });
        assert.strictEqual(res.statusCode, 403);
    });
});
