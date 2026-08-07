import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { verifyHmacSha256 } from '../../lib/webhook-verify.js';
import {
    scheduleMeetingResearch,
} from '@agentfarm/agent-runtime/sales/pre-meeting-research.js';
import { decryptSalesConfigFields } from './sales-config.js';

type PrismaWithBooking = {
    bookingEvent: {
        create: (args: { data: Record<string, unknown> }) => Promise<{ id: string }>;
        findFirst: (args: { where: Record<string, unknown> }) => Promise<Record<string, unknown> | null>;
        update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<unknown>;
    };
    prospect: {
        findFirst: (args: { where: Record<string, unknown> }) => Promise<Record<string, unknown> | null>;
        update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<unknown>;
    };
    salesAgentConfig: {
        findFirst: (args: { where: Record<string, unknown> }) => Promise<Record<string, unknown> | null>;
    };
};

export type RegisterBookingWebhookRoutesOptions = {
    prisma?: PrismaClient;
    /** Overrides scheduleMeetingResearch — used in tests. */
    scheduleResearchFn?: typeof scheduleMeetingResearch;
};

const getPrisma = async (): Promise<PrismaClient> => {
    const { prisma } = await import('../../lib/db.js');
    return prisma;
};

export async function registerBookingWebhookRoutes(
    app: FastifyInstance,
    options: RegisterBookingWebhookRoutesOptions,
): Promise<void> {
    const resolvePrisma = options.prisma
        ? () => Promise.resolve(options.prisma!)
        : getPrisma;

    const doScheduleResearch = options.scheduleResearchFn ?? scheduleMeetingResearch;

    // -------------------------------------------------------------------------
    // POST /v1/webhooks/booking
    //
    // Receives booking events from calendar providers (Calendly, Cal.com, etc.).
    // - Always returns HTTP 200 { received: true } to prevent provider retries.
    // - Verifies HMAC-SHA256 signature when bookingWebhookSecret is configured.
    // - Creates a BookingEvent record and updates Prospect status to meeting_booked.
    // - Schedules pre-meeting research 30 minutes before the meeting.
    // -------------------------------------------------------------------------
    app.post('/v1/webhooks/booking', async (request, reply) => {
        const tenantId = request.headers['x-tenant-id'];
        if (!tenantId || typeof tenantId !== 'string') {
            // Cannot associate without tenantId — always acknowledge
            return reply.code(200).send({ received: true });
        }

        const provider = typeof request.headers['x-booking-provider'] === 'string'
            ? request.headers['x-booking-provider']
            : 'other';
        const signature = typeof request.headers['x-webhook-signature'] === 'string'
            ? request.headers['x-webhook-signature']
            : undefined;

        const prisma = await resolvePrisma();
        const db = prisma as unknown as PrismaWithBooking;

        // Verify HMAC signature — fail closed: if a secret is configured, a valid
        // signature MUST be present. Requests without a signature are rejected when
        // a secret is configured to prevent unsigned forgeries.
        const salesConfig = decryptSalesConfigFields(await db.salesAgentConfig.findFirst({
            where: { tenantId },
        }));
        const secret = salesConfig?.['bookingWebhookSecret']
            ? String(salesConfig['bookingWebhookSecret'])
            : (process.env['BOOKING_WEBHOOK_SECRET'] ?? '');

        if (secret) {
            if (!signature) {
                return reply.code(401).send({ error: 'Missing x-webhook-signature header' });
            }
            const rawBody = JSON.stringify(request.body);
            const valid = verifyHmacSha256(rawBody, secret, signature, 'hex');
            if (!valid) {
                return reply.code(401).send({ error: 'Invalid webhook signature' });
            }
        }

        const body = request.body as Record<string, unknown>;
        const guestEmail = typeof body['guestEmail'] === 'string' ? body['guestEmail'] : undefined;
        const scheduledAtRaw = typeof body['scheduledAt'] === 'string' ? body['scheduledAt'] : undefined;
        const event = typeof body['event'] === 'string' ? body['event'] : 'UNKNOWN';
        const cancelled = event.toUpperCase().includes('CANCEL');

        // Resolve prospect from guestEmail
        let prospectId: string | undefined;
        let botId: string | undefined;

        if (guestEmail) {
            const prospect = await db.prospect.findFirst({
                where: { tenantId, email: guestEmail },
            });
            if (prospect) {
                prospectId = String(prospect['id']);
                botId = String(prospect['botId']);
            }
        }

        // Create BookingEvent record
        await db.bookingEvent.create({
            data: {
                tenantId,
                prospectId,
                botId,
                bookingProvider: provider,
                externalId: typeof body['bookingId'] === 'string' ? body['bookingId'] : undefined,
                scheduledAt: scheduledAtRaw ? new Date(scheduledAtRaw) : undefined,
                guestEmail,
                guestName: typeof body['guestName'] === 'string' ? body['guestName'] : undefined,
                meetingTitle: typeof body['meetingTitle'] === 'string' ? body['meetingTitle'] : undefined,
                status: cancelled ? 'cancelled' : 'confirmed',
                rawPayload: JSON.stringify(body),
            },
        });

        // Update prospect status and schedule research (non-cancelled bookings only)
        if (prospectId && !cancelled) {
            await db.prospect.update({
                where: { id: prospectId },
                data: { status: 'meeting_booked', updatedAt: new Date() },
            });

            if (scheduledAtRaw && botId) {
                const meetingTime = new Date(scheduledAtRaw);
                // Research brief 30 minutes before meeting
                const researchTime = new Date(meetingTime.getTime() - 30 * 60 * 1000);
                doScheduleResearch(prospectId, tenantId, botId, researchTime, prisma);
            }
        }

        return reply.code(200).send({ received: true });
    });
}
