import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerWorkspaceSessionRoutes } from './workspace-session.js';

const customerSession = {
    userId: 'user_1',
    tenantId: 'tenant_1',
    workspaceIds: ['ws_1'],
    scope: 'customer' as const,
    expiresAt: Date.now() + 60_000,
};

const createTestStore = () => ({
    stateByWorkspaceKey: new Map(),
    checkpointsByWorkspaceKey: new Map(),
});

const createMockRepo = () => {
    const state = new Map<string, { version: number; state: Record<string, unknown>; updatedAt: string; updatedBy: string }>();
    const checkpoints = new Map<string, Array<{ checkpointId: string; version: number; label: string; createdAt: string; actor: string; reason?: string; stateDigest?: string }>>();
    const auditEvents: Array<{ eventName: string; summary: string; actor: string }> = [];
    const keyFor = (tenantId: string, workspaceId: string) => `${tenantId}:${workspaceId}`;

    return {
        repo: {
            async getState(input: { tenantId: string; workspaceId: string }) {
                const record = state.get(keyFor(input.tenantId, input.workspaceId));
                if (!record) {
                    return null;
                }
                return {
                    tenantId: input.tenantId,
                    workspaceId: input.workspaceId,
                    version: record.version,
                    state: record.state,
                    updatedAt: record.updatedAt,
                    updatedBy: record.updatedBy,
                };
            },
            async upsertState(input: {
                tenantId: string;
                workspaceId: string;
                expectedVersion?: number;
                state: Record<string, unknown>;
                updatedBy: string;
                nowIso: string;
            }) {
                const key = keyFor(input.tenantId, input.workspaceId);
                const existing = state.get(key);
                const currentVersion = existing?.version ?? 0;
                if (input.expectedVersion !== undefined && input.expectedVersion !== currentVersion) {
                    return { conflictCurrentVersion: currentVersion };
                }
                const next = {
                    version: currentVersion + 1,
                    state: input.state,
                    updatedAt: input.nowIso,
                    updatedBy: input.updatedBy,
                };
                state.set(key, next);
                return {
                    record: {
                        tenantId: input.tenantId,
                        workspaceId: input.workspaceId,
                        version: next.version,
                        state: next.state,
                        updatedAt: next.updatedAt,
                        updatedBy: next.updatedBy,
                    },
                };
            },
            async createCheckpoint(input: {
                tenantId: string;
                workspaceId: string;
                label: string;
                reason?: string;
                stateDigest?: string;
                actor: string;
                nowIso: string;
            }) {
                const key = keyFor(input.tenantId, input.workspaceId);
                const version = state.get(key)?.version ?? 0;
                const item = {
                    checkpointId: `cp_${Math.random().toString(16).slice(2)}`,
                    version,
                    label: input.label,
                    createdAt: input.nowIso,
                    actor: input.actor,
                    reason: input.reason,
                    stateDigest: input.stateDigest,
                };
                checkpoints.set(key, [item, ...(checkpoints.get(key) ?? [])]);
                return {
                    tenantId: input.tenantId,
                    workspaceId: input.workspaceId,
                    ...item,
                };
            },
            async listCheckpoints(input: { tenantId: string; workspaceId: string }) {
                const key = keyFor(input.tenantId, input.workspaceId);
                return (checkpoints.get(key) ?? []).map((item) => ({
                    tenantId: input.tenantId,
                    workspaceId: input.workspaceId,
                    ...item,
                }));
            },
            async createAuditEvent(input: { eventName: 'session_restore' | 'session_update' | 'session_checkpoint_created'; summary: string; actor: string }) {
                auditEvents.push({
                    eventName: input.eventName,
                    summary: input.summary,
                    actor: input.actor,
                });
            },
        },
        auditEvents,
    };
};

test('GET returns default session state when workspace has no persisted state', async () => {
    const app = Fastify();

    await registerWorkspaceSessionRoutes(app, {
        getSession: () => customerSession,
        store: createTestStore(),
    });

    try {
        const response = await app.inject({
            method: 'GET',
            url: '/v1/workspaces/ws_1/session-state',
        });

        assert.equal(response.statusCode, 200);
        const body = response.json() as {
            workspaceId: string;
            version: number;
            source: string;
            state: Record<string, unknown>;
        };

        assert.equal(body.workspaceId, 'ws_1');
        assert.equal(body.version, 0);
        assert.equal(body.source, 'default');
        assert.deepEqual(body.state, {});
    } finally {
        await app.close();
    }
});

test('PUT stores state and GET returns persisted version', async () => {
    const app = Fastify();

    await registerWorkspaceSessionRoutes(app, {
        getSession: () => customerSession,
        store: createTestStore(),
    });

    try {
        const putResponse = await app.inject({
            method: 'PUT',
            url: '/v1/workspaces/ws_1/session-state',
            payload: {
                expectedVersion: 0,
                state: {
                    activeTaskId: 'task_1',
                    cwd: '/tmp/agentfarm-workspaces/tenant_1/ws_1',
                    branch: 'feature/session-state',
                },
            },
        });

        assert.equal(putResponse.statusCode, 200);
        const putBody = putResponse.json() as {
            version: number;
            state: {
                activeTaskId?: string;
                branch?: string;
            };
        };
        assert.equal(putBody.version, 1);
        assert.equal(putBody.state.activeTaskId, 'task_1');
        assert.equal(putBody.state.branch, 'feature/session-state');

        const getResponse = await app.inject({
            method: 'GET',
            url: '/v1/workspaces/ws_1/session-state',
        });

        assert.equal(getResponse.statusCode, 200);
        const getBody = getResponse.json() as {
            version: number;
            source: string;
            state: {
                activeTaskId?: string;
            };
        };

        assert.equal(getBody.version, 1);
        assert.equal(getBody.source, 'persisted');
        assert.equal(getBody.state.activeTaskId, 'task_1');
    } finally {
        await app.close();
    }
});

