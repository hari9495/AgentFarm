// sprint4-integration.test.ts
// Sprint 4 exit-gate integration test — F9 Crash Recovery + Repro Pack Generator
//
// Test 1: Run crash -> resume from last_checkpoint -> repro pack created -> manifest accessible
// Test 2: Resume with invalid strategy blocked; workspace tenancy isolation enforced on repro packs

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerReproPackRoutes } from './repro-packs.js';
import { registerCiFailureRoutes } from './ci-failures.js';
import { registerWorkMemoryRoutes } from './work-memory.js';

type SessionContext = {
    userId: string;
    tenantId: string;
    workspaceIds: string[];
    scope?: 'customer' | 'internal';
    expiresAt: number;
};

function makeSession(overrides: Partial<SessionContext> = {}): SessionContext {
    return {
        userId: 'user-s4-001',
        tenantId: 'tenant-s4-001',
        workspaceIds: ['ws-s4-001'],
        scope: 'customer',
        expiresAt: Date.now() + 60_000,
        ...overrides,
    };
}

async function buildFullApp(sessionOverride?: SessionContext | null) {
    const app = Fastify({ logger: false });
    const getSession = () =>
        sessionOverride !== undefined ? sessionOverride : makeSession();
    await registerCiFailureRoutes(app, { getSession });
    await registerWorkMemoryRoutes(app, { getSession });
    await registerReproPackRoutes(app, { getSession });
    return app;
}

// ---------------------------------------------------------------------------
// Integration Test 1: CI crash → run resume → repro pack → manifest audit trail
// ---------------------------------------------------------------------------

describe('Sprint 4 integration: run crash -> resume -> repro pack with audit trail', () => {
    it('full path: ingest CI failure, resume crashed run, generate repro pack, verify manifest audit', async () => {
        const app = await buildFullApp();

        // Step 1: Ingest a CI failure (simulates a crash event)
        const intakeRes = await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws-s4-001/ci-failures/intake',
            headers: { 'content-type': 'application/json' },
            payload: JSON.stringify({
                provider: 'github',
                runId: 'run-s4-crash-001',
                repo: 'org/agentfarm',
                branch: 'feat/vm-realism',
                failedJobs: [
                    {
                        jobName: 'agent-runtime',
                        step: 'env var RUNTIME_SECRET not found',
                        exitCode: 1,
                    },
                ],
                logRefs: ['https://logs.example.com/run-s4-crash-001'],
            }),
        });

        assert.strictEqual(intakeRes.statusCode, 202, 'CI intake should return 202');
        const intake = JSON.parse(intakeRes.body);
        assert.ok(intake.triageId, 'intake should return a triageId');

        // Step 2: Resume the crashed run using last_checkpoint strategy
        const resumeRes = await app.inject({
            method: 'POST',
            url: '/v1/runs/run-s4-crash-001/resume',
            headers: { 'content-type': 'application/json' },
            payload: JSON.stringify({
                strategy: 'last_checkpoint',
                workspaceId: 'ws-s4-001',
            }),
        });

        assert.strictEqual(resumeRes.statusCode, 202, 'resume should return 202 Accepted');
        const resume = JSON.parse(resumeRes.body);
        assert.strictEqual(resume.runId, 'run-s4-crash-001');
        assert.ok(resume.resumedFrom.startsWith('ckpt_'), 'resumedFrom should be a checkpoint ref');
        assert.strictEqual(resume.status, 'resumed');
        assert.strictEqual(resume.estimatedLoss, 'minimal');
        assert.ok(resume.correlationId);

        // Step 3: Create repro pack for the crashed run
        const packRes = await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws-s4-001/repro-packs',
            headers: { 'content-type': 'application/json' },
            payload: JSON.stringify({
                runId: 'run-s4-crash-001',
                includeScreenshots: true,
                includeDiffs: true,
                includeLogs: true,
            }),
        });

        assert.strictEqual(packRes.statusCode, 201, 'repro pack creation should return 201');
        const pack = JSON.parse(packRes.body);
        assert.ok(pack.reproPackId, 'should return reproPackId');
        assert.ok(pack.downloadRef, 'should return downloadRef');
        assert.ok(pack.expiresAt, 'should return expiresAt');
        assert.ok(pack.exportAuditEventId, 'export must have an audit event ID — export is always audited');
        assert.ok(pack.correlationId);

        // Step 4: Retrieve the repro pack and verify manifest contains audit trail
        const getRes = await app.inject({
            method: 'GET',
            url: `/v1/workspaces/ws-s4-001/repro-packs/${pack.reproPackId}`,
        });

        assert.strictEqual(getRes.statusCode, 200, 'GET repro pack should return 200');
        const fetched = JSON.parse(getRes.body);
        assert.strictEqual(fetched.reproPackId, pack.reproPackId);

        const manifest = fetched.manifest;
        assert.strictEqual(manifest.runId, 'run-s4-crash-001');
        assert.strictEqual(manifest.workspaceId, 'ws-s4-001');
        assert.strictEqual(manifest.tenantId, 'tenant-s4-001');
        assert.strictEqual(manifest.includedLogs, true);
        assert.strictEqual(manifest.includedScreenshots, true);
        assert.strictEqual(manifest.includedDiffs, true);
        assert.strictEqual(manifest.includedActionTraces, true);
        assert.ok(manifest.logBundleRef, 'log bundle ref must be set when includeLogs=true');
        assert.ok(manifest.screenshotRefs.length > 0, 'screenshot refs must be set');
        assert.ok(manifest.diffRefs.length > 0, 'diff refs must be set');

        // Audit trail: timeline must contain repro_pack_generated
        const generated = manifest.timeline.find(
            (e: { event: string }) => e.event === 'repro_pack_generated',
        );
        assert.ok(generated, 'manifest timeline must include repro_pack_generated event');

        assert.strictEqual(fetched.exportAuditEventId, pack.exportAuditEventId, 'audit ID must be stable');
    });
});

