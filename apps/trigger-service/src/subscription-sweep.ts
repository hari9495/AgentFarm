import type { PrismaClient } from '@prisma/client';

export const GRACE_PERIOD_DAYS = 3;

export async function runSubscriptionSweep(
    prisma: PrismaClient,
): Promise<{ expired: number; suspended: number }> {
    let expired = 0;
    let suspended = 0;

    try {
        const now = new Date();

        // ------------------------------------------------------------------
        // Sweep 1: active → expired
        // Find subscriptions that are active but past their expiresAt.
        // ------------------------------------------------------------------

        const [activeTenantSubs, activeAgentSubs] = await Promise.all([
            prisma.tenantSubscription.findMany({
                where: { status: 'active', expiresAt: { lt: now } },
            }),
            prisma.agentSubscription.findMany({
                where: { status: 'active', expiresAt: { lt: now } },
            }),
        ]);

        for (const sub of activeTenantSubs) {
            await prisma.$transaction([
                prisma.tenantSubscription.update({
                    where: { id: sub.id },
                    data: { status: 'expired' },
                }),
                prisma.subscriptionEvent.create({
                    data: {
                        tenantId: sub.tenantId,
                        tenantSubscriptionId: sub.id,
                        fromStatus: 'active',
                        toStatus: 'expired',
                        actor: 'system',
                        reason: 'Subscription expiry detected by sweep',
                        occurredAt: now,
                    },
                }),
            ]);
            expired += 1;
        }

        for (const sub of activeAgentSubs) {
            await prisma.$transaction([
                prisma.agentSubscription.update({
                    where: { id: sub.id },
                    data: { status: 'expired' },
                }),
                prisma.subscriptionEvent.create({
                    data: {
                        tenantId: sub.tenantId,
                        agentSubscriptionId: sub.id,
                        fromStatus: 'active',
                        toStatus: 'expired',
                        actor: 'system',
                        reason: 'Subscription expiry detected by sweep',
                        occurredAt: now,
                    },
                }),
            ]);
            expired += 1;
        }

        // ------------------------------------------------------------------
        // Sweep 2: expired → suspended
        // Find subscriptions that are expired AND past the grace period.
        // ------------------------------------------------------------------

        const graceCutoff = new Date(now.getTime() - GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000);

        const [expiredTenantSubs, expiredAgentSubs] = await Promise.all([
            prisma.tenantSubscription.findMany({
                where: { status: 'expired', expiresAt: { lt: graceCutoff } },
            }),
            prisma.agentSubscription.findMany({
                where: { status: 'expired', expiresAt: { lt: graceCutoff } },
            }),
        ]);

        for (const sub of expiredTenantSubs) {
            await prisma.$transaction([
                prisma.tenantSubscription.update({
                    where: { id: sub.id },
                    data: { status: 'suspended', suspendedAt: now },
                }),
                prisma.subscriptionEvent.create({
                    data: {
                        tenantId: sub.tenantId,
                        tenantSubscriptionId: sub.id,
                        fromStatus: 'expired',
                        toStatus: 'suspended',
                        actor: 'system',
                        reason: 'Grace period elapsed, subscription suspended',
                        occurredAt: now,
                    },
                }),
                prisma.notificationLog.create({
                    data: {
                        tenantId: sub.tenantId,
                        channel: 'system',
                        eventTrigger: 'subscription_suspended',
                        status: 'sent',
                        payload: { subscriptionId: sub.id, type: 'tenant' },
                        sentAt: now,
                    },
                }),
            ]);
            suspended += 1;
        }

        for (const sub of expiredAgentSubs) {
            await prisma.$transaction([
                prisma.agentSubscription.update({
                    where: { id: sub.id },
                    data: { status: 'suspended', suspendedAt: now },
                }),
                prisma.subscriptionEvent.create({
                    data: {
                        tenantId: sub.tenantId,
                        agentSubscriptionId: sub.id,
                        fromStatus: 'expired',
                        toStatus: 'suspended',
                        actor: 'system',
                        reason: 'Grace period elapsed, subscription suspended',
                        occurredAt: now,
                    },
                }),
                prisma.notificationLog.create({
                    data: {
                        tenantId: sub.tenantId,
                        channel: 'system',
                        eventTrigger: 'subscription_suspended',
                        status: 'sent',
                        payload: { subscriptionId: sub.id, type: 'agent' },
                        sentAt: now,
                    },
                }),
            ]);
            suspended += 1;
        }
    } catch (err) {
        console.error('[subscription-sweep] sweep failed:', err);
    }

    return { expired, suspended };
}

export function startSubscriptionSweep(
    prisma: PrismaClient,
    intervalMs = 24 * 60 * 60 * 1000,
): NodeJS.Timeout {
    runSubscriptionSweep(prisma).catch(console.error);
    runRenewalReminderSweep(prisma).catch(console.error);
    return setInterval(() => {
        runSubscriptionSweep(prisma).catch(console.error);
        runRenewalReminderSweep(prisma).catch(console.error);
    }, intervalMs);
}

// ---------------------------------------------------------------------------
// Renewal reminder sweep
// ---------------------------------------------------------------------------

export const RENEWAL_REMINDER_DAYS = 7;

export async function runRenewalReminderSweep(
    prisma: PrismaClient,
): Promise<{ reminders: number }> {
    let reminders = 0;

    try {
        const now = new Date();
        const windowStart = new Date(now.getTime() + RENEWAL_REMINDER_DAYS * 86_400_000);
        const windowEnd = new Date(windowStart.getTime() + 24 * 60 * 60 * 1000);

        const tenantSubs = await prisma.tenantSubscription.findMany({
            where: {
                status: 'active',
                expiresAt: { gte: windowStart, lte: windowEnd },
            },
            select: { id: true, tenantId: true, expiresAt: true },
        });

        const todayStart = new Date(now);
        todayStart.setHours(0, 0, 0, 0);

        for (const sub of tenantSubs) {
            const existing = await prisma.notificationLog.findFirst({
                where: {
                    tenantId: sub.tenantId,
                    eventTrigger: 'subscription_renewal_reminder',
                    sentAt: { gte: todayStart },
                },
                select: { id: true },
            });
            if (existing) continue;

            await prisma.notificationLog.create({
                data: {
                    tenantId: sub.tenantId,
                    channel: 'email',
                    eventTrigger: 'subscription_renewal_reminder',
                    status: 'sent',
                    payload: {
                        subscriptionId: sub.id,
                        expiresAt: sub.expiresAt.toISOString(),
                        daysUntilExpiry: RENEWAL_REMINDER_DAYS,
                        message: `Your AgentFarm subscription expires on ${sub.expiresAt.toDateString()}. Renew now to avoid interruption.`,
                    },
                    sentAt: now,
                },
            });
            reminders += 1;
        }
    } catch (err) {
        console.error('[subscription-sweep] renewal reminder sweep failed:', err);
    }

    return { reminders };
}
