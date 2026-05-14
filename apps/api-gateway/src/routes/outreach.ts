import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import type { SalesActivityRecord, ProspectRecord } from '@agentfarm/shared-types';
import {
    sendOutreachEmail,
    type OutreachParams,
    type OutreachResult,
} from '@agentfarm/agent-runtime/sales/outreach.js';
import {
    classifyReply,
    type ClassifyReplyParams,
    type ClassifyReplyResult,
} from '@agentfarm/agent-runtime/sales/reply-classifier.js';

type SessionContext = {
    userId: string;
    tenantId: string;
    workspaceIds: string[];
    role?: string;
    expiresAt: number;
};

export type RegisterOutreachRoutesOptions = {
    getSession: (request: FastifyRequest) => SessionContext | null;
    prisma?: PrismaClient;
    /** Overrides sendOutreachEmail — used in tests. */
    sendOutreach?: (params: OutreachParams, prisma: PrismaClient) => Promise<OutreachResult>;
    /** Overrides classifyReply — used in tests. */
    classifyReplyFn?: (params: ClassifyReplyParams) => Promise<ClassifyReplyResult>;
};

type SendOutreachBody = {
    botId: string;
    prospectId: string;
    sequenceStep?: number;
    previousSubject?: string;
    emailConfig: {
        apiKey?: string;
        host?: string;
        port?: number;
        secure?: boolean;
        user?: string;
        pass?: string;
        fromEmail?: string;
        fromName?: string;
    };
};

type ClassifyReplyBody = {
    prospectId: string;
    replyText: string;
    originalSubject: string;
};

type ActivityIdParams = { prospectId: string };

type PrismaWithSales = {
    salesAgentConfig: {
        findFirst: (args: { where: Record<string, unknown> }) => Promise<Record<string, unknown> | null>;
    };
    prospect: {
        findUnique: (args: { where: { id: string } }) => Promise<ProspectRecord | null>;
        update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<unknown>;
    };
    salesActivity: {
        create: (args: { data: Record<string, unknown> }) => Promise<{ id: string }>;
        findMany: (args: { where: Record<string, unknown>; orderBy?: Record<string, unknown> }) => Promise<SalesActivityRecord[]>;
    };
};

const getPrisma = async (): Promise<PrismaClient> => {
    const { prisma } = await import('../lib/db.js');
    return prisma;
};

export async function registerOutreachRoutes(
    app: FastifyInstance,
    options: RegisterOutreachRoutesOptions,
): Promise<void> {
    const resolvePrisma = options.prisma
        ? () => Promise.resolve(options.prisma!)
        : getPrisma;

    const doSendOutreach = options.sendOutreach ?? sendOutreachEmail;
    const doClassifyReply = options.classifyReplyFn ?? classifyReply;

    // -------------------------------------------------------------------------
    // POST /v1/sales/outreach/send
    // -------------------------------------------------------------------------
    app.post<{ Body: SendOutreachBody }>('/v1/sales/outreach/send', async (request, reply) => {
        const session = options.getSession(request);
        if (!session) {
            return reply.status(401).send({ code: 'UNAUTHORIZED' });
        }

        const prisma = await resolvePrisma();
        const db = prisma as unknown as PrismaWithSales;
        const body = request.body;

        const config = await db.salesAgentConfig.findFirst({
            where: { botId: body.botId, tenantId: session.tenantId },
        });
        if (!config) {
            return reply.status(404).send({ code: 'CONFIG_NOT_FOUND' });
        }

        const result = await doSendOutreach(
            {
                tenantId: session.tenantId,
                botId: body.botId,
                prospectId: body.prospectId,
                config: config as unknown as OutreachParams['config'],
                emailConfig: body.emailConfig,
                sequenceStep: body.sequenceStep,
                previousSubject: body.previousSubject,
            },
            prisma,
        );

        return reply.status(200).send(result);
    });

    // -------------------------------------------------------------------------
    // POST /v1/sales/outreach/classify-reply
    // -------------------------------------------------------------------------
    app.post<{ Body: ClassifyReplyBody }>('/v1/sales/outreach/classify-reply', async (request, reply) => {
        const session = options.getSession(request);
        if (!session) {
            return reply.status(401).send({ code: 'UNAUTHORIZED' });
        }

        const prisma = await resolvePrisma();
        const db = prisma as unknown as PrismaWithSales;
        const body = request.body;

        const prospect = await db.prospect.findUnique({ where: { id: body.prospectId } });
        if (!prospect) {
            return reply.status(404).send({ code: 'PROSPECT_NOT_FOUND' });
        }
        if (prospect.tenantId !== session.tenantId) {
            return reply.status(403).send({ code: 'FORBIDDEN' });
        }

        const result = await doClassifyReply({
            replyText: body.replyText,
            originalSubject: body.originalSubject,
        });

        // Map LLM intent to valid ProspectStatus enum values
        const statusMap: Partial<Record<ClassifyReplyResult['intent'], string>> = {
            interested: 'engaged',
            unsubscribe: 'disqualified',
            not_now: 'contacted',
        };
        const newStatus = statusMap[result.intent] ?? 'engaged';

        await db.prospect.update({
            where: { id: body.prospectId },
            data: { status: newStatus, updatedAt: new Date() },
        });

        await db.salesActivity.create({
            data: {
                tenantId: session.tenantId,
                botId: prospect.botId,
                prospectId: body.prospectId,
                activityType: 'email',
                subject: `Reply to: ${body.originalSubject}`,
                outcome: result.intent,
                completedAt: new Date(),
            },
        });

        return reply.status(200).send(result);
    });

    // -------------------------------------------------------------------------
    // GET /v1/sales/outreach/activities/:prospectId
    // -------------------------------------------------------------------------
    app.get<{ Params: ActivityIdParams }>('/v1/sales/outreach/activities/:prospectId', async (request, reply) => {
        const session = options.getSession(request);
        if (!session) {
            return reply.status(401).send({ code: 'UNAUTHORIZED' });
        }

        const prisma = await resolvePrisma();
        const db = prisma as unknown as PrismaWithSales;

        const prospect = await db.prospect.findUnique({ where: { id: request.params.prospectId } });
        if (!prospect) {
            return reply.status(404).send({ code: 'PROSPECT_NOT_FOUND' });
        }
        if (prospect.tenantId !== session.tenantId) {
            return reply.status(403).send({ code: 'FORBIDDEN' });
        }

        const activities = await db.salesActivity.findMany({
            where: { prospectId: request.params.prospectId, tenantId: session.tenantId },
            orderBy: { createdAt: 'desc' },
        });

        return reply.status(200).send({ activities });
    });
}
