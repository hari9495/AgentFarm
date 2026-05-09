import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerMeetingRoutes } from './meetings.js';

type SessionContext = {
    userId: string;
    tenantId: string;
    workspaceIds: string[];
    expiresAt: number;
};

const session = (): SessionContext => ({
    userId: 'u1',
    tenantId: 't1',
    workspaceIds: ['ws1'],
    expiresAt: Date.now() + 60_000,
});

const stubSession: {
    id: string;
    tenantId: string;
    workspaceId: string;
    agentId: string;
    meetingUrl: string;
    platform: string;
    status: string;
    language: string | null;
    transcriptRaw: string | null;
    summaryText: string | null;
    actionItems: string | null;
    startedAt: Date;
    endedAt: Date | null;
    updatedAt: Date;
} = {
    id: 'sess-001',
    tenantId: 't1',
    workspaceId: 'ws1',
    agentId: 'agent-1',
    meetingUrl: 'https://teams.microsoft.com/l/meeting/test',
    platform: 'teams',
    status: 'joining',
    language: null,
    transcriptRaw: null,
    summaryText: null,
    actionItems: null,
    startedAt: new Date('2026-05-09T10:00:00Z'),
    endedAt: null,
    updatedAt: new Date('2026-05-09T10:00:00Z'),
};

// ---------------------------------------------------------------------------
// GET /v1/meetings/:sessionId
// ---------------------------------------------------------------------------

test('GET /v1/meetings/:sessionId returns 200 with session record', async () => {
    const prisma = {
        meetingSession: {
            findFirst: async () => ({ ...stubSession }),
        },
    };

    const app = Fastify({ logger: false });
    await registerMeetingRoutes(app, { getSession: () => session(), prisma: prisma as never });

    try {
        const res = await app.inject({
            method: 'GET',
            url: '/v1/meetings/sess-001',
        });
        assert.equal(res.statusCode, 200);
        const body = res.json() as { id: string; status: string };
        assert.equal(body.id, 'sess-001');
        assert.equal(body.status, 'joining');
    } finally {
        await app.close();
    }
});

test('GET /v1/meetings/:sessionId returns 404 when not found', async () => {
    const prisma = {
        meetingSession: {
            findFirst: async () => null,
        },
    };

    const app = Fastify({ logger: false });
    await registerMeetingRoutes(app, { getSession: () => session(), prisma: prisma as never });

    try {
        const res = await app.inject({ method: 'GET', url: '/v1/meetings/missing-id' });
        assert.equal(res.statusCode, 404);
    } finally {
        await app.close();
    }
});

// ---------------------------------------------------------------------------
// POST /v1/meetings
// ---------------------------------------------------------------------------

test('POST /v1/meetings creates a session and returns 201 with sessionId', async () => {
    const created = { ...stubSession, id: 'sess-new' };
    const prisma = {
        meetingSession: {
            create: async () => created,
        },
    };

    const app = Fastify({ logger: false });
    await registerMeetingRoutes(app, { getSession: () => session(), prisma: prisma as never });

    try {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/meetings',
            payload: {
                tenantId: 't1',
                workspaceId: 'ws1',
                agentId: 'agent-1',
                meetingUrl: 'https://zoom.us/j/12345',
                platform: 'zoom',
            },
        });
        assert.equal(res.statusCode, 201);
        const body = res.json() as { sessionId: string };
        assert.equal(body.sessionId, 'sess-new');
    } finally {
        await app.close();
    }
});

test('POST /v1/meetings returns 400 when required fields are missing', async () => {
    const prisma = { meetingSession: { create: async () => stubSession } };

    const app = Fastify({ logger: false });
    await registerMeetingRoutes(app, { getSession: () => session(), prisma: prisma as never });

    try {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/meetings',
            payload: { tenantId: 't1' }, // missing workspaceId, agentId, etc.
        });
        assert.equal(res.statusCode, 400);
    } finally {
        await app.close();
    }
});

// ---------------------------------------------------------------------------
// PATCH /v1/meetings/:sessionId
// ---------------------------------------------------------------------------

