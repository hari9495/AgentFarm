/**
 * Disclosure compliance routes — Sprint 13
 *
 * Enforces EU AI Act Article 52 and FTC AI disclosure requirements.
 * All AI-generated outbound communications must carry a disclosure statement
 * identifying the sender as an AI agent.
 *
 * Routes:
 *   GET  /v1/disclosure/:botId          — current disclosure config for a bot
 *   PATCH /v1/disclosure/:botId         — update disclosure statement / jurisdictions
 *   POST  /v1/disclosure/:botId/ack     — record that disclosure was presented to an external party
 *   GET   /v1/disclosure/:botId/audit   — paginated audit trail of disclosure acknowledgements
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { writeAuditEvent } from '../../lib/audit-writer.js';

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

export type RegisterDisclosureRoutesOptions = {
    getSession: (request: FastifyRequest) => SessionContext | null;
    prisma?: PrismaClient;
};

type BotIdParams = { botId: string };

/** Supported jurisdiction identifiers for AI disclosure compliance. */
export const SUPPORTED_JURISDICTIONS = ['EU_AI_ACT_ART52', 'FTC_AI_GUIDELINES', 'CA_SB_1001'] as const;
export type DisclosureJurisdiction = (typeof SUPPORTED_JURISDICTIONS)[number];

/** Marker prefix embedded in audit summary to distinguish disclosure acks. */
const DISCLOSURE_ACK_MARKER = '[DISCLOSURE_ACK]';

