import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { ROLE_RANK } from '../../lib/require-role.js';
import type { AgentPersonaRecord, CreatePersonaInput, UpdatePersonaInput } from '@agentfarm/shared-types';
import { evaluateShift } from '@agentfarm/shared-types';

const getPrisma = async () => {
    const db = await import('../../lib/db.js');
    return db.prisma;
};

type SessionContext = {
    userId: string;
    tenantId: string;
    workspaceIds: string[];
    role?: string;
    expiresAt: number;
};

export type RegisterPersonaRoutesOptions = {
    getSession: (request: FastifyRequest) => SessionContext | null;
    prisma?: PrismaClient;
};

type BotIdParams = { botId: string };

const VALID_COMMUNICATION_STYLES = ['professional', 'friendly', 'concise', 'formal'] as const;
const VALID_APPROVAL_POLICIES = ['all', 'medium-high', 'high-only'] as const;

/** Verify the bot exists and belongs to the requesting tenant. Returns the botId or null. */
async function resolveBotForTenant(
    db: PrismaClient,
    botId: string,
    tenantId: string,
): Promise<boolean> {
    const bot = await db.bot.findFirst({
        where: { id: botId, workspace: { tenantId } },
    });
    return bot !== null;
}

/** Map a Prisma AgentPersona row to the API record shape. */
function toPersonaRecord(persona: {
    id: string;
    botId: string;
    tenantId: string;
    displayName: string;
    emailAddress: string;
    avatarUrl: string | null;
    communicationStyle: string;
    disclosureStatement: string;
    language: string;
    timezone: string;
    workingHours: unknown;
    approvalPolicy: string;
    employeeId?: string | null;
    department?: string | null;
    managerId?: string | null;
    createdAt: Date;
    updatedAt: Date;
}): AgentPersonaRecord {
    return {
        id: persona.id,
        botId: persona.botId,
        tenantId: persona.tenantId,
        displayName: persona.displayName,
        emailAddress: persona.emailAddress,
        avatarUrl: persona.avatarUrl ?? null,
        communicationStyle: persona.communicationStyle as AgentPersonaRecord['communicationStyle'],
        disclosureStatement: persona.disclosureStatement,
        language: persona.language,
        timezone: persona.timezone,
        workingHours: (persona.workingHours as AgentPersonaRecord['workingHours']) ?? null,
        approvalPolicy: (persona.approvalPolicy as AgentPersonaRecord['approvalPolicy']) ?? 'high-only',
        employeeId: persona.employeeId ?? null,
        department: persona.department ?? null,
        managerId: persona.managerId ?? null,
        createdAt: persona.createdAt.toISOString(),
        updatedAt: persona.updatedAt.toISOString(),
    };
}