test('PUT returns 409 conflict when expectedVersion is stale', async () => {
    const app = Fastify();

    await registerWorkspaceSessionRoutes(app, {
        getSession: () => customerSession,
        store: createTestStore(),
    });

    try {
        const initial = await app.inject({
            method: 'PUT',
            url: '/v1/workspaces/ws_1/session-state',
            payload: {
                expectedVersion: 0,
                state: { activeTaskId: 'task_1' },
            },
        });
        assert.equal(initial.statusCode, 200);

        const stale = await app.inject({
            method: 'PUT',
            url: '/v1/workspaces/ws_1/session-state',
            payload: {
                expectedVersion: 0,
                state: { activeTaskId: 'task_2' },
            },
        });

        assert.equal(stale.statusCode, 409);
        const body = stale.json() as { error: string; currentVersion: number };
        assert.equal(body.error, 'conflict');
        assert.equal(body.currentVersion, 1);
    } finally {
        await app.close();
    }
});

test('checkpoint endpoints create and list workspace checkpoints', async () => {
    const app = Fastify();

    await registerWorkspaceSessionRoutes(app, {
        getSession: () => customerSession,
        store: createTestStore(),
    });

    try {
        const checkpointResponse = await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws_1/checkpoints',
            payload: {
                label: 'before-refactor',
                reason: 'risky multi-file change',
                stateDigest: 'sha256:abc123',
            },
        });

        assert.equal(checkpointResponse.statusCode, 201);
        const created = checkpointResponse.json() as { checkpointId: string; workspaceId: string };
        assert.ok(created.checkpointId);
        assert.equal(created.workspaceId, 'ws_1');

        const listResponse = await app.inject({
            method: 'GET',
            url: '/v1/workspaces/ws_1/checkpoints',
        });

        assert.equal(listResponse.statusCode, 200);
        const listBody = listResponse.json() as {
            items: Array<{
                checkpointId: string;
                label: string;
                reason?: string;
                stateDigest?: string;
                actor: string;
            }>;
        };

        assert.equal(listBody.items.length, 1);
        assert.equal(listBody.items[0].checkpointId, created.checkpointId);
        assert.equal(listBody.items[0].label, 'before-refactor');
        assert.equal(listBody.items[0].reason, 'risky multi-file change');
        assert.equal(listBody.items[0].stateDigest, 'sha256:abc123');
        assert.equal(listBody.items[0].actor, 'user_1');
    } finally {
        await app.close();
    }
});

test('returns forbidden when session cannot access requested workspace', async () => {
    const app = Fastify();

    await registerWorkspaceSessionRoutes(app, {
        getSession: () => customerSession,
        store: createTestStore(),
    });

    try {
        const response = await app.inject({
            method: 'GET',
            url: '/v1/workspaces/ws_2/session-state',
        });

        assert.equal(response.statusCode, 403);
        const body = response.json() as { error: string };
        assert.equal(body.error, 'forbidden');
    } finally {
        await app.close();
    }
});

test('runtime/orchestrator token can restore state and emits restore audit event', async () => {
    const app = Fastify();
    const mock = createMockRepo();

    await registerWorkspaceSessionRoutes(app, {
        getSession: () => null,
        repo: mock.repo,
        env: {
            RUNTIME_SESSION_SHARED_TOKEN: 'session-token-123',
        },
    });

    try {
        const putResponse = await app.inject({
            method: 'PUT',
            url: '/v1/workspaces/ws_1/session-state?tenant_id=tenant_1',
            headers: {
                'x-runtime-session-token': 'session-token-123',
            },
            payload: {
                expectedVersion: 0,
                state: { activeTaskId: 'task_99' },
            },
        });
        assert.equal(putResponse.statusCode, 200);

        const restoreResponse = await app.inject({
            method: 'GET',
            url: '/v1/workspaces/ws_1/session-state?tenant_id=tenant_1&mode=restore',
            headers: {
                'x-runtime-session-token': 'session-token-123',
            },
        });
        assert.equal(restoreResponse.statusCode, 200);
        const restoreBody = restoreResponse.json() as { source: string; version: number };
        assert.equal(restoreBody.source, 'persisted');
        assert.equal(restoreBody.version, 1);

        const restoreAudit = mock.auditEvents.find((item) => item.eventName === 'session_restore');
        assert.ok(restoreAudit);
    } finally {
        await app.close();
    }
});

test('update and checkpoint emit audit events', async () => {
    const app = Fastify();
    const mock = createMockRepo();

    await registerWorkspaceSessionRoutes(app, {
        getSession: () => customerSession,
        repo: mock.repo,
    });

    try {
        const update = await app.inject({
            method: 'PUT',
            url: '/v1/workspaces/ws_1/session-state',
            payload: {
                expectedVersion: 0,
                state: { branch: 'feature/audit' },
            },
        });
        assert.equal(update.statusCode, 200);

        const checkpoint = await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws_1/checkpoints',
            payload: {
                label: 'audit-checkpoint',
            },
        });
        assert.equal(checkpoint.statusCode, 201);

        const eventNames = mock.auditEvents.map((item) => item.eventName);
        assert.ok(eventNames.includes('session_update'));
        assert.ok(eventNames.includes('session_checkpoint_created'));
    } finally {
        await app.close();
    }
});