export async function registerDisclosureRoutes(
    app: FastifyInstance,
    options: RegisterDisclosureRoutesOptions,
): Promise<void> {
    const resolvePrisma = options.prisma
        ? () => Promise.resolve(options.prisma!)
        : getPrisma;

    // -----------------------------------------------------------------------
    // GET /v1/disclosure/:botId
    // Returns current disclosure statement + compliance metadata.
    // -----------------------------------------------------------------------
    app.get<{ Params: BotIdParams }>(
        '/v1/disclosure/:botId',
        async (request, reply) => {
            const session = options.getSession(request);
            if (!session) {
                return reply.code(401).send({ error: 'Unauthorized' });
            }
            const { botId } = request.params;
            const prisma = await resolvePrisma();
            const persona = await prisma.agentPersona.findFirst({
                where: { botId, tenantId: session.tenantId },
            });
            if (!persona) {
                return reply.code(404).send({ error: 'persona_not_found' });
            }
            return reply.send({
                botId: persona.botId,
                disclosureStatement: persona.disclosureStatement,
                jurisdictions: SUPPORTED_JURISDICTIONS,
                complianceNote: 'Statement is appended to all outbound messages per EU AI Act Art. 52 and FTC AI guidelines.',
                updatedAt: persona.updatedAt,
            });
        },
    );

    // -----------------------------------------------------------------------
    // PATCH /v1/disclosure/:botId
    // Update the disclosure statement for a bot persona.
    // -----------------------------------------------------------------------
    type PatchDisclosureBody = {
        disclosureStatement: string;
    };
    app.patch<{ Params: BotIdParams; Body: PatchDisclosureBody }>(
        '/v1/disclosure/:botId',
        async (request, reply) => {
            const session = options.getSession(request);
            if (!session) {
                return reply.code(401).send({ error: 'Unauthorized' });
            }
            const { botId } = request.params;
            const { disclosureStatement } = request.body ?? {};
            if (!disclosureStatement || typeof disclosureStatement !== 'string') {
                return reply.code(400).send({ error: 'disclosureStatement is required and must be a string' });
            }
            if (disclosureStatement.trim().length < 10) {
                return reply.code(400).send({ error: 'disclosureStatement must be at least 10 characters' });
            }
            const prisma = await resolvePrisma();
            const persona = await prisma.agentPersona.findFirst({
                where: { botId, tenantId: session.tenantId },
            });
            if (!persona) {
                return reply.code(404).send({ error: 'persona_not_found' });
            }
            const updated = await prisma.agentPersona.update({
                where: { id: persona.id },
                data: { disclosureStatement: disclosureStatement.trim() },
            });
            void writeAuditEvent({
                prisma,
                tenantId: session.tenantId,
                botId,
                userId: session.userId,
                eventType: 'audit_event',
                summary: `${DISCLOSURE_ACK_MARKER} Disclosure statement updated by userId=${session.userId}`,
            });
            return reply.send({
                botId: updated.botId,
                disclosureStatement: updated.disclosureStatement,
                updatedAt: updated.updatedAt,
            });
        },
    );

    // -----------------------------------------------------------------------
    // POST /v1/disclosure/:botId/ack
    // Record that the disclosure statement was presented to an external party.
    // Must be called by the agent runtime after every outbound message.
    // -----------------------------------------------------------------------
    type AckBody = {
        channel: 'email' | 'slack' | 'pr' | 'meeting' | 'chat';
        recipientId?: string;
        messageId?: string;
        workspaceId?: string;
    };
    app.post<{ Params: BotIdParams; Body: AckBody }>(
        '/v1/disclosure/:botId/ack',
        async (request, reply) => {
            const session = options.getSession(request);
            if (!session) {
                return reply.code(401).send({ error: 'Unauthorized' });
            }
            const { botId } = request.params;
            const { channel, recipientId, messageId, workspaceId } = request.body ?? {};
            const VALID_CHANNELS = ['email', 'slack', 'pr', 'meeting', 'chat'] as const;
            if (!channel || !VALID_CHANNELS.includes(channel as (typeof VALID_CHANNELS)[number])) {
                return reply.code(400).send({ error: `channel must be one of: ${VALID_CHANNELS.join(', ')}` });
            }
            const prisma = await resolvePrisma();
            const recordedAt = new Date().toISOString();
            void writeAuditEvent({
                prisma,
                tenantId: session.tenantId,
                workspaceId: workspaceId ?? '',
                botId,
                userId: session.userId,
                eventType: 'audit_event',
                summary: `${DISCLOSURE_ACK_MARKER} channel=${channel} recipientId=${recipientId ?? 'unknown'} messageId=${messageId ?? 'unknown'} recordedAt=${recordedAt}`,
            });
            return reply.code(201).send({ botId, channel, recordedAt });
        },
    );

    // -----------------------------------------------------------------------
    // GET /v1/disclosure/:botId/audit
    // Paginated audit trail of disclosure acknowledgement events for a bot.
    // -----------------------------------------------------------------------
    type AuditQuery = {
        page?: string;
        page_size?: string;
    };
    app.get<{ Params: BotIdParams; Querystring: AuditQuery }>(
        '/v1/disclosure/:botId/audit',
        async (request, reply) => {
            const session = options.getSession(request);
            if (!session) {
                return reply.code(401).send({ error: 'Unauthorized' });
            }
            const { botId } = request.params;
            const page = Math.max(1, parseInt(request.query.page ?? '1', 10));
            const pageSize = Math.min(100, Math.max(1, parseInt(request.query.page_size ?? '20', 10)));
            const skip = (page - 1) * pageSize;
            const prisma = await resolvePrisma();
            const [events, total] = await Promise.all([
                prisma.auditEvent.findMany({
                    where: {
                        botId,
                        tenantId: session.tenantId,
                        summary: { contains: DISCLOSURE_ACK_MARKER },
                    },
                    orderBy: { createdAt: 'desc' },
                    skip,
                    take: pageSize,
                    select: {
                        id: true,
                        summary: true,
                        createdAt: true,
                    },
                }),
                prisma.auditEvent.count({
                    where: {
                        botId,
                        tenantId: session.tenantId,
                        summary: { contains: DISCLOSURE_ACK_MARKER },
                    },
                }),
            ]);
            return reply.send({
                botId,
                page,
                page_size: pageSize,
                total,
                events: events.map((e) => ({
                    id: e.id,
                    summary: e.summary.replace(DISCLOSURE_ACK_MARKER, '').trim(),
                    recordedAt: e.createdAt,
                })),
            });
        },
    );
}