export const registerPersonaRoutes = async (
    app: FastifyInstance,
    options: RegisterPersonaRoutesOptions,
): Promise<void> => {
    const resolvePrisma = options.prisma
        ? () => Promise.resolve(options.prisma!)
        : getPrisma;

    // -----------------------------------------------------------------------
    // GET /v1/personas/:botId — fetch persona for a bot
    // -----------------------------------------------------------------------
    app.get<{ Params: BotIdParams }>('/v1/personas/:botId', async (request, reply) => {
        const session = options.getSession(request);
        if (!session) {
            return reply.code(401).send({ error: 'unauthorized', message: 'A valid authenticated session is required.' });
        }
        if ((ROLE_RANK[session.role ?? ''] ?? 0) < (ROLE_RANK['viewer'] ?? 99)) {
            return reply.code(403).send({ error: 'insufficient_role', required: 'viewer', actual: session.role });
        }

        const { botId } = request.params;
        const db = await resolvePrisma();

        const botExists = await resolveBotForTenant(db, botId, session.tenantId);
        if (!botExists) {
            return reply.code(404).send({ error: 'bot_not_found' });
        }

        const persona = await db.agentPersona.findUnique({ where: { botId } });
        if (!persona) {
            return reply.code(404).send({ error: 'persona_not_found' });
        }

        const record = toPersonaRecord(persona);

        return reply.send({ persona: record });
    });

    // -----------------------------------------------------------------------
    // POST /v1/personas/:botId — create persona for a bot
    // -----------------------------------------------------------------------
    app.post<{ Params: BotIdParams; Body: Omit<CreatePersonaInput, 'botId' | 'tenantId'> }>(
        '/v1/personas/:botId',
        async (request, reply) => {
            const session = options.getSession(request);
            if (!session) {
                return reply.code(401).send({ error: 'unauthorized', message: 'A valid authenticated session is required.' });
            }
            if ((ROLE_RANK[session.role ?? ''] ?? 0) < (ROLE_RANK['operator'] ?? 99)) {
                return reply.code(403).send({ error: 'insufficient_role', required: 'operator', actual: session.role });
            }

            const { botId } = request.params;
            const body = request.body ?? {};

            if (!body.displayName || typeof body.displayName !== 'string' || !body.displayName.trim()) {
                return reply.code(400).send({ error: 'missing_field', field: 'displayName' });
            }
            if (!body.emailAddress || typeof body.emailAddress !== 'string' || !body.emailAddress.trim()) {
                return reply.code(400).send({ error: 'missing_field', field: 'emailAddress' });
            }
            if (body.communicationStyle && !VALID_COMMUNICATION_STYLES.includes(body.communicationStyle as typeof VALID_COMMUNICATION_STYLES[number])) {
                return reply.code(400).send({ error: 'invalid_communication_style', valid: VALID_COMMUNICATION_STYLES });
            }
            if (body.approvalPolicy && !VALID_APPROVAL_POLICIES.includes(body.approvalPolicy as typeof VALID_APPROVAL_POLICIES[number])) {
                return reply.code(400).send({ error: 'invalid_approval_policy', valid: VALID_APPROVAL_POLICIES });
            }

            const db = await resolvePrisma();

            const botExists = await resolveBotForTenant(db, botId, session.tenantId);
            if (!botExists) {
                return reply.code(404).send({ error: 'bot_not_found' });
            }

            const existing = await db.agentPersona.findUnique({ where: { botId } });
            if (existing) {
                return reply.code(409).send({ error: 'persona_already_exists', personaId: existing.id });
            }

            const persona = await db.agentPersona.create({
                data: {
                    botId,
                    tenantId: session.tenantId,
                    displayName: body.displayName.trim(),
                    emailAddress: body.emailAddress.trim(),
                    avatarUrl: body.avatarUrl ?? null,
                    communicationStyle: body.communicationStyle ?? 'professional',
                    disclosureStatement: body.disclosureStatement ?? 'This message was sent by an AI agent.',
                    language: body.language ?? 'en',
                    timezone: body.timezone ?? 'UTC',
                    workingHours: body.workingHours !== undefined
                        ? (body.workingHours as unknown as import('@prisma/client').Prisma.InputJsonValue)
                        : undefined,
                    approvalPolicy: body.approvalPolicy ?? 'high-only',
                    employeeId: body.employeeId ?? null,
                    department: body.department ?? null,
                    managerId: body.managerId ?? null,
                },
            });

            const record = toPersonaRecord(persona);

            return reply.code(201).send({ persona: record });
        },
    );

    // -----------------------------------------------------------------------
    // PATCH /v1/personas/:botId — update persona fields
    // -----------------------------------------------------------------------
    app.patch<{ Params: BotIdParams; Body: UpdatePersonaInput }>(
        '/v1/personas/:botId',
        async (request, reply) => {
            const session = options.getSession(request);
            if (!session) {
                return reply.code(401).send({ error: 'unauthorized', message: 'A valid authenticated session is required.' });
            }
            if ((ROLE_RANK[session.role ?? ''] ?? 0) < (ROLE_RANK['operator'] ?? 99)) {
                return reply.code(403).send({ error: 'insufficient_role', required: 'operator', actual: session.role });
            }

            const { botId } = request.params;
            const body = request.body ?? {};

            if (
                body.communicationStyle !== undefined &&
                !VALID_COMMUNICATION_STYLES.includes(body.communicationStyle as typeof VALID_COMMUNICATION_STYLES[number])
            ) {
                return reply.code(400).send({ error: 'invalid_communication_style', valid: VALID_COMMUNICATION_STYLES });
            }
            if (
                body.approvalPolicy !== undefined &&
                !VALID_APPROVAL_POLICIES.includes(body.approvalPolicy as typeof VALID_APPROVAL_POLICIES[number])
            ) {
                return reply.code(400).send({ error: 'invalid_approval_policy', valid: VALID_APPROVAL_POLICIES });
            }

            const db = await resolvePrisma();

            const botExists = await resolveBotForTenant(db, botId, session.tenantId);
            if (!botExists) {
                return reply.code(404).send({ error: 'bot_not_found' });
            }

            const existing = await db.agentPersona.findUnique({ where: { botId } });
            if (!existing) {
                return reply.code(404).send({ error: 'persona_not_found' });
            }

            const updateData: Record<string, unknown> = {};
            if (body.displayName !== undefined) updateData['displayName'] = body.displayName.trim();
            if (body.emailAddress !== undefined) updateData['emailAddress'] = body.emailAddress.trim();
            if (body.avatarUrl !== undefined) updateData['avatarUrl'] = body.avatarUrl;
            if (body.communicationStyle !== undefined) updateData['communicationStyle'] = body.communicationStyle;
            if (body.disclosureStatement !== undefined) updateData['disclosureStatement'] = body.disclosureStatement;
            if (body.language !== undefined) updateData['language'] = body.language;
            if (body.timezone !== undefined) updateData['timezone'] = body.timezone;
            if (body.workingHours !== undefined) updateData['workingHours'] = body.workingHours;
            if (body.approvalPolicy !== undefined) updateData['approvalPolicy'] = body.approvalPolicy;
            if (body.employeeId !== undefined) updateData['employeeId'] = body.employeeId;
            if (body.department !== undefined) updateData['department'] = body.department;
            if (body.managerId !== undefined) updateData['managerId'] = body.managerId;

            const persona = await db.agentPersona.update({
                where: { botId },
                data: updateData,
            });

            const record = toPersonaRecord(persona);

            return reply.send({ persona: record });
        },
    );

    // -----------------------------------------------------------------------
    // GET /v1/personas/:botId/availability — is the agent on shift right now?
    // Surfaces the C5 shift gate: available flag + next shift open instant.
    // -----------------------------------------------------------------------
    app.get<{ Params: BotIdParams }>('/v1/personas/:botId/availability', async (request, reply) => {
        const session = options.getSession(request);
        if (!session) {
            return reply.code(401).send({ error: 'unauthorized', message: 'A valid authenticated session is required.' });
        }
        if ((ROLE_RANK[session.role ?? ''] ?? 0) < (ROLE_RANK['viewer'] ?? 99)) {
            return reply.code(403).send({ error: 'insufficient_role', required: 'viewer', actual: session.role });
        }

        const { botId } = request.params;
        const db = await resolvePrisma();

        const botExists = await resolveBotForTenant(db, botId, session.tenantId);
        if (!botExists) {
            return reply.code(404).send({ error: 'bot_not_found' });
        }

        const persona = await db.agentPersona.findUnique({
            where: { botId },
            select: { timezone: true, workingHours: true },
        });
        if (!persona) {
            return reply.code(404).send({ error: 'persona_not_found' });
        }

        const status = evaluateShift({
            workingHours: persona.workingHours,
            timezone: persona.timezone,
        });

        return reply.send({ botId, ...status });
    });

    // -----------------------------------------------------------------------
    // GET /v1/personas/org-chart — org hierarchy for the tenant.
    // Returns every persona's org identity plus a manager→reports tree, so the
    // dashboard can render the agent org chart. (Static path is matched ahead of
    // /v1/personas/:botId by Fastify's router.)
    // -----------------------------------------------------------------------
    app.get('/v1/personas/org-chart', async (request, reply) => {
        const session = options.getSession(request);
        if (!session) {
            return reply.code(401).send({ error: 'unauthorized', message: 'A valid authenticated session is required.' });
        }
        if ((ROLE_RANK[session.role ?? ''] ?? 0) < (ROLE_RANK['viewer'] ?? 99)) {
            return reply.code(403).send({ error: 'insufficient_role', required: 'viewer', actual: session.role });
        }

        const db = await resolvePrisma();
        const personas = await db.agentPersona.findMany({ where: { tenantId: session.tenantId } });
        const nodes = personas.map((p) => ({
            botId: p.botId,
            displayName: p.displayName,
            employeeId: p.employeeId ?? null,
            department: p.department ?? null,
            managerId: p.managerId ?? null,
            reports: [] as string[],
        }));

        const byBotId = new Map(nodes.map((n) => [n.botId, n]));
        const roots: string[] = [];
        for (const n of nodes) {
            const mgr = n.managerId ? byBotId.get(n.managerId) : undefined;
            if (mgr) mgr.reports.push(n.botId);
            else roots.push(n.botId);
        }

        return reply.send({ nodes, roots });
    });
};
