import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerDesktopProfileRoutes } from './desktop-profile.js';

const customerSession = {
    userId: 'user_1',
    tenantId: 'tenant_1',
    workspaceIds: ['ws_1'],
    scope: 'customer' as const,
    expiresAt: Date.now() + 60_000,
};

const createTestStore = () => ({
    profileByWorkspaceKey: new Map(),
});

const createMockRepo = () => {
    const profiles = new Map<string, {
        profileId: string;
        browser: string;
        storageRef?: string;
        tabState: Record<string, unknown>;
        tokenVersion: number;
        updatedAt: string;
    }>();
    const auditSummaries: string[] = [];
    const keyFor = (tenantId: string, workspaceId: string) => `${tenantId}:${workspaceId}`;

    return {
        repo: {
            async getProfile(input: { tenantId: string; workspaceId: string }) {
                const item = profiles.get(keyFor(input.tenantId, input.workspaceId));
                if (!item) {
                    return null;
                }
                return {
                    tenantId: input.tenantId,
                    workspaceId: input.workspaceId,
                    ...item,
                };
            },
            async upsertProfile(input: {
                tenantId: string;
                workspaceId: string;
                browser?: string;
                storageRef?: string;
                tabState?: Record<string, unknown>;
                nowIso: string;
            }) {
                const key = keyFor(input.tenantId, input.workspaceId);
                const current = profiles.get(key);
                const next = {
                    profileId: current?.profileId ?? `dp_${Math.random().toString(16).slice(2)}`,
                    browser: input.browser ?? current?.browser ?? 'chromium',
                    storageRef: input.storageRef ?? current?.storageRef,
                    tabState: input.tabState ?? current?.tabState ?? {},
                    tokenVersion: current?.tokenVersion ?? 1,
                    updatedAt: input.nowIso,
                };
                profiles.set(key, next);
                return {
                    tenantId: input.tenantId,
                    workspaceId: input.workspaceId,
                    ...next,
                };
            },
            async rotateProfile(input: { tenantId: string; workspaceId: string; nowIso: string }) {
                const key = keyFor(input.tenantId, input.workspaceId);
                const current = profiles.get(key);
                const profile = {
                    profileId: `dp_${Math.random().toString(16).slice(2)}`,
                    browser: current?.browser ?? 'chromium',
                    storageRef: current?.storageRef,
                    tabState: current?.tabState ?? {},
                    tokenVersion: (current?.tokenVersion ?? 0) + 1,
                    updatedAt: input.nowIso,
                };
                profiles.set(key, profile);
                return {
                    previousProfileId: current?.profileId ?? null,
                    profile: {
                        tenantId: input.tenantId,
                        workspaceId: input.workspaceId,
                        ...profile,
                    },
                };
            },
            async createAuditEvent(input: { summary: string }) {
                auditSummaries.push(input.summary);
            },
        },
        auditSummaries,
    };
};

test('GET returns default desktop profile when workspace has no persisted profile', async () => {
    const app = Fastify();

    await registerDesktopProfileRoutes(app, {
        getSession: () => customerSession,
        store: createTestStore(),
    });

    try {
        const response = await app.inject({
            method: 'GET',
            url: '/v1/workspaces/ws_1/desktop-profile',
        });

        assert.equal(response.statusCode, 200);
        const body = response.json() as {
            source: string;
            profileId: string | null;
            tokenVersion: number;
            browser: string;
        };

        assert.equal(body.source, 'default');
        assert.equal(body.profileId, null);
        assert.equal(body.tokenVersion, 0);
        assert.equal(body.browser, 'chromium');
    } finally {
        await app.close();
    }
});

