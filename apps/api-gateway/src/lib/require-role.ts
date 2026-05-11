import type { FastifyRequest, FastifyReply } from 'fastify';

export const ROLE_RANK: Record<string, number> = {
    viewer: 1,
    operator: 2,
    admin: 3,
    owner: 4,
};

export function requireRole(minimum: string) {
    return async (req: FastifyRequest, reply: FastifyReply) => {
        const session = (req as any).session;
        if (!session) {
            return reply.status(401).send({ error: 'unauthenticated' });
        }
        const userRank = ROLE_RANK[session.role] ?? 0;
        const minRank = ROLE_RANK[minimum] ?? 99;
        if (userRank < minRank) {
            return reply.status(403).send({ error: 'insufficient_role', required: minimum, actual: session.role });
        }
    };
}
