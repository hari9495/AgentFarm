import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerAuditRoutes } from './audit.js';

type StoredEvent = {
    id: string;
    tenantId: string;
    workspaceId: string;
    botId: string;
    eventType: string;
    severity: 'info' | 'warn' | 'error';
    summary: string;
    sourceSystem: string;
    correlationId: string;
    createdAt: Date;
};

const session = () => ({
    userId: 'user_1',
    tenantId: 'tenant_1',
    workspaceIds: ['ws_1'],
    expiresAt: Date.now() + 60_000,
});

const createRepo = () => {
    const events: StoredEvent[] = [];

    return {
        events,
        repo: {
            async createEvent(input: Omit<StoredEvent, 'id'>) {
                const created: StoredEvent = {
                    id: `evt_${events.length + 1}`,
                    ...input,
                };
                events.push(created);
                return created;
            },
            async listEvents(input: {
                tenantId: string;
                workspaceId: string;
                botId?: string;
                eventType?: string;
                severity?: 'info' | 'warn' | 'error';
                from?: Date;
                to?: Date;
                before?: Date;
                limit: number;
            }) {
                return events
                    .filter((event) => event.tenantId === input.tenantId && event.workspaceId === input.workspaceId)
                    .filter((event) => (input.botId ? event.botId === input.botId : true))
                    .filter((event) => (input.eventType ? event.eventType === input.eventType : true))
                    .filter((event) => (input.severity ? event.severity === input.severity : true))
                    .filter((event) => (input.from ? event.createdAt >= input.from : true))
                    .filter((event) => (input.to ? event.createdAt <= input.to : true))
                    .filter((event) => (input.before ? event.createdAt < input.before : true))
                    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
                    .slice(0, input.limit);
            },
            async countRetentionCandidates(input: { tenantId: string; workspaceId: string; cutoff: Date }) {
                return events.filter(
                    (event) =>
                        event.tenantId === input.tenantId
                        && event.workspaceId === input.workspaceId
                        && event.createdAt < input.cutoff,
                ).length;
            },
            async deleteRetentionCandidates(input: { tenantId: string; workspaceId: string; cutoff: Date }) {
                let deleted = 0;
                for (let i = events.length - 1; i >= 0; i -= 1) {
                    const event = events[i];
                    if (
                        event
                        && event.tenantId === input.tenantId
                        && event.workspaceId === input.workspaceId
                        && event.createdAt < input.cutoff
                    ) {
                        events.splice(i, 1);
                        deleted += 1;
                    }
                }
                return deleted;
            },
            async listAllForExport(input: { tenantId: string; workspaceId?: string; from: Date; to: Date }) {
                return events.filter(
                    (e) =>
                        e.tenantId === input.tenantId
                        && (!input.workspaceId || e.workspaceId === input.workspaceId)
                        && e.createdAt >= input.from
                        && e.createdAt <= input.to,
                );
            },
        },
    };
};

test('append-only audit endpoint creates event in workspace scope', async () => {
    const app = Fastify();
    const fake = createRepo();

    await registerAuditRoutes(app, {
        getSession: () => session(),
        repo: fake.repo,
        now: () => 1_000,
    });

    try {
        const response = await app.inject({
            method: 'POST',
            url: '/v1/audit/events',
            payload: {
                workspace_id: 'ws_1',
                bot_id: 'bot_1',
                event_type: 'approval_event',
                severity: 'warn',
                summary: 'Approval escalated',
                source_system: 'approval-service',
                correlation_id: 'corr_1',
            },
        });

        assert.equal(response.statusCode, 201);
        const body = response.json() as { event: { event_id: string; severity: string } };
        assert.equal(body.event.event_id, 'evt_1');
        assert.equal(body.event.severity, 'warn');
        assert.equal(fake.events.length, 1);
    } finally {
        await app.close();
    }
});

test('audit query endpoint filters by severity and returns cursor', async () => {
    const app = Fastify();
    const fake = createRepo();

    fake.events.push(
        {
            id: 'evt_1',
            tenantId: 'tenant_1',
            workspaceId: 'ws_1',
            botId: 'bot_1',
            eventType: 'approval_event',
            severity: 'info',
            summary: 'Info event',
            sourceSystem: 'approval-service',
            correlationId: 'corr_1',
            createdAt: new Date('2026-04-22T10:00:00.000Z'),
        },
        {
            id: 'evt_2',
            tenantId: 'tenant_1',
            workspaceId: 'ws_1',
            botId: 'bot_1',
            eventType: 'approval_event',
            severity: 'warn',
            summary: 'Warn event',
            sourceSystem: 'approval-service',
            correlationId: 'corr_2',
            createdAt: new Date('2026-04-22T11:00:00.000Z'),
        },
    );

    await registerAuditRoutes(app, {
        getSession: () => session(),
        repo: fake.repo,
    });

    try {
        const response = await app.inject({
            method: 'GET',
            url: '/v1/audit/events?workspace_id=ws_1&severity=warn&limit=1',
        });

        assert.equal(response.statusCode, 200);
        const body = response.json() as {
            count: number;
            next_cursor: string | null;
            events: Array<{ event_id: string; severity: string }>;
        };

        assert.equal(body.count, 1);
        assert.equal(body.events[0]?.event_id, 'evt_2');
        assert.equal(body.events[0]?.severity, 'warn');
        assert.equal(typeof body.next_cursor, 'string');
    } finally {
        await app.close();
    }
});

