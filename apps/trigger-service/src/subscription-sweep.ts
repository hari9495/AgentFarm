import type { PrismaClient } from '@prisma/client';

export const GRACE_PERIOD_DAYS = 3;

// ---------------------------------------------------------------------------
// VM SKU tier thresholds — must match azure-client.ts vmSkuForAgentCount.
// ---------------------------------------------------------------------------

function vmSkuForAgentCount(agentCount: number): string {
    if (agentCount <= 1) return 'Standard_B2s';
    if (agentCount <= 3) return 'Standard_B4ms';
    if (agentCount <= 6) return 'Standard_D4s_v3';
    return 'Standard_D8s_v3';
}

export async function runSubscriptionSweep(
    prisma: PrismaClient,
): Promise<{ expired: number; suspended: number; scaled_down: number }> {
    let expired = 0;
    let suspended = 0;
    let scaled_down = 0;

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

            // Scale-down check: if removing this agent drops the workspace VM to a
            // smaller tier, queue a vm_resize job so the customer isn't billed for
            // unused capacity.
            scaled_down += await maybeQueueScaleDown(prisma, sub as { tenantId: string; agentId: string; planId: string }, now);
        }
    } catch (err) {
        console.error('[subscription-sweep] sweep failed:', err);
    }

    return { expired, suspended, scaled_down };
}

// ---------------------------------------------------------------------------
// Scale-down helper: queue a vm_resize job when agent count drops a tier
// ---------------------------------------------------------------------------

async function maybeQueueScaleDown(
    prisma: PrismaClient,
    sub: { tenantId: string; agentId: string; planId: string },
    now: Date,
): Promise<number> {
    try {
        // Find which workspace this agent belongs to.
        const bot = await (prisma as any).bot.findFirst({
            where: { id: sub.agentId },
            select: { workspaceId: true, id: true, role: true },
        }) as { workspaceId: string; id: string; role: string } | null;

        if (!bot) return 0;

        // Look up the current workspace VM size.
        const workspaceVm = await (prisma as any).workspaceVm.findUnique({
            where: { workspaceId: bot.workspaceId },
            select: { vmSize: true },
        }) as { vmSize: string } | null;

        if (!workspaceVm) return 0;  // VM not provisioned yet — nothing to resize

        // Count remaining active bots after this suspension.
        const remainingBots = await (prisma as any).bot.count({
            where: {
                workspaceId: bot.workspaceId,
                status: 'active',
                id: { not: sub.agentId },  // exclude the bot just suspended
            },
        }) as number;

        const currentSku = workspaceVm.vmSize;
        const targetSku = vmSkuForAgentCount(remainingBots);

        if (targetSku === currentSku) return 0;  // still in same tier, no resize needed

        // Check whether a resize job is already queued for this workspace to avoid duplicates.
        const existingResizeJob = await (prisma as any).provisioningJob.findFirst({
            where: {
                workspaceId: bot.workspaceId,
                runtimeTier: 'vm_resize',
                status: { in: ['queued', 'validating', 'creating_resources'] },
            },
            select: { id: true },
        });

        if (existingResizeJob) return 0;  // already queued

        // Queue the scale-down resize job.
        await (prisma as any).provisioningJob.create({
            data: {
                tenantId: sub.tenantId,
                workspaceId: bot.workspaceId,
                botId: bot.id,
                planId: sub.planId,
                runtimeTier: 'vm_resize',
                roleType: bot.role,
                correlationId: `corr_scaledown_${bot.workspaceId}_${Date.now()}`,
                triggerSource: 'subscription_sweep',
                status: 'queued',
                requestedBy: 'subscription_sweep',
                requestedAt: now,
                triggeredBy: 'expiry',
                metadata: JSON.stringify({
                    reason: 'agent_subscription_suspended',
                    previousSku: currentSku,
                    targetSku,
                    remainingAgents: remainingBots,
                }),
            },
        });

        return 1;
    } catch (err) {
        console.error('[subscription-sweep] scale-down check failed:', err);
        return 0;
    }
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
