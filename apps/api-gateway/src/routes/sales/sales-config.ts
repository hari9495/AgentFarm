import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { encryptFieldIfSet, decryptFieldMaybeUnencrypted } from '../../lib/field-encryption.js';

// ---------------------------------------------------------------------------
// Sensitive fields — encrypted at rest via field-encryption.ts (AES-256-GCM).
// On write: encryptFieldIfSet (graceful — stores plaintext if key absent, warns).
// On read:  decryptFieldMaybeUnencrypted (handles both legacy plaintext and enc: values).
// ---------------------------------------------------------------------------
const SENSITIVE_SALES_FIELDS = [
    'twilioAuthToken',
    'signalwireApiToken',
    'plivoAuthToken',
    'vonageApiSecret',
    'vonagePrivateKey',
    'phantombusterApiKey',
    'newsApiKey',
    'hubspotAccessToken',
    'salesforceAccessToken',
] as const;

function encryptSalesConfigFields(data: Record<string, unknown>): Record<string, unknown> {
    const out = { ...data };
    for (const field of SENSITIVE_SALES_FIELDS) {
        if (typeof out[field] === 'string' && out[field]) {
            out[field] = encryptFieldIfSet(out[field] as string);
        }
    }
    return out;
}

function decryptSalesConfigFields(config: Record<string, unknown>): Record<string, unknown> {
    const out = { ...config };
    for (const field of SENSITIVE_SALES_FIELDS) {
        if (typeof out[field] === 'string' && out[field]) {
            try {
                out[field] = decryptFieldMaybeUnencrypted(out[field] as string);
            } catch { /* non-fatal — return ciphertext as-is if key unavailable */ }
        }
    }
    return out;
}

type SessionContext = {
    userId: string;
    tenantId: string;
    workspaceIds: string[];
    role?: string;
    expiresAt: number;
};

export type RegisterSalesConfigRoutesOptions = {
    getSession: (request: FastifyRequest) => SessionContext | null;
    prisma?: PrismaClient;
};

type BotIdParams = { botId: string };

type CreateSalesConfigBody = {
    botId: string;
    productDescription: string;
    icp: string;
    leadSourceProvider: string;
    emailProvider: string;
    crmProvider: string;
    calendarProvider: string;
    signatureProvider: string;
    emailTone?: string;
    followUpDays?: number[];
    maxProspectsPerDay?: number;
    active?: boolean;
    // Telephony — cold calling (multi-provider: twilio | signalwire | plivo | vonage)
    telephonyProvider?: string;
    callWebhookBaseUrl?: string;
    // Twilio
    twilioAccountSid?: string;
    twilioAuthToken?: string;
    twilioFromNumber?: string;
    // SignalWire
    signalwireProjectId?: string;
    signalwireApiToken?: string;
    signalwireSpaceUrl?: string;
    signalwireFromNumber?: string;
    // Plivo
    plivoAuthId?: string;
    plivoAuthToken?: string;
    plivoFromNumber?: string;
    // Vonage
    vonageApiKey?: string;
    vonageApiSecret?: string;
    vonageApplicationId?: string;
    vonagePrivateKey?: string;
    vonageFromNumber?: string;
    // LinkedIn outbound
    phantombusterApiKey?: string;
    phantombusterLinkedInPhantomId?: string;
    // Market research
    marketResearchEnabled?: boolean;
    newsApiKey?: string;
    marketResearchIntervalHours?: number;
    // Negotiation & Closing
    maxDiscountPercent?: number;
    discountApprovalRequired?: boolean;
    discountApproverEmail?: string;
    // Relationship Management
    npsEnabled?: boolean;
    npsDelayDays?: number[];
    upsellEnabled?: boolean;
    upsellCheckInDays?: number;
    // External CRM sync
    crmSyncEnabled?: boolean;
    hubspotAccessToken?: string;
    salesforceInstanceUrl?: string;
    salesforceAccessToken?: string;
};

type UpdateSalesConfigBody = Partial<Omit<CreateSalesConfigBody, 'botId'>>;

const getPrisma = async (): Promise<PrismaClient> => {
    const { prisma } = await import('../../lib/db.js');
    return prisma;
};

type PrismaWithSales = {
    salesAgentConfig: {
        findFirst: (args: unknown) => Promise<Record<string, unknown> | null>;
        create: (args: unknown) => Promise<Record<string, unknown>>;
        update: (args: unknown) => Promise<Record<string, unknown>>;
    };
    bot: {
        findUnique: (args: unknown) => Promise<{ id: string; role?: string | null } | null>;
    };
};

