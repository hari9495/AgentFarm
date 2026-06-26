/**
 * role-baseline-blocks.ts — GET /v1/governance/role-baseline-blocks
 *
 * Returns the built-in (Phase 2 RBAC) hard-block action list per role, so the
 * dashboard can display what is already blocked read-only before operators add
 * their own customer rules. Static data sourced from @agentfarm/shared-types
 * (kept in sync with the runtime registry by an agent-runtime drift test).
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { BASELINE_BLOCKED_ACTIONS_BY_ROLE } from '@agentfarm/shared-types';

type SessionContext = { userId: string; tenantId: string; workspaceIds: string[]; expiresAt: number };
type Options = { getSession: (request: FastifyRequest) => SessionContext | null };

export async function registerRoleBaselineBlockRoutes(
    app: FastifyInstance,
    options: Options,
): Promise<void> {
    const handler = async (req: FastifyRequest, res: FastifyReply) => {
        if (!options.getSession(req)) return res.status(401).send({ error: 'Unauthorized' });
        const { roleKey } = (req.query ?? {}) as { roleKey?: string };
        if (roleKey) {
            return res.send({ roleKey, blockedActions: BASELINE_BLOCKED_ACTIONS_BY_ROLE[roleKey] ?? [] });
        }
        return res.send({ baseline: BASELINE_BLOCKED_ACTIONS_BY_ROLE });
    };
    app.get('/v1/governance/role-baseline-blocks', handler);
    app.get('/api/v1/governance/role-baseline-blocks', handler);
}