test('PUT stores desktop profile and GET returns persisted profile metadata', async () => {
    const app = Fastify();

    await registerDesktopProfileRoutes(app, {
        getSession: () => customerSession,
        store: createTestStore(),
    });

    try {
        const putResponse = await app.inject({
            method: 'PUT',
            url: '/v1/workspaces/ws_1/desktop-profile',
            payload: {
                browser: 'edge',
                storageRef: 'kv://tenant_1/ws_1/desktop-profile',
                tabState: {
                    tabs: [
                        { title: 'AgentFarm Board', url: 'https://example.local/board' },
                    ],
                },
            },
        });
        assert.equal(putResponse.statusCode, 200);
        const putBody = putResponse.json() as {
            profileId: string;
            browser: string;
            tokenVersion: number;
            storageRef: string;
            tabState: { tabs?: unknown[] };
        };
        assert.ok(putBody.profileId);
        assert.equal(putBody.browser, 'edge');
        assert.equal(putBody.tokenVersion, 1);
        assert.equal(putBody.storageRef, 'kv://tenant_1/ws_1/desktop-profile');
        assert.equal(Array.isArray(putBody.tabState.tabs), true);

        const getResponse = await app.inject({
            method: 'GET',
            url: '/v1/workspaces/ws_1/desktop-profile',
        });
        assert.equal(getResponse.statusCode, 200);
        const getBody = getResponse.json() as {
            source: string;
            profileId: string;
            browser: string;
            tokenVersion: number;
            storageRef: string;
        };
        assert.equal(getBody.source, 'persisted');
        assert.equal(getBody.profileId, putBody.profileId);
        assert.equal(getBody.browser, 'edge');
        assert.equal(getBody.tokenVersion, 1);
        assert.equal(getBody.storageRef, 'kv://tenant_1/ws_1/desktop-profile');
    } finally {
        await app.close();
    }
});

test('rotate endpoint changes profile id and increments token version', async () => {
    const app = Fastify();

    await registerDesktopProfileRoutes(app, {
        getSession: () => customerSession,
        store: createTestStore(),
    });

    try {
        const initial = await app.inject({
            method: 'PUT',
            url: '/v1/workspaces/ws_1/desktop-profile',
            payload: {
                browser: 'chromium',
                tabState: { tabs: [] },
            },
        });
        assert.equal(initial.statusCode, 200);
        const initialBody = initial.json() as { profileId: string; tokenVersion: number };
        assert.equal(initialBody.tokenVersion, 1);

        const rotate = await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws_1/browser-sessions/rotate',
            payload: {
                reason: 'credential refresh',
            },
        });
        assert.equal(rotate.statusCode, 202);
        const rotateBody = rotate.json() as {
            previousProfileId: string | null;
            newProfileId: string;
            tokenVersion: number;
        };
        assert.equal(rotateBody.previousProfileId, initialBody.profileId);
        assert.notEqual(rotateBody.newProfileId, initialBody.profileId);
        assert.equal(rotateBody.tokenVersion, 2);
    } finally {
        await app.close();
    }
});

test('rejects unsupported browser values', async () => {
    const app = Fastify();

    await registerDesktopProfileRoutes(app, {
        getSession: () => customerSession,
        store: createTestStore(),
    });

    try {
        const response = await app.inject({
            method: 'PUT',
            url: '/v1/workspaces/ws_1/desktop-profile',
            payload: {
                browser: 'safari',
            },
        });

        assert.equal(response.statusCode, 400);
        const body = response.json() as { error: string };
        assert.equal(body.error, 'invalid_request');
    } finally {
        await app.close();
    }
});

test('returns forbidden when session cannot access workspace', async () => {
    const app = Fastify();

    await registerDesktopProfileRoutes(app, {
        getSession: () => customerSession,
        store: createTestStore(),
    });

    try {
        const response = await app.inject({
            method: 'GET',
            url: '/v1/workspaces/ws_2/desktop-profile',
        });

        assert.equal(response.statusCode, 403);
        const body = response.json() as { error: string };
        assert.equal(body.error, 'forbidden');
    } finally {
        await app.close();
    }
});

test('runtime token access can rotate profile and writes audit summary', async () => {
    const app = Fastify();
    const mock = createMockRepo();

    await registerDesktopProfileRoutes(app, {
        getSession: () => null,
        repo: mock.repo,
        env: {
            RUNTIME_SESSION_SHARED_TOKEN: 'session-token-123',
        },
    });

    try {
        const rotate = await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws_1/browser-sessions/rotate?tenant_id=tenant_1',
            headers: {
                'x-runtime-session-token': 'session-token-123',
            },
            payload: {
                reason: 'runtime restore',
            },
        });

        assert.equal(rotate.statusCode, 202);
        const body = rotate.json() as { tokenVersion: number };
        assert.equal(body.tokenVersion, 1);
        assert.ok(mock.auditSummaries.some((summary) => summary.includes('Desktop profile rotated')));
    } finally {
        await app.close();
    }
});