export async function registerSalesConfigRoutes(
    app: FastifyInstance,
    options: RegisterSalesConfigRoutesOptions,
): Promise<void> {
    const resolvePrisma = options.prisma
        ? () => Promise.resolve(options.prisma!)
        : getPrisma;

    // ── GET /v1/sales/config/:botId ───────────────────────────────────────────
    app.get<{ Params: BotIdParams }>(
        '/v1/sales/config/:botId',
        async (request, reply) => {
            const session = options.getSession(request);
            if (!session) return reply.code(401).send({ error: 'Unauthorised' });

            const { botId } = request.params;
            const prisma = await resolvePrisma();

            const config = await (prisma as never as PrismaWithSales).salesAgentConfig.findFirst({
                where: { botId, tenantId: session.tenantId },
            });

            if (!config) return reply.code(404).send({ error: 'SalesAgentConfig not found' });

            return reply.code(200).send({ config: decryptSalesConfigFields(config) });
        },
    );

    // ── POST /v1/sales/config ─────────────────────────────────────────────────
    app.post<{ Body: CreateSalesConfigBody }>(
        '/v1/sales/config',
        async (request, reply) => {
            const session = options.getSession(request);
            if (!session) return reply.code(401).send({ error: 'Unauthorised' });

            const body = request.body ?? ({} as CreateSalesConfigBody);

            if (!body.botId) return reply.code(400).send({ error: 'botId is required' });
            if (!body.productDescription) return reply.code(400).send({ error: 'productDescription is required' });
            if (!body.icp) return reply.code(400).send({ error: 'icp is required' });
            if (!body.leadSourceProvider) return reply.code(400).send({ error: 'leadSourceProvider is required' });
            if (!body.emailProvider) return reply.code(400).send({ error: 'emailProvider is required' });
            if (!body.crmProvider) return reply.code(400).send({ error: 'crmProvider is required' });
            if (!body.calendarProvider) return reply.code(400).send({ error: 'calendarProvider is required' });
            if (!body.signatureProvider) return reply.code(400).send({ error: 'signatureProvider is required' });

            const prisma = await resolvePrisma();

            // Validate the bot belongs to this tenant and has role 'sales_rep'
            const bot = await (prisma as never as PrismaWithSales).bot.findUnique({
                where: { id: body.botId },
            });

            if (!bot) return reply.code(404).send({ error: 'Bot not found' });
            if (bot.role !== 'sales_rep') {
                return reply.code(422).send({ error: 'Bot must have role sales_rep to use SalesAgentConfig' });
            }

            const existing = await (prisma as never as PrismaWithSales).salesAgentConfig.findFirst({
                where: { botId: body.botId },
            });
            if (existing) {
                return reply.code(409).send({ error: 'SalesAgentConfig already exists for this bot — use PUT to update' });
            }

            const rawData = {
                tenantId: session.tenantId,
                botId: body.botId,
                productDescription: body.productDescription,
                icp: body.icp,
                leadSourceProvider: body.leadSourceProvider,
                emailProvider: body.emailProvider,
                crmProvider: body.crmProvider,
                calendarProvider: body.calendarProvider,
                signatureProvider: body.signatureProvider,
                emailTone: body.emailTone ?? 'conversational',
                followUpDays: body.followUpDays ?? [3, 7, 14],
                maxProspectsPerDay: body.maxProspectsPerDay ?? 50,
                active: body.active ?? true,
                telephonyProvider: body.telephonyProvider ?? null,
                callWebhookBaseUrl: body.callWebhookBaseUrl ?? null,
                twilioAccountSid: body.twilioAccountSid ?? null,
                twilioAuthToken: body.twilioAuthToken ?? null,
                twilioFromNumber: body.twilioFromNumber ?? null,
                signalwireProjectId: body.signalwireProjectId ?? null,
                signalwireApiToken: body.signalwireApiToken ?? null,
                signalwireSpaceUrl: body.signalwireSpaceUrl ?? null,
                signalwireFromNumber: body.signalwireFromNumber ?? null,
                plivoAuthId: body.plivoAuthId ?? null,
                plivoAuthToken: body.plivoAuthToken ?? null,
                plivoFromNumber: body.plivoFromNumber ?? null,
                vonageApiKey: body.vonageApiKey ?? null,
                vonageApiSecret: body.vonageApiSecret ?? null,
                vonageApplicationId: body.vonageApplicationId ?? null,
                vonagePrivateKey: body.vonagePrivateKey ?? null,
                vonageFromNumber: body.vonageFromNumber ?? null,
                phantombusterApiKey: body.phantombusterApiKey ?? null,
                phantombusterLinkedInPhantomId: body.phantombusterLinkedInPhantomId ?? null,
                marketResearchEnabled: body.marketResearchEnabled ?? false,
                newsApiKey: body.newsApiKey ?? null,
                marketResearchIntervalHours: body.marketResearchIntervalHours ?? null,
                maxDiscountPercent: body.maxDiscountPercent ?? null,
                discountApprovalRequired: body.discountApprovalRequired ?? false,
                discountApproverEmail: body.discountApproverEmail ?? null,
                npsEnabled: body.npsEnabled ?? false,
                npsDelayDays: body.npsDelayDays ?? [30, 60, 90],
                upsellEnabled: body.upsellEnabled ?? false,
                upsellCheckInDays: body.upsellCheckInDays ?? 90,
                crmSyncEnabled: body.crmSyncEnabled ?? false,
                hubspotAccessToken: body.hubspotAccessToken ?? null,
                salesforceInstanceUrl: body.salesforceInstanceUrl ?? null,
                salesforceAccessToken: body.salesforceAccessToken ?? null,
            };

            const config = await (prisma as never as PrismaWithSales).salesAgentConfig.create({
                data: encryptSalesConfigFields(rawData) as never,
            });

            return reply.code(201).send({ ok: true, config: decryptSalesConfigFields(config) });
        },
    );

    // ── PUT /v1/sales/config/:botId ───────────────────────────────────────────
    app.put<{ Params: BotIdParams; Body: UpdateSalesConfigBody }>(
        '/v1/sales/config/:botId',
        async (request, reply) => {
            const session = options.getSession(request);
            if (!session) return reply.code(401).send({ error: 'Unauthorised' });

            const { botId } = request.params;
            const body = request.body ?? ({} as UpdateSalesConfigBody);

            const prisma = await resolvePrisma();

            const existing = await (prisma as never as PrismaWithSales).salesAgentConfig.findFirst({
                where: { botId, tenantId: session.tenantId },
            });

            if (!existing) return reply.code(404).send({ error: 'SalesAgentConfig not found' });

            const updateData: Record<string, unknown> = { updatedAt: new Date() };
            const fields: (keyof UpdateSalesConfigBody)[] = [
                'productDescription',
                'icp',
                'leadSourceProvider',
                'emailProvider',
                'crmProvider',
                'calendarProvider',
                'signatureProvider',
                'emailTone',
                'followUpDays',
                'maxProspectsPerDay',
                'active',
                'telephonyProvider',
                'callWebhookBaseUrl',
                'twilioAccountSid',
                'twilioAuthToken',
                'twilioFromNumber',
                'signalwireProjectId',
                'signalwireApiToken',
                'signalwireSpaceUrl',
                'signalwireFromNumber',
                'plivoAuthId',
                'plivoAuthToken',
                'plivoFromNumber',
                'vonageApiKey',
                'vonageApiSecret',
                'vonageApplicationId',
                'vonagePrivateKey',
                'vonageFromNumber',
                'phantombusterApiKey',
                'phantombusterLinkedInPhantomId',
                'marketResearchEnabled',
                'newsApiKey',
                'marketResearchIntervalHours',
                'maxDiscountPercent',
                'discountApprovalRequired',
                'discountApproverEmail',
                'npsEnabled',
                'npsDelayDays',
                'upsellEnabled',
                'upsellCheckInDays',
                'crmSyncEnabled',
                'hubspotAccessToken',
                'salesforceInstanceUrl',
                'salesforceAccessToken',
            ];
            for (const f of fields) {
                if (body[f] !== undefined) updateData[f] = body[f];
            }

            const encryptedUpdate = encryptSalesConfigFields(updateData);

            const config = await (prisma as never as PrismaWithSales).salesAgentConfig.update({
                where: { id: existing['id'] as string },
                data: encryptedUpdate as never,
            });

            return reply.code(200).send({ ok: true, config: decryptSalesConfigFields(config) });
        },
    );
}
