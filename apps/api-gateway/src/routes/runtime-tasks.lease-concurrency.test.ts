import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerRuntimeTaskRoutes } from './runtime-tasks.js';

const internalSession = {
    userId: 'user_internal_lease',
    tenantId: 'tenant_lease',
    workspaceIds: ['ws_lease'],
    scope: 'internal' as const,
    expiresAt: Date.now() + 60_000,
};

const createRepoStub = () => {
    const auditEvents: Array<{ summary: string; correlationId: string }> = [];
    return {
        repo: {
            async findRuntimeEndpoint() {
                return 'http://runtime.bot.local';
            },
            async createAuditEvent(input: { summary: string; correlationId: string }) {
                auditEvents.push({ summary: input.summary, correlationId: input.correlationId });
            },
            async createActionRecord() {
                return;
            },
        },
        auditEvents,
    };
};

test('A1 race 1: same idempotency key coalesces to already_claimed lease', async () => {
    const { repo } = createRepoStub();
    const app = Fastify();

    await registerRuntimeTaskRoutes(app, {
        getSession: () => internalSession,
        now: () => 1_700_010_000_000,
        repo,
    });

    try {
        const [first, second] = await Promise.all([
            app.inject({
                method: 'POST',
                url: '/v1/workspaces/ws_lease/runtime/tasks/claim',
                payload: { bot_id: 'bot_1', task_id: 'task_same', idempotency_key: 'idem_same' },
            }),
            app.inject({
                method: 'POST',
                url: '/v1/workspaces/ws_lease/runtime/tasks/claim',
                payload: { bot_id: 'bot_1', task_id: 'task_same', idempotency_key: 'idem_same' },
            }),
        ]);

        assert.equal(first.statusCode, 200);
        assert.equal(second.statusCode, 200);

        const a = first.json() as { lease_id: string; claim_token: string; status: string };
        const b = second.json() as { lease_id: string; claim_token: string; status: string };

        assert.equal(a.lease_id, b.lease_id);
        assert.equal(a.claim_token, b.claim_token);
        assert.ok(a.status === 'claimed' || a.status === 'already_claimed');
        assert.ok(b.status === 'claimed' || b.status === 'already_claimed');
    } finally {
        await app.close();
    }
});

test('A1 race 2: different idempotency key returns deterministic active_lease_conflict', async () => {
    const { repo } = createRepoStub();
    const app = Fastify();

    await registerRuntimeTaskRoutes(app, {
        getSession: () => internalSession,
        now: () => 1_700_010_100_000,
        repo,
    });

    try {
        const first = await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws_lease/runtime/tasks/claim',
            payload: { bot_id: 'bot_1', task_id: 'task_conflict', idempotency_key: 'idem_a' },
        });
        assert.equal(first.statusCode, 200);

        const second = await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws_lease/runtime/tasks/claim',
            payload: { bot_id: 'bot_1', task_id: 'task_conflict', idempotency_key: 'idem_b' },
        });
        assert.equal(second.statusCode, 409);

        const body = second.json() as { error: string; conflict_code: string; lease_id: string };
        assert.equal(body.error, 'task_claim_conflict');
        assert.equal(body.conflict_code, 'active_lease_conflict');
        assert.ok(body.lease_id);
    } finally {
        await app.close();
    }
});

test('A1 race 3: renew extends active lease', async () => {
    let nowMs = 1_700_010_200_000;
    const { repo } = createRepoStub();
    const app = Fastify();

    await registerRuntimeTaskRoutes(app, {
        getSession: () => internalSession,
        now: () => nowMs,
        repo,
    });

    try {
        const claim = await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws_lease/runtime/tasks/claim',
            payload: { bot_id: 'bot_1', task_id: 'task_renew', idempotency_key: 'idem_renew', lease_ttl_seconds: 10 },
        });
        const claimBody = claim.json() as { claim_token: string; expires_at: string };

        nowMs += 2_000;
        const renew = await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws_lease/runtime/tasks/task_renew/lease/renew',
            payload: { bot_id: 'bot_1', claim_token: claimBody.claim_token, lease_ttl_seconds: 30 },
        });
        assert.equal(renew.statusCode, 200);

        const renewBody = renew.json() as { expires_at: string };
        assert.ok(Date.parse(renewBody.expires_at) > Date.parse(claimBody.expires_at));
    } finally {
        await app.close();
    }
});