// ---------------------------------------------------------------------------
// Integration Test 2: Security + tenancy isolation
// ---------------------------------------------------------------------------

describe('Sprint 4 integration: security and tenancy isolation for recovery endpoints', () => {
    it('invalid strategy is blocked, cross-tenant repro pack access is denied, no-session requests return 401', async () => {
        const tenantA = makeSession({ tenantId: 'tenant-a', workspaceIds: ['ws-a-001'] });
        const tenantB = makeSession({ tenantId: 'tenant-b', workspaceIds: ['ws-b-001'] });

        // -----------------------------------------------------------------------
        // Block 1: invalid strategy blocked with 400
        // -----------------------------------------------------------------------
        const appA = await buildFullApp(tenantA);
        const badStratRes = await appA.inject({
            method: 'POST',
            url: '/v1/runs/run-blocked/resume',
            payload: JSON.stringify({ strategy: 'delete_everything', workspaceId: 'ws-a-001' }),
            headers: { 'content-type': 'application/json' },
        });
        assert.strictEqual(badStratRes.statusCode, 400, 'invalid strategy must be blocked');
        const badBody = JSON.parse(badStratRes.body);
        assert.strictEqual(badBody.error, 'invalid_strategy');

        // -----------------------------------------------------------------------
        // Block 2: create repro pack as tenant A
        // -----------------------------------------------------------------------
        const packResA = await appA.inject({
            method: 'POST',
            url: '/v1/workspaces/ws-a-001/repro-packs',
            payload: JSON.stringify({ runId: 'run-tenant-a-001' }),
            headers: { 'content-type': 'application/json' },
        });
        assert.strictEqual(packResA.statusCode, 201);
        const packA = JSON.parse(packResA.body);

        // Block 3: tenant B must NOT access tenant A's workspace repro pack
        const appB = await buildFullApp(tenantB);
        const crossTenantRes = await appB.inject({
            method: 'GET',
            url: `/v1/workspaces/ws-a-001/repro-packs/${packA.reproPackId}`,
        });
        // tenant B doesn't own ws-a-001 → 403
        assert.strictEqual(crossTenantRes.statusCode, 403, 'cross-workspace access must return 403');

        // Block 4: unauthenticated request to resume must return 401
        const noSessionApp = await buildFullApp(null);
        const unauthResumeRes = await noSessionApp.inject({
            method: 'POST',
            url: '/v1/runs/run-noauth/resume',
            payload: JSON.stringify({ strategy: 'last_checkpoint', workspaceId: 'ws-a-001' }),
            headers: { 'content-type': 'application/json' },
        });
        assert.strictEqual(unauthResumeRes.statusCode, 401, 'unauthenticated resume must return 401');

        // Block 5: unauthenticated repro pack creation must return 401
        const unauthPackRes = await noSessionApp.inject({
            method: 'POST',
            url: '/v1/workspaces/ws-a-001/repro-packs',
            payload: JSON.stringify({ runId: 'run-noauth' }),
            headers: { 'content-type': 'application/json' },
        });
        assert.strictEqual(unauthPackRes.statusCode, 401, 'unauthenticated pack create must return 401');
    });
});
