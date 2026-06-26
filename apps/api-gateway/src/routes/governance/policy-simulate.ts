/**
 * policy-simulate.ts — POST /v1/governance/policy-simulate
 *
 * Preview the effect of the active customer policy on a sample action. Merges the
 * tenant-scope and (optional) role-scope active policies, then runs the pure
 * simulator. Session-authed; tenant from session. Read-only.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import type { GovernanceRule } from '@agentfarm/shared-types';
import { simulatePolicyAction, type SimulationInput } from '../../lib/policy-simulator.js';

type SessionContext = {
    userId: string;
    tenantId: string;
    workspaceIds: string[];
    scope?: 'customer' | 'internal';
    expiresAt: number;
};

type Options = { getSession: (request: FastifyRequest) => SessionContext | null };

async function loadActiveRules(
    prisma: PrismaClient,
    tenantId: string,
    scopeRef: string,
): Promise<GovernanceRule[]> {
    const row = await prisma.governancePolicy.findFirst({
        where: { tenantId, scope: scopeRef === '' ? 'tenant' : 'role', scopeRef, status: 'active' },
        orderBy: { version: 'desc' },
    });
    return Array.isArray(row?.rulesJson) ? (row!.rulesJson as unknown as GovernanceRule[]) : [];
}

export async function registerPolicySimulateRoutes(
    app: FastifyInstance,
    prisma: PrismaClient,
    options: Options,
): Promise<void> {
    const { getSession } = options;
    const handler = async (req: FastifyRequest, res: FastifyReply) => {
        const session = getSession(req);
        if (!session) return res.status(401).send({ error: 'Unauthorized' });

        const body = (req.body ?? {}) as {
            roleKey?: string;
            actionType?: string;
            connector?: string;
            tool?: string;
            env?: string;
            isWrite?: boolean;
        };
        const actionType = typeof body.actionType === 'string' ? body.actionType.trim() : '';
        if (!actionType) return res.status(400).send({ error: 'actionType is required' });

        const input: SimulationInput = {
            actionType,
            connector: body.connector?.trim() || undefined,
            tool: body.tool?.trim() || undefined,
            env: body.env?.trim() || undefined,
            isWrite: body.isWrite === true,
        };

        try {
            const roleKey = typeof body.roleKey === 'string' ? body.roleKey.trim() : '';
            const [tenantRules, roleRules] = await Promise.all([
                loadActiveRules(prisma, session.tenantId, ''),
                roleKey ? loadActiveRules(prisma, session.tenantId, roleKey) : Promise.resolve([]),
            ]);
            const result = simulatePolicyAction([...tenantRules, ...roleRules], input);
            return res.send({ input, result });
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Unknown error';
            return res.status(500).send({ error: `Simulation failed: ${msg}` });
        }
    };
    app.post('/v1/governance/policy-simulate', handler);
    app.post('/api/v1/governance/policy-simulate', handler);
}
