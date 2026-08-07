import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { verifyHmacSha256 } from '../../lib/webhook-verify.js';
import {
    closeDealWon,
    closeDealLost,
} from '@agentfarm/agent-runtime/sales/deal-closer.js';
import type { SalesAgentConfigRecord } from '@agentfarm/shared-types';
import { decryptSalesConfigFields } from './sales-config.js';

type PrismaWithContract = {
    salesAgentConfig: {
        findFirst: (args: { where: Record<string, unknown> }) => Promise<Record<string, unknown> | null>;
    };
    contractEvent: {
        create: (args: { data: Record<string, unknown> }) => Promise<{ id: string }>;
    };
    salesDeal: {
        findUnique: (args: { where: { id: string } }) => Promise<Record<string, unknown> | null>;
        findFirst: (args: { where: Record<string, unknown>; orderBy?: Record<string, unknown> }) => Promise<Record<string, unknown> | null>;
    };
};

export type RegisterContractWebhookRoutesOptions = {
    prisma?: PrismaClient;
    closeDealWonFn?: typeof closeDealWon;
    closeDealLostFn?: typeof closeDealLost;
};

const getPrisma = async (): Promise<PrismaClient> => {
    const { prisma } = await import('../../lib/db.js');
    return prisma;
};

export async function registerContractWebhookRoutes(
    app: FastifyInstance,
    options: RegisterContractWebhookRoutesOptions,
): Promise<void> {
    const resolvePrisma = options.prisma
        ? () => Promise.resolve(options.prisma!)
        : getPrisma;

    const doCloseDealWon = options.closeDealWonFn ?? closeDealWon;
    const doCloseDealLost = options.closeDealLostFn ?? closeDealLost;

    // -------------------------------------------------------------------------
    // POST /webhooks/contract
    //
    // Receives e-sign events from contract providers (DocuSign, Zoho Sign, etc.).
    // - x-tenant-id required (400 if missing)
    // - HMAC verify if contractWebhookSecret configured (401 if invalid)
    // - signed → closeDealWon; declined/expired → closeDealLost
    // - Always returns 200 { received: true }
    // -------------------------------------------------------------------------
    app.post('/webhooks/contract', async (request, reply) => {
        const tenantId = request.headers['x-tenant-id'];
        if (!tenantId || typeof tenantId !== 'string') {
            return reply.code(400).send({ error: 'x-tenant-id header required' });
        }

        const contractProvider = typeof request.headers['x-contract-provider'] === 'string'
            ? request.headers['x-contract-provider']
            : 'other';

        const prisma = await resolvePrisma();
        const db = prisma as unknown as PrismaWithContract;

        // Load config — per-tenant secret takes priority; server-level env var is the
        // mandatory fallback. Fail closed: if ANY secret is configured, a valid
        // signature is required. No secret → reject (not configured = not safe).
        const salesConfig = decryptSalesConfigFields(await db.salesAgentConfig.findFirst({ where: { tenantId } }));
        const secret = salesConfig?.['contractWebhookSecret']
            ? String(salesConfig['contractWebhookSecret'])
            : (process.env['CONTRACT_WEBHOOK_SECRET'] ?? '');

        if (!secret) {
            return reply.code(503).send({ error: 'Contract webhook not configured for this tenant' });
        }

        const signature = typeof request.headers['x-webhook-signature'] === 'string'
            ? request.headers['x-webhook-signature']
            : undefined;

        if (!signature) {
            return reply.code(401).send({ error: 'Missing x-webhook-signature header' });
        }

        const valid = verifyHmacSha256(JSON.stringify(request.body), secret, signature, 'hex');
        if (!valid) {
            return reply.code(401).send({ error: 'Invalid signature' });
        }

        const body = request.body as Record<string, unknown>;
        const signerEmail = typeof body['signerEmail'] === 'string' ? body['signerEmail'] : '';
        const status = typeof body['status'] === 'string' ? body['status'] : '';
        const externalEventId = typeof body['externalEventId'] === 'string' ? body['externalEventId'] : undefined;
        const signerName = typeof body['signerName'] === 'string' ? body['signerName'] : undefined;
        const signedAtRaw = typeof body['signedAt'] === 'string' ? body['signedAt'] : undefined;
        const dealIdFromBody = typeof body['dealId'] === 'string' ? body['dealId'] : undefined;

        if (!signerEmail || !status) {
            return reply.code(200).send({ received: true });
        }

        // Resolve deal
        let deal: Record<string, unknown> | null = null;
        if (dealIdFromBody) {
            deal = await db.salesDeal.findUnique({ where: { id: dealIdFromBody } });
        }
        if (!deal) {
            // fallback: most recent deal in 'negotiation' for this tenant + signerEmail
            const prospect = await (prisma as unknown as { prospect: { findFirst: (args: { where: Record<string, unknown> }) => Promise<Record<string, unknown> | null> } }).prospect.findFirst({
                where: { tenantId, email: signerEmail },
            });
            if (prospect) {
                deal = await db.salesDeal.findFirst({
                    where: { tenantId, prospectId: String(prospect['id']), stage: 'negotiation' },
                    orderBy: { createdAt: 'desc' },
                });
            }
        }

        const resolvedDealId = deal ? String(deal['id']) : '';
        const botId = deal ? String(deal['botId'] ?? '') : '';
        const prospectId = deal ? String(deal['prospectId'] ?? '') : '';

        // Create ContractEvent record
        await db.contractEvent.create({
            data: {
                tenantId,
                botId,
                prospectId,
                dealId: resolvedDealId,
                provider: contractProvider,
                externalEventId,
                signerEmail,
                signerName,
                signedAt: signedAtRaw ? new Date(signedAtRaw) : undefined,
                status,
                payload: JSON.stringify(body),
                createdAt: new Date(),
            },
        });

        if (deal && resolvedDealId) {
            const config = salesConfig as unknown as SalesAgentConfigRecord | null;
            if (status === 'signed') {
                doCloseDealWon(
                    resolvedDealId,
                    tenantId,
                    botId,
                    signerEmail,
                    signedAtRaw ? new Date(signedAtRaw) : new Date(),
                    config ?? ({} as SalesAgentConfigRecord),
                    prisma,
                ).catch(() => undefined);
            } else if (status === 'declined' || status === 'expired') {
                doCloseDealLost(
                    resolvedDealId,
                    tenantId,
                    botId,
                    `Contract ${status}`,
                    config ?? ({} as SalesAgentConfigRecord),
                    prisma,
                ).catch(() => undefined);
            }
        }

        return reply.code(200).send({ received: true });
    });
}