test('PATCH /v1/meetings/:sessionId updates status and returns updated record', async () => {
    const updated = { ...stubSession, status: 'transcribing' };
    const prisma = {
        meetingSession: {
            findFirst: async () => ({ ...stubSession }),
            update: async () => updated,
        },
    };

    const app = Fastify({ logger: false });
    await registerMeetingRoutes(app, { getSession: () => session(), prisma: prisma as never });

    try {
        const res = await app.inject({
            method: 'PATCH',
            url: '/v1/meetings/sess-001',
            payload: { status: 'transcribing' },
        });
        assert.equal(res.statusCode, 200);
        const body = res.json() as { status: string };
        assert.equal(body.status, 'transcribing');
    } finally {
        await app.close();
    }
});

test('PATCH /v1/meetings/:sessionId returns 404 when session not found', async () => {
    const prisma = {
        meetingSession: {
            findFirst: async () => null,
            update: async () => stubSession,
        },
    };

    const app = Fastify({ logger: false });
    await registerMeetingRoutes(app, { getSession: () => session(), prisma: prisma as never });

    try {
        const res = await app.inject({
            method: 'PATCH',
            url: '/v1/meetings/missing-id',
            payload: { status: 'done' },
        });
        assert.equal(res.statusCode, 404);
    } finally {
        await app.close();
    }
});

// ---------------------------------------------------------------------------
// DELETE /v1/meetings/:sessionId
// ---------------------------------------------------------------------------

test('DELETE /v1/meetings/:sessionId sets status to deleted and returns ok', async () => {
    let updatedStatus = '';
    const prisma = {
        meetingSession: {
            findFirst: async () => ({ ...stubSession }),
            update: async (_args: { where: unknown; data: { status: string } }) => {
                updatedStatus = _args.data.status;
                return { ...stubSession, status: 'deleted' };
            },
        },
    };

    const app = Fastify({ logger: false });
    await registerMeetingRoutes(app, { getSession: () => session(), prisma: prisma as never });

    try {
        const res = await app.inject({
            method: 'DELETE',
            url: '/v1/meetings/sess-001',
        });
        assert.equal(res.statusCode, 200);
        const body = res.json() as { ok: boolean };
        assert.equal(body.ok, true);
        assert.equal(updatedStatus, 'deleted');
    } finally {
        await app.close();
    }
});

test('DELETE /v1/meetings/:sessionId returns 404 when session not found', async () => {
    const prisma = {
        meetingSession: {
            findFirst: async () => null,
            update: async () => stubSession,
        },
    };

    const app = Fastify({ logger: false });
    await registerMeetingRoutes(app, { getSession: () => session(), prisma: prisma as never });

    try {
        const res = await app.inject({
            method: 'DELETE',
            url: '/v1/meetings/missing-id',
        });
        assert.equal(res.statusCode, 404);
    } finally {
        await app.close();
    }
});

// ---------------------------------------------------------------------------
// PATCH /v1/meetings/:sessionId/speaking-agent
// ---------------------------------------------------------------------------

test('PATCH /v1/meetings/:sessionId/speaking-agent updates speakingEnabled and returns updated record', async () => {
    const updated = { ...stubSession, speakingEnabled: true, agentVoiceId: 'voice-999' };
    const prisma = {
        meetingSession: {
            findFirst: async () => ({ ...stubSession }),
            update: async () => updated,
        },
    };

    const app = Fastify({ logger: false });
    await registerMeetingRoutes(app, { getSession: () => session(), prisma: prisma as never });

    try {
        const res = await app.inject({
            method: 'PATCH',
            url: '/v1/meetings/sess-001/speaking-agent',
            payload: { speakingEnabled: true, agentVoiceId: 'voice-999' },
        });
        assert.equal(res.statusCode, 200);
        const body = res.json() as { speakingEnabled: boolean; agentVoiceId: string };
        assert.equal(body.speakingEnabled, true);
        assert.equal(body.agentVoiceId, 'voice-999');
    } finally {
        await app.close();
    }
});

test('PATCH /v1/meetings/:sessionId/speaking-agent returns 404 when session not found', async () => {
    const prisma = {
        meetingSession: {
            findFirst: async () => null,
            update: async () => stubSession,
        },
    };

    const app = Fastify({ logger: false });
    await registerMeetingRoutes(app, { getSession: () => session(), prisma: prisma as never });

    try {
        const res = await app.inject({
            method: 'PATCH',
            url: '/v1/meetings/missing-id/speaking-agent',
            payload: { speakingEnabled: true },
        });
        assert.equal(res.statusCode, 404);
    } finally {
        await app.close();
    }
});