test('A1 race 4: renew fails for expired lease', async () => {
    let nowMs = 1_700_010_300_000;
    const { repo } = createRepoStub();
    const app = Fastify();

    await registerRuntimeTaskRoutes(app, {
        getSession: () => internalSession,
        now: () => nowMs,
        repo,
    });

    try {
        const claim = await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws_lease/runtime/tasks/claim',
            payload: { bot_id: 'bot_1', task_id: 'task_expired_renew', idempotency_key: 'idem_expired', lease_ttl_seconds: 5 },
        });
        const claimBody = claim.json() as { claim_token: string };

        nowMs += 6_000;
        const renew = await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws_lease/runtime/tasks/task_expired_renew/lease/renew',
            payload: { bot_id: 'bot_1', claim_token: claimBody.claim_token },
        });

        assert.equal(renew.statusCode, 409);
        assert.equal((renew.json() as { error: string }).error, 'lease_not_active');
    } finally {
        await app.close();
    }
});

test('A1 race 5: release then new claim succeeds with new token', async () => {
    const { repo } = createRepoStub();
    const app = Fastify();

    await registerRuntimeTaskRoutes(app, {
        getSession: () => internalSession,
        now: () => 1_700_010_400_000,
        repo,
    });

    try {
        const claimOne = await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws_lease/runtime/tasks/claim',
            payload: { bot_id: 'bot_1', task_id: 'task_release_reclaim', idempotency_key: 'idem_1' },
        });
        const claimOneBody = claimOne.json() as { claim_token: string };

        const release = await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws_lease/runtime/tasks/task_release_reclaim/lease/release',
            payload: { bot_id: 'bot_1', claim_token: claimOneBody.claim_token },
        });
        assert.equal(release.statusCode, 200);

        const claimTwo = await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws_lease/runtime/tasks/claim',
            payload: { bot_id: 'bot_1', task_id: 'task_release_reclaim', idempotency_key: 'idem_2' },
        });
        assert.equal(claimTwo.statusCode, 200);

        const claimTwoBody = claimTwo.json() as { claim_token: string; status: string };
        assert.equal(claimTwoBody.status, 'claimed');
        assert.notEqual(claimTwoBody.claim_token, claimOneBody.claim_token);
    } finally {
        await app.close();
    }
});

test('A1 race 6: explicit expire marks lease expired and returns requeue metadata', async () => {
    const { repo, auditEvents } = createRepoStub();
    const app = Fastify();

    await registerRuntimeTaskRoutes(app, {
        getSession: () => internalSession,
        now: () => 1_700_010_500_000,
        repo,
    });

    try {
        const claim = await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws_lease/runtime/tasks/claim',
            payload: {
                bot_id: 'bot_1',
                task_id: 'task_explicit_expire',
                idempotency_key: 'idem_expire',
                correlation_id: 'corr_expire_chain',
            },
        });
        const claimBody = claim.json() as { claim_token: string; lease_id: string };

        const expire = await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws_lease/runtime/tasks/task_explicit_expire/lease/expire',
            payload: { bot_id: 'bot_1', claim_token: claimBody.claim_token },
        });
        assert.equal(expire.statusCode, 200);

        const expireBody = expire.json() as {
            status: string;
            lease_id: string;
            correlation_id: string;
            requeue: { task_id: string; correlation_id: string };
        };
        assert.equal(expireBody.status, 'expired');
        assert.equal(expireBody.lease_id, claimBody.lease_id);
        assert.equal(expireBody.correlation_id, 'corr_expire_chain');
        assert.equal(expireBody.requeue.task_id, 'task_explicit_expire');
        assert.equal(expireBody.requeue.correlation_id, 'corr_expire_chain');
        assert.ok(auditEvents.some((item) => item.summary.includes('lease expired')));
    } finally {
        await app.close();
    }
});

