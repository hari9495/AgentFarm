import { randomUUID } from 'crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { AgentDispatchRequest, AgentDispatchResult } from '@agentfarm/shared-types';
import { validate } from '../lib/validate.js';

const getPrisma = async () => {
    const db = await import('../lib/db.js');
    return db.prisma;
};

type SessionContext = {
    userId: string;
    tenantId: string;
    workspaceIds: string[];
    scope?: 'customer' | 'internal';
    expiresAt: number;
};

export type RegisterAgentDispatchRoutesOptions = {
    getSession: (request: FastifyRequest) => SessionContext | null;
    prisma?: Awaited<ReturnType<typeof getPrisma>>;
};

export async function registerAgentDispatchRoutes(
    app: FastifyInstance,
    options: RegisterAgentDispatchRoutesOptions,
): Promise<void> {
    const resolvePrisma = options.prisma
        ? () => Promise.resolve(options.prisma!)
        : getPrisma;

    // -----------------------------------------------------------------------
    // POST /v1/agents/dispatch
    // -----------------------------------------------------------------------
    app.post<{ Body: Partial<AgentDispatchRequest> }>(
        '/v1/agents/dispatch',
        async (request, reply) => {
            const session = options.getSession(request);
            if (!session) {
                return reply.code(401).send({ error: 'Unauthorized' });
            }

            const { valid, errors } = validate(request.body ?? {}, {
                fromAgentId: { required: true, type: 'string', maxLength: 128 },
                toAgentId: { required: true, type: 'string', maxLength: 128 },
                workspaceId: { required: true, type: 'string', maxLength: 128 },
                tenantId: { required: true, type: 'string', maxLength: 128 },
                taskDescription: { required: true, type: 'string', maxLength: 4096 },
            });
            if (!valid) return reply.code(400).send({ error: errors[0] });

            // Fields are guaranteed present after validation
            const { fromAgentId, toAgentId, workspaceId, tenantId, taskDescription } =
                request.body as Required<AgentDispatchRequest>;

            const dispatchId = randomUUID();
            const queuedAt = new Date().toISOString();

            try {
                const prisma = await resolvePrisma();
                await prisma.agentDispatchRecord.create({
                    data: {
                        id: dispatchId,
                        fromAgentId,
                        toAgentId,
                        workspaceId,
                        tenantId,
                        taskDescription,
                        status: 'queued',
                        wakeSource: 'agent_handoff',
                        queuedAt: new Date(queuedAt),
                    },
                });

                const result: AgentDispatchResult = {
                    dispatchId,
                    fromAgentId,
                    toAgentId,
                    status: 'queued',
                    queuedAt,
                };
                return reply.code(202).send(result);
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                console.error('[agent-dispatch] Prisma write failed:', message);

                const result: AgentDispatchResult = {
                    dispatchId,
                    fromAgentId,
                    toAgentId,
                    status: 'failed',
                    queuedAt,
                    error: message,
                };
                return reply.code(202).send(result);
            }
        },
    );
}
