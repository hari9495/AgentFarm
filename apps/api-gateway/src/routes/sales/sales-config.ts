import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client';

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
};

type UpdateSalesConfigBody = Partial<Omit<CreateSalesConfigBody, 'botId'>>;

const getPrisma = async (): Promise<PrismaClient> => {
    const { prisma } = await import('../lib/db.js');
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

            return reply.code(200).send({ config });
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

            const config = await (prisma as never as PrismaWithSales).salesAgentConfig.create({
                data: {
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
                },
            });

            return reply.code(201).send({ ok: true, config });
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
            ];
            for (const f of fields) {
                if (body[f] !== undefined) updateData[f] = body[f];
            }

            const config = await (prisma as never as PrismaWithSales).salesAgentConfig.update({
                where: { id: existing['id'] as string },
                data: updateData as never,
            });

            return reply.code(200).send({ ok: true, config });
        },
    );
}
