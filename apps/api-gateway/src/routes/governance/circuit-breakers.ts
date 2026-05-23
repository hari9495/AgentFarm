/**
 * Phase 23 — Circuit breaker management routes.
 *
 * GET  /v1/circuit-breakers            — list all in-memory circuit states (admin)
 * POST /v1/circuit-breakers/:key/reset — manually reset a circuit to closed (admin)
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { ROLE_RANK } from '../lib/require-role.js';
import { getAllCircuitStates, resetCircuit, type CircuitEntry } from '../lib/circuit-breaker.js';

type SessionContext = {
    userId: string;
    tenantId: string;
    workspaceIds: string[];
    role?: string;
    expiresAt: number;
};

export type RegisterCircuitBreakerRoutesOptions = {
    getSession: (request: FastifyRequest) => SessionContext | null;
};

type CircuitKeyParams = { key: string };

type CircuitStateDto = CircuitEntry & { key: string };

export const registerCircuitBreakerRoutes = async (
    app: FastifyInstance,
    options: RegisterCircuitBreakerRoutesOptions,
): Promise<void> => {
    const { getSession } = options;

    /**
     * GET /v1/circuit-breakers
     * Admin only — returns all in-memory circuit state entries.
     */
    app.get('/v1/circuit-breakers', async (request, reply) => {
        const session = getSession(request);
        if (!session) {
            return reply.code(401).send({ error: 'unauthorized' });
        }
        const roleRank = ROLE_RANK[session.role ?? ''] ?? 0;
        if (roleRank < ROLE_RANK['admin']) {
            return reply.code(403).send({ error: 'forbidden', requiredRole: 'admin' });
        }

        const all = getAllCircuitStates();
        const circuits: CircuitStateDto[] = [];
        for (const [key, entry] of all.entries()) {
            circuits.push({ key, ...entry });
        }

        return reply.code(200).send({ circuits });
    });

    /**
     * POST /v1/circuit-breakers/:key/reset
     * Admin only — manually resets (deletes) a circuit entry, returning it to closed.
     * The :key param arrives URL-encoded; decode before passing to resetCircuit.
     */
    app.post<{ Params: CircuitKeyParams }>(
        '/v1/circuit-breakers/:key/reset',
        async (request, reply) => {
            const session = getSession(request);
            if (!session) {
                return reply.code(401).send({ error: 'unauthorized' });
            }
            const roleRank = ROLE_RANK[session.role ?? ''] ?? 0;
            if (roleRank < ROLE_RANK['admin']) {
                return reply.code(403).send({ error: 'forbidden', requiredRole: 'admin' });
            }

            const key = decodeURIComponent(request.params.key);
            resetCircuit(key);

            return reply.code(200).send({ reset: true, key });
        },
    );
};
