import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerBookingWebhookRoutes } from './booking-webhook.js';

// ---------------------------------------------------------------------------
// Minimal Prisma stub
// ---------------------------------------------------------------------------
type Row = Record<string, unknown>;

interface PrismaStub {
    bookingEvent: {
        create: (args: { data: Record<string, unknown> }) => Promise<{ id: string }>;
    };
    prospect: {
        findFirst: (args: { where: Record<string, unknown> }) => Promise<Row | null>;
        update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<unknown>;
    };
    salesAgentConfig: {
        findFirst: (args: { where: Record<string, unknown> }) => Promise<Row | null>;
    };
    _created: Row[];
    _updated: Row[];
}

function makePrismaStub(
    prospect: Row | null = null,
    config: Row | null = null,
): PrismaStub {
    const created: Row[] = [];
    const updated: Row[] = [];

    return {
        bookingEvent: {
            async create({ data }: { data: Record<string, unknown> }) {
                created.push({ type: 'booking', ...data });
                return { id: 'booking-1' };
            },
        },
        prospect: {
            async findFirst() {
                return prospect;
            },
            async update({ data }: { where: unknown; data: Record<string, unknown> }) {
                updated.push({ type: 'prospect', ...data });
                return { ...prospect, ...data };
            },
        },
        salesAgentConfig: {
            async findFirst() {
                return config;
            },
        },
        _created: created,
        _updated: updated,
    };
}

// ---------------------------------------------------------------------------
// Helper to build a Fastify app for tests
// ---------------------------------------------------------------------------
function makeApp(
    prisma: PrismaStub,
    scheduleResearchFn: (...args: unknown[]) => void = () => undefined,
) {
    const app = Fastify({ logger: false });
    void registerBookingWebhookRoutes(app, {
        prisma: prisma as never,
        scheduleResearchFn: scheduleResearchFn as never,
    });
    return app;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /v1/webhooks/booking', () => {
    test('returns 200 { received: true } when x-tenant-id header is missing', async () => {
        const prisma = makePrismaStub();
        const app = makeApp(prisma);

        try {
            const res = await app.inject({
                method: 'POST',
                url: '/v1/webhooks/booking',
                payload: { event: 'BOOKING_CREATED', guestEmail: 'test@example.com' },
            });

            assert.equal(res.statusCode, 200);
            const body = res.json<{ received: boolean }>();
            assert.equal(body.received, true);
        } finally {
            await app.close();
        }
    });

    test('creates BookingEvent and updates Prospect status for valid payload', async () => {
        const prisma = makePrismaStub({
            id: 'prospect-1',
            botId: 'bot-1',
            email: 'alice@example.com',
            status: 'contacted',
        });

        let researchScheduled = false;
        const app = makeApp(prisma, () => { researchScheduled = true; });

        try {
            const res = await app.inject({
                method: 'POST',
                url: '/v1/webhooks/booking',
                headers: { 'x-tenant-id': 'tenant-1', 'x-booking-provider': 'calendly' },
                payload: {
                    event: 'BOOKING_CREATED',
                    bookingId: 'ext-123',
                    guestEmail: 'alice@example.com',
                    guestName: 'Alice Lee',
                    meetingTitle: 'Product Demo',
                    scheduledAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
                },
            });

            assert.equal(res.statusCode, 200);
            const body = res.json<{ received: boolean }>();
            assert.equal(body.received, true);

            const bookingCreated = prisma._created.find((r: Row) => r['type'] === 'booking');
            assert.ok(bookingCreated, 'should create a BookingEvent record');
            assert.equal(bookingCreated['status'], 'confirmed');
            assert.equal(bookingCreated['guestEmail'], 'alice@example.com');

            const prospectUpdate = prisma._updated.find((r: Row) => r['type'] === 'prospect');
            assert.ok(prospectUpdate, 'should update the Prospect');
            assert.equal(prospectUpdate['status'], 'meeting_booked');

            assert.equal(researchScheduled, true, 'should schedule pre-meeting research');
        } finally {
            await app.close();
        }
    });

    test('returns 200 but ignores payload when HMAC signature is invalid', async () => {
        const prisma = makePrismaStub(null, {
            id: 'cfg-1',
            bookingWebhookSecret: 'super-secret-key',
        });
        const app = makeApp(prisma);

        try {
            const res = await app.inject({
                method: 'POST',
                url: '/v1/webhooks/booking',
                headers: {
                    'x-tenant-id': 'tenant-1',
                    'x-webhook-signature': 'invalidsignature',
                },
                payload: {
                    event: 'BOOKING_CREATED',
                    guestEmail: 'eve@evil.com',
                },
            });

            assert.equal(res.statusCode, 200);
            const body = res.json<{ received: boolean }>();
            assert.equal(body.received, true);

            // No booking event should be created
            const bookingCreated = prisma._created.find((r: Row) => r['type'] === 'booking');
            assert.equal(bookingCreated, undefined, 'should NOT create booking on invalid signature');
        } finally {
            await app.close();
        }
    });

    test('does not update Prospect status for CANCELLED event', async () => {
        const prisma = makePrismaStub({
            id: 'prospect-1',
            botId: 'bot-1',
            email: 'alice@example.com',
            status: 'meeting_booked',
        });

        let researchScheduled = false;
        const app = makeApp(prisma, () => { researchScheduled = true; });

        try {
            const res = await app.inject({
                method: 'POST',
                url: '/v1/webhooks/booking',
                headers: { 'x-tenant-id': 'tenant-1' },
                payload: {
                    event: 'BOOKING_CANCELLED',
                    bookingId: 'ext-123',
                    guestEmail: 'alice@example.com',
                    cancelledAt: new Date().toISOString(),
                },
            });

            assert.equal(res.statusCode, 200);

            const bookingCreated = prisma._created.find((r: Row) => r['type'] === 'booking');
            assert.ok(bookingCreated, 'should still create a BookingEvent record');
            assert.equal(bookingCreated['status'], 'cancelled');

            // Prospect should NOT be updated to meeting_booked on cancellation
            const prospectUpdate = prisma._updated.find((r: Row) => r['type'] === 'prospect');
            assert.equal(prospectUpdate, undefined, 'should NOT update prospect on cancellation');

            assert.equal(researchScheduled, false, 'should NOT schedule research on cancellation');
        } finally {
            await app.close();
        }
    });
});
