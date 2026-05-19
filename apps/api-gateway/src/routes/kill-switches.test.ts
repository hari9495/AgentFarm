/**
 * Epic B2: Kill-Switch Route Tests
 * Tests activation, listing, retrieval, resume, and evidence tracing.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerKillSwitchRoutes } from './kill-switches.js';

const session = () => ({
    userId: 'admin-1',
    tenantId: 'tenant-1',
    workspaceIds: ['ws-1'],
    expiresAt: Date.now() + 60_000,
});

test('B2: POST /v1/kill-switches activates a kill-switch and returns 201', async () => {
    const app = Fastify();
    await registerKillSwitchRoutes(app, { getSession: () => session() });

    const res = await app.inject({
        method: 'POST',
        url: '/v1/kill-switches',
        payload: {
            switch_type: 'emergency',
            reason: 'Security incident detected in production',
            affected_action_types: ['high'],
            workspace_id: 'ws-1',
            incident_ref: 'INC-001',
        },
    });

    assert.equal(res.statusCode, 201);
    const body = res.json() as { kill_switch: { id: string; status: string; tenantId: string } };
    assert.equal(body.kill_switch.status, 'active');
    assert.equal(body.kill_switch.tenantId, 'tenant-1');
    assert.ok(body.kill_switch.id);
});

test('B2: POST /v1/kill-switches rejects missing required fields', async () => {
    const app = Fastify();
    await registerKillSwitchRoutes(app, { getSession: () => session() });

    const noType = await app.inject({
        method: 'POST',
        url: '/v1/kill-switches',
        payload: { reason: 'Test', affected_action_types: ['high'] },
    });
    assert.equal(noType.statusCode, 400);

    const noReason = await app.inject({
        method: 'POST',
        url: '/v1/kill-switches',
        payload: { switch_type: 'manual', affected_action_types: ['high'] },
    });
    assert.equal(noReason.statusCode, 400);

    const noActions = await app.inject({
        method: 'POST',
        url: '/v1/kill-switches',
        payload: { switch_type: 'manual', reason: 'Test' },
    });
    assert.equal(noActions.statusCode, 400);
});

test('B2: POST /v1/kill-switches rejects workspace outside session scope', async () => {
    const app = Fastify();
    await registerKillSwitchRoutes(app, { getSession: () => session() });

    const res = await app.inject({
        method: 'POST',
        url: '/v1/kill-switches',
        payload: {
            switch_type: 'manual',
            reason: 'Test',
            affected_action_types: ['medium'],
            workspace_id: 'ws-OTHER',
        },
    });
    assert.equal(res.statusCode, 403);
});

test('B2: GET /v1/kill-switches returns only active switches for tenant', async () => {
    const app = Fastify();
    await registerKillSwitchRoutes(app, { getSession: () => session() });

    // Activate two switches
    await app.inject({
        method: 'POST',
        url: '/v1/kill-switches',
        payload: { switch_type: 'emergency', reason: 'Incident A', affected_action_types: ['high'] },
    });
    await app.inject({
        method: 'POST',
        url: '/v1/kill-switches',
        payload: { switch_type: 'manual', reason: 'Incident B', affected_action_types: ['medium', 'high'] },
    });

    const listRes = await app.inject({ method: 'GET', url: '/v1/kill-switches' });
    assert.equal(listRes.statusCode, 200);
    const body = listRes.json() as { kill_switches: unknown[]; total: number };
    assert.equal(body.total, 2);
});

test('B2: GET /v1/kill-switches/:id returns the kill-switch by id', async () => {
    const app = Fastify();
    await registerKillSwitchRoutes(app, { getSession: () => session() });

    const createRes = await app.inject({
        method: 'POST',
        url: '/v1/kill-switches',
        payload: { switch_type: 'emergency', reason: 'Test get by id', affected_action_types: ['high'] },
    });
    const { kill_switch } = createRes.json() as { kill_switch: { id: string } };

    const getRes = await app.inject({ method: 'GET', url: `/v1/kill-switches/${kill_switch.id}` });
    assert.equal(getRes.statusCode, 200);
    const body = getRes.json() as { kill_switch: { id: string; reason: string } };
    assert.equal(body.kill_switch.id, kill_switch.id);
    assert.equal(body.kill_switch.reason, 'Test get by id');
});

test('B2: GET /v1/kill-switches/:id returns 404 for unknown id', async () => {
    const app = Fastify();
    await registerKillSwitchRoutes(app, { getSession: () => session() });

    const res = await app.inject({ method: 'GET', url: '/v1/kill-switches/does-not-exist' });
    assert.equal(res.statusCode, 404);
});

test('B2: POST /v1/kill-switches/:id/resume resolves the switch and requires approval + incident ref', async () => {
    const app = Fastify();
    await registerKillSwitchRoutes(app, { getSession: () => session() });

    const createRes = await app.inject({
        method: 'POST',
        url: '/v1/kill-switches',
        payload: { switch_type: 'emergency', reason: 'Prod outage', affected_action_types: ['high'], incident_ref: 'INC-042' },
    });
    const { kill_switch } = createRes.json() as { kill_switch: { id: string } };

    // Missing resume_approval_id → 400
    const noApproval = await app.inject({
        method: 'POST',
        url: `/v1/kill-switches/${kill_switch.id}/resume`,
        payload: { incident_ref: 'INC-042' },
    });
    assert.equal(noApproval.statusCode, 400);

    // Missing incident_ref → 400
    const noIncident = await app.inject({
        method: 'POST',
        url: `/v1/kill-switches/${kill_switch.id}/resume`,
        payload: { resume_approval_id: 'approval-abc' },
    });
    assert.equal(noIncident.statusCode, 400);

    // Valid resume
    const resumeRes = await app.inject({
        method: 'POST',
        url: `/v1/kill-switches/${kill_switch.id}/resume`,
        payload: { resume_approval_id: 'approval-abc', incident_ref: 'INC-042' },
    });
    assert.equal(resumeRes.statusCode, 200);
    const body = resumeRes.json() as { kill_switch: { status: string; resumeRequiredApprovalId: string; resumedAt: string } };
    assert.equal(body.kill_switch.status, 'resolved');
    assert.equal(body.kill_switch.resumeRequiredApprovalId, 'approval-abc');
    assert.ok(body.kill_switch.resumedAt);
});

test('B2: POST /v1/kill-switches/:id/resume returns 409 if switch already resolved', async () => {
    const app = Fastify();
    await registerKillSwitchRoutes(app, { getSession: () => session() });

    const createRes = await app.inject({
        method: 'POST',
        url: '/v1/kill-switches',
        payload: { switch_type: 'manual', reason: 'Idempotency test', affected_action_types: ['high'] },
    });
    const { kill_switch } = createRes.json() as { kill_switch: { id: string } };

    await app.inject({
        method: 'POST',
        url: `/v1/kill-switches/${kill_switch.id}/resume`,
        payload: { resume_approval_id: 'approval-1', incident_ref: 'INC-100' },
    });

    const secondResume = await app.inject({
        method: 'POST',
        url: `/v1/kill-switches/${kill_switch.id}/resume`,
        payload: { resume_approval_id: 'approval-2', incident_ref: 'INC-100' },
    });
    assert.equal(secondResume.statusCode, 409);
});

test('B2: GET /v1/kill-switches/evidence returns audit trail for tenant', async () => {
    const app = Fastify();
    await registerKillSwitchRoutes(app, { getSession: () => session() });

    const createRes = await app.inject({
        method: 'POST',
        url: '/v1/kill-switches',
        payload: { switch_type: 'security_incident', reason: 'Audit evidence test', affected_action_types: ['high'] },
    });
    const { kill_switch } = createRes.json() as { kill_switch: { id: string } };

    await app.inject({
        method: 'POST',
        url: `/v1/kill-switches/${kill_switch.id}/resume`,
        payload: { resume_approval_id: 'approval-evidence-test', incident_ref: 'INC-EVIDENCE-001' },
    });

    const evidenceRes = await app.inject({ method: 'GET', url: '/v1/kill-switches/evidence' });
    assert.equal(evidenceRes.statusCode, 200);
    const body = evidenceRes.json() as { evidence: { event: string; killSwitchId: string }[]; total: number };
    // Two events: activated + resumed
    assert.ok(body.total >= 2);
    const events = body.evidence.map((e) => e.event);
    assert.ok(events.includes('kill_switch_activated'));
    assert.ok(events.includes('kill_switch_resumed'));
    // All evidence scoped to our kill-switch
    const forOurSwitch = body.evidence.filter((e) => e.killSwitchId === kill_switch.id);
    assert.equal(forOurSwitch.length, 2);
});

test('B2: Unauthenticated requests to all routes return 401', async () => {
    const app = Fastify();
    await registerKillSwitchRoutes(app, { getSession: () => null });

    for (const { method, url } of [
        { method: 'POST' as const, url: '/v1/kill-switches' },
        { method: 'GET' as const, url: '/v1/kill-switches' },
        { method: 'GET' as const, url: '/v1/kill-switches/some-id' },
        { method: 'POST' as const, url: '/v1/kill-switches/some-id/resume' },
        { method: 'GET' as const, url: '/v1/kill-switches/evidence' },
    ]) {
        const res = await app.inject({ method, url });
        assert.equal(res.statusCode, 401, `Expected 401 for ${method} ${url}`);
    }
});
