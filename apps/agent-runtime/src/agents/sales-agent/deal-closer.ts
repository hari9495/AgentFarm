import type { PrismaClient } from '@prisma/client';
import type { SalesAgentConfigRecord } from '@agentfarm/shared-types';
import { createNotificationProvider } from './notification-provider-factory.js';
import { getEmailProvider } from './email-provider-factory.js';

type PrismaWithSales = {
    salesDeal: {
        findUnique: (args: { where: { id: string } }) => Promise<Record<string, unknown> | null>;
        update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<Record<string, unknown>>;
    };
    prospect: {
        findUnique: (args: { where: { id: string } }) => Promise<Record<string, unknown> | null>;
        update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<unknown>;
    };
    winLossEvent: {
        create: (args: { data: Record<string, unknown> }) => Promise<{ id: string }>;
    };
    salesActivity: {
        create: (args: { data: Record<string, unknown> }) => Promise<{ id: string }>;
    };
};

function calcDaysToClose(createdAt: unknown, closedAt: Date): number | undefined {
    if (!createdAt) return undefined;
    const created = createdAt instanceof Date ? createdAt : new Date(String(createdAt));
    if (isNaN(created.getTime())) return undefined;
    return Math.round((closedAt.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
}

export async function closeDealWon(
    dealId: string,
    tenantId: string,
    botId: string,
    signerEmail: string,
    signedAt: Date,
    config: SalesAgentConfigRecord,
    prisma?: PrismaClient,
): Promise<{ closed: boolean; outcome: 'won'; error?: string }> {
    try {
        const db = prisma ? (prisma as unknown as PrismaWithSales) : null;
        if (!db) return { closed: true, outcome: 'won' };

        const deal = await db.salesDeal.findUnique({ where: { id: dealId } });
        if (!deal) return { closed: false, outcome: 'won', error: 'Deal not found' };
        if (String(deal['tenantId'] ?? '') !== tenantId) {
            return { closed: false, outcome: 'won', error: 'Tenant isolation violation' };
        }

        const prospect = await db.prospect.findUnique({ where: { id: String(deal['prospectId'] ?? '') } });
        const closedAt = signedAt;
        const daysToClose = calcDaysToClose(deal['createdAt'], closedAt);

        // Update SalesDeal
        await db.salesDeal.update({
            where: { id: dealId },
            data: {
                stage: 'closed_won',
                closedAt,
                contractSignedAt: closedAt,
                updatedAt: new Date(),
            },
        });

        // Update Prospect status
        if (prospect) {
            await db.prospect.update({
                where: { id: String(deal['prospectId']) },
                data: { status: 'closed_won', updatedAt: new Date() },
            });
        }

        // Create WinLossEvent
        await db.winLossEvent.create({
            data: {
                tenantId,
                botId,
                prospectId: String(deal['prospectId'] ?? ''),
                dealId,
                outcome: 'won',
                dealValue: deal['value'] != null ? Number(deal['value']) : undefined,
                currency: String(deal['currency'] ?? 'USD'),
                daysToClose,
                createdAt: new Date(),
            },
        });

        // Log SalesActivity
        await db.salesActivity.create({
            data: {
                tenantId,
                botId,
                prospectId: String(deal['prospectId'] ?? ''),
                dealId,
                activityType: 'contract_signed',
                subject: `Deal closed won — signed by ${signerEmail}`,
                outcome: 'won',
                completedAt: closedAt,
                createdAt: new Date(),
                updatedAt: new Date(),
            },
        });

        // Fire-and-forget win notification
        const emailProvider = (() => {
            try { return getEmailProvider(config.emailProvider); } catch { return undefined; }
        })();
        const notifier = createNotificationProvider(config, emailProvider);
        if (notifier && prospect) {
            notifier.send({
                outcome: 'won',
                dealId,
                prospectName: `${String(prospect['firstName'] ?? '')} ${String(prospect['lastName'] ?? '')}`.trim(),
                company: String(prospect['company'] ?? ''),
                dealValue: deal['value'] != null ? Number(deal['value']) : undefined,
                currency: String(deal['currency'] ?? 'USD'),
                daysToClose,
                tenantId,
                botId,
            }).catch(() => undefined);
        }

        return { closed: true, outcome: 'won' };
    } catch (err: unknown) {
        return { closed: false, outcome: 'won', error: String(err) };
    }
}

export async function closeDealLost(
    dealId: string,
    tenantId: string,
    botId: string,
    reason: string,
    config: SalesAgentConfigRecord,
    prisma?: PrismaClient,
): Promise<{ closed: boolean; outcome: 'lost'; error?: string }> {
    try {
        const db = prisma ? (prisma as unknown as PrismaWithSales) : null;
        if (!db) return { closed: true, outcome: 'lost' };

        const deal = await db.salesDeal.findUnique({ where: { id: dealId } });
        if (!deal) return { closed: false, outcome: 'lost', error: 'Deal not found' };
        if (String(deal['tenantId'] ?? '') !== tenantId) {
            return { closed: false, outcome: 'lost', error: 'Tenant isolation violation' };
        }

        const prospect = await db.prospect.findUnique({ where: { id: String(deal['prospectId'] ?? '') } });
        const closedAt = new Date();
        const daysToClose = calcDaysToClose(deal['createdAt'], closedAt);

        // Update SalesDeal
        await db.salesDeal.update({
            where: { id: dealId },
            data: {
                stage: 'closed_lost',
                closedAt,
                updatedAt: new Date(),
            },
        });

        // Update Prospect status
        if (prospect) {
            await db.prospect.update({
                where: { id: String(deal['prospectId']) },
                data: { status: 'disqualified', updatedAt: new Date() },
            });
        }

        // Create WinLossEvent
        await db.winLossEvent.create({
            data: {
                tenantId,
                botId,
                prospectId: String(deal['prospectId'] ?? ''),
                dealId,
                outcome: 'lost',
                dealValue: deal['value'] != null ? Number(deal['value']) : undefined,
                currency: String(deal['currency'] ?? 'USD'),
                daysToClose,
                createdAt: new Date(),
            },
        });

        // Log SalesActivity
        await db.salesActivity.create({
            data: {
                tenantId,
                botId,
                prospectId: String(deal['prospectId'] ?? ''),
                dealId,
                activityType: 'note',
                subject: `Deal closed lost — ${reason}`,
                outcome: 'lost',
                completedAt: closedAt,
                createdAt: new Date(),
                updatedAt: new Date(),
            },
        });

        // Fire-and-forget loss notification
        const emailProvider = (() => {
            try { return getEmailProvider(config.emailProvider); } catch { return undefined; }
        })();
        const notifier = createNotificationProvider(config, emailProvider);
        if (notifier && prospect) {
            notifier.send({
                outcome: 'lost',
                dealId,
                prospectName: `${String(prospect['firstName'] ?? '')} ${String(prospect['lastName'] ?? '')}`.trim(),
                company: String(prospect['company'] ?? ''),
                dealValue: deal['value'] != null ? Number(deal['value']) : undefined,
                currency: String(deal['currency'] ?? 'USD'),
                daysToClose,
                tenantId,
                botId,
            }).catch(() => undefined);
        }

        // Re-engage after configured days if still disqualified
        const reEngageDays = config.reEngageDaysAfterLoss;
        if (reEngageDays && reEngageDays > 0 && prospect) {
            const prospectIdForReEngage = String(deal['prospectId']);
            setTimeout(() => {
                // Re-check then reset prospect to 'new'
                const reEngageDb = db;
                reEngageDb.prospect.findUnique({ where: { id: prospectIdForReEngage } })
                    .then((current) => {
                        if (current && String(current['status']) === 'disqualified') {
                            return reEngageDb.prospect.update({
                                where: { id: prospectIdForReEngage },
                                data: { status: 'new', updatedAt: new Date() },
                            });
                        }
                    })
                    .catch(() => undefined);
            }, reEngageDays * 24 * 60 * 60 * 1000);
        }

        return { closed: true, outcome: 'lost' };
    } catch (err: unknown) {
        return { closed: false, outcome: 'lost', error: String(err) };
    }
}