test('A1 race 7: claim after TTL expiry requeues with previous correlation continuity', async () => {
    let nowMs = 1_700_010_600_000;
    const { repo } = createRepoStub();
    const app = Fastify();

    await registerRuntimeTaskRoutes(app, {
        getSession: () => internalSession,
        now: () => nowMs,
        repo,
    });

    try {
        const initialClaim = await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws_lease/runtime/tasks/claim',
            payload: {
                bot_id: 'bot_1',
                task_id: 'task_natural_expiry',
                idempotency_key: 'idem_first',
                lease_ttl_seconds: 5,
                correlation_id: 'corr_natural_chain',
            },
        });
        assert.equal(initialClaim.statusCode, 200);

        nowMs += 8_000;
        const reclaim = await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws_lease/runtime/tasks/claim',
            payload: {
                bot_id: 'bot_1',
                task_id: 'task_natural_expiry',
                idempotency_key: 'idem_second',
            },
        });
        assert.equal(reclaim.statusCode, 200);

        const reclaimBody = reclaim.json() as {
            requeued_from_expired_lease: boolean;
            previous_correlation_id: string | null;
            correlation_id: string;
        };
        assert.equal(reclaimBody.requeued_from_expired_lease, true);
        assert.equal(reclaimBody.previous_correlation_id, 'corr_natural_chain');
        assert.equal(reclaimBody.correlation_id, 'corr_natural_chain');
    } finally {
        await app.close();
    }
});

test('A1 race 8: dispatch rejects expired lease with deterministic lease_not_active', async () => {
    let nowMs = 1_700_010_700_000;
    const { repo } = createRepoStub();
    const app = Fastify();

    await registerRuntimeTaskRoutes(app, {
        getSession: () => internalSession,
        now: () => nowMs,
        repo,
        dispatcher: async () => ({ ok: true, statusCode: 202 }),
    });

    try {
        const claim = await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws_lease/runtime/tasks/claim',
            payload: {
                bot_id: 'bot_1',
                task_id: 'task_expired_dispatch',
                idempotency_key: 'idem_dispatch',
                lease_ttl_seconds: 5,
            },
        });
        const claimBody = claim.json() as { claim_token: string };

        nowMs += 6_000;
        const dispatch = await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws_lease/runtime/tasks/task_expired_dispatch/dispatch',
            payload: {
                bot_id: 'bot_1',
                claim_token: claimBody.claim_token,
                payload: { action_type: 'read_task' },
            },
        });

        assert.equal(dispatch.statusCode, 409);
        assert.equal((dispatch.json() as { error: string }).error, 'lease_not_active');
    } finally {
        await app.close();
    }
});

test('A1 race 9: renew after explicit expire fails as lease_not_active', async () => {
    const { repo } = createRepoStub();
    const app = Fastify();

    await registerRuntimeTaskRoutes(app, {
        getSession: () => internalSession,
        now: () => 1_700_010_800_000,
        repo,
    });

    try {
        const claim = await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws_lease/runtime/tasks/claim',
            payload: {
                bot_id: 'bot_1',
                task_id: 'task_renew_after_expire',
                idempotency_key: 'idem_rexp',
            },
        });
        const claimBody = claim.json() as { claim_token: string };

        const expire = await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws_lease/runtime/tasks/task_renew_after_expire/lease/expire',
            payload: { bot_id: 'bot_1', claim_token: claimBody.claim_token },
        });
        assert.equal(expire.statusCode, 200);

        const renew = await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws_lease/runtime/tasks/task_renew_after_expire/lease/renew',
            payload: { bot_id: 'bot_1', claim_token: claimBody.claim_token },
        });
        assert.equal(renew.statusCode, 409);
        assert.equal((renew.json() as { error: string }).error, 'lease_not_active');
    } finally {
        await app.close();
    }
});

test('A1 race 10: service-auth claim requires tenant_id and succeeds with token', async () => {
    const { repo } = createRepoStub();
    const app = Fastify();

    await registerRuntimeTaskRoutes(app, {
        getSession: () => null,
        now: () => 1_700_010_900_000,
        repo,
        serviceAuthToken: 'service_token_1',
    });

    try {
        const missingTenant = await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws_lease/runtime/tasks/claim',
            headers: {
                authorization: 'Bearer service_token_1',
            },
            payload: {
                bot_id: 'bot_1',
                task_id: 'task_service_auth',
                idempotency_key: 'idem_service_auth',
            },
        });

        assert.equal(missingTenant.statusCode, 403);

        const validClaim = await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws_lease/runtime/tasks/claim',
            headers: {
                authorization: 'Bearer service_token_1',
            },
            payload: {
                tenant_id: 'tenant_lease',
                bot_id: 'bot_1',
                task_id: 'task_service_auth',
                idempotency_key: 'idem_service_auth',
            },
        });

        assert.equal(validClaim.statusCode, 200);
        assert.equal((validClaim.json() as { status: string }).status, 'claimed');
    } finally {
        await app.close();
    }
});