test('retention cleanup supports dry-run and delete execution', async () => {
    const app = Fastify();
    const fake = createRepo();
    const now = Date.parse('2026-04-22T12:00:00.000Z');

    fake.events.push(
        {
            id: 'evt_old',
            tenantId: 'tenant_1',
            workspaceId: 'ws_1',
            botId: 'bot_1',
            eventType: 'approval_event',
            severity: 'warn',
            summary: 'Old event',
            sourceSystem: 'approval-service',
            correlationId: 'corr_old',
            createdAt: new Date('2025-12-01T00:00:00.000Z'),
        },
        {
            id: 'evt_new',
            tenantId: 'tenant_1',
            workspaceId: 'ws_1',
            botId: 'bot_1',
            eventType: 'approval_event',
            severity: 'info',
            summary: 'New event',
            sourceSystem: 'approval-service',
            correlationId: 'corr_new',
            createdAt: new Date('2026-04-21T00:00:00.000Z'),
        },
    );

    await registerAuditRoutes(app, {
        getSession: () => session(),
        repo: fake.repo,
        now: () => now,
    });

    try {
        const dryRun = await app.inject({
            method: 'POST',
            url: '/v1/audit/retention/cleanup',
            payload: {
                workspace_id: 'ws_1',
                retention_days: 30,
                dry_run: true,
            },
        });

        assert.equal(dryRun.statusCode, 200);
        const dryRunBody = dryRun.json() as { status: string; candidate_count: number; deleted_count: number };
        assert.equal(dryRunBody.status, 'dry_run');
        assert.equal(dryRunBody.candidate_count, 1);
        assert.equal(dryRunBody.deleted_count, 0);
        assert.equal(fake.events.length, 2);

        const execute = await app.inject({
            method: 'POST',
            url: '/v1/audit/retention/cleanup',
            payload: {
                workspace_id: 'ws_1',
                retention_days: 30,
                dry_run: false,
            },
        });

        assert.equal(execute.statusCode, 200);
        const executeBody = execute.json() as { status: string; deleted_count: number };
        assert.equal(executeBody.status, 'deleted');
        assert.equal(executeBody.deleted_count, 1);
        assert.equal(fake.events.length, 1);
        assert.equal(fake.events[0]?.id, 'evt_new');
    } finally {
        await app.close();
    }
});

// ---------------------------------------------------------------------------
// audit export
// ---------------------------------------------------------------------------

test('audit export: missing from or to returns 400', async () => {
    const app = Fastify();
    const fake = createRepo();
    await registerAuditRoutes(app, {
        getSession: () => session(),
        repo: fake.repo,
    });
    try {
        const res = await app.inject({
            method: 'GET',
            url: '/v1/audit/export?tenantId=tenant_1&from=2026-05-01T00:00:00.000Z',
        });
        assert.equal(res.statusCode, 400);
        assert.equal(res.json().error, 'invalid_request');
    } finally {
        await app.close();
    }
});

test('audit export: date range exceeds 90 days returns 400', async () => {
    const app = Fastify();
    const fake = createRepo();
    await registerAuditRoutes(app, {
        getSession: () => session(),
        repo: fake.repo,
    });
    try {
        const res = await app.inject({
            method: 'GET',
            url: '/v1/audit/export?tenantId=tenant_1&from=2026-01-01T00:00:00.000Z&to=2026-04-15T00:00:00.000Z',
        });
        assert.equal(res.statusCode, 400);
        assert.equal(res.json().error, 'date_range_exceeded');
    } finally {
        await app.close();
    }
});

test('audit export: returns CSV with correct header', async () => {
    const app = Fastify();
    const fake = createRepo();
    await registerAuditRoutes(app, {
        getSession: () => session(),
        repo: fake.repo,
    });
    try {
        const res = await app.inject({
            method: 'GET',
            url: '/v1/audit/export?tenantId=tenant_1&from=2026-05-01T00:00:00.000Z&to=2026-05-31T00:00:00.000Z',
        });
        assert.equal(res.statusCode, 200);
        assert.ok(res.headers['content-type']?.includes('text/csv'));
        const firstLine = res.body.split('\n')[0];
        assert.equal(firstLine, 'id,tenantId,workspaceId,botId,eventType,severity,createdAt,summary');
    } finally {
        await app.close();
    }
});

test('audit export: CSV rows contain correct field values', async () => {
    const app = Fastify();
    const fake = createRepo();

    const eventDate = new Date('2026-05-10T08:00:00.000Z');
    fake.events.push({
        id: 'evt_export_1',
        tenantId: 'tenant_1',
        workspaceId: 'ws_1',
        botId: 'bot_1',
        eventType: 'approval_event',
        severity: 'warn',
        summary: 'Export test event',
        sourceSystem: 'test',
        correlationId: 'corr_x',
        createdAt: eventDate,
    });

    await registerAuditRoutes(app, {
        getSession: () => session(),
        repo: fake.repo,
    });
    try {
        const res = await app.inject({
            method: 'GET',
            url: '/v1/audit/export?tenantId=tenant_1&from=2026-05-01T00:00:00.000Z&to=2026-05-31T00:00:00.000Z',
        });
        assert.equal(res.statusCode, 200);
        const lines = res.body.split('\n');
        // header + 1 data row
        assert.equal(lines.length, 2);
        const dataRow = lines[1] ?? '';
        assert.ok(dataRow.includes('"evt_export_1"'));
        assert.ok(dataRow.includes('"tenant_1"'));
        assert.ok(dataRow.includes('"ws_1"'));
        assert.ok(dataRow.includes('"warn"'));
        assert.ok(dataRow.includes('"Export test event"'));
        assert.ok(dataRow.includes('"2026-05-10T08:00:00.000Z"'));
    } finally {
        await app.close();
    }
});
