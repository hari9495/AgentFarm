import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@prisma/client';

/**
 * Role Policy REST API (Governance Phase 2) — lets customers author per-role
 * hard-block rules from the dashboard. These tighten the built-in role
 * blocklist that the agent-runtime enforces (`getActiveRoleBlocklist`):
 * `scope='role'`, `scopeRef=<roleKey>`, rules are `{ actionType, effect:'deny' }`.
 *
 * Tighten-only by construction: only `deny` rules are written, and the runtime
 * unions them on top of the code registry — customer policy can never loosen a
 * built-in block.
 *
 * All routes require an authenticated session. `tenantId` is always taken from
 * the session — never from the request body or query string.
 */

type SessionContext = {
    userId: string;
    tenantId: string;
    workspaceIds: string[];
    scope?: 'customer' | 'internal';
    expiresAt: number;
};

type RegisterRolePolicyRoutesOptions = {
    getSession: (request: FastifyRequest) => SessionContext | null;
};

type DenyRule = { actionType: string; effect: 'deny' };

export async function registerRolePolicyRoutes(
    app: FastifyInstance,
    prisma: PrismaClient,
    options: RegisterRolePolicyRoutesOptions,
) {
    const { getSession } = options;

    const on = (
        m: 'get' | 'post' | 'delete',
        p: string,
        h: (req: FastifyRequest, res: FastifyReply) => Promise<unknown>,
    ) => {
        (app as any)[m](`/v1${p}`, h);
        (app as any)[m](`/api/v1${p}`, h); // deprecated: use /v1/
    };

    // ========== CREATE + PUBLISH ROLE POLICY ==========
    on('post', '/governance/role-policies', async (req, res) => {
        const session = getSession(req);
        if (!session) return res.status(401).send({ error: 'Unauthorized' });

        const body = (req.body ?? {}) as {
            roleKey?: string;
            name?: string;
            description?: string;
            blockedActions?: unknown;
        };
        const roleKey = typeof body.roleKey === 'string' ? body.roleKey.trim() : '';
        const blockedActionsRaw = Array.isArray(body.blockedActions) ? body.blockedActions : [];
        const blockedActions = Array.from(
            new Set(
                blockedActionsRaw.filter(
                    (a): a is string => typeof a === 'string' && a.trim().length > 0,
                ).map((a) => a.trim()),
            ),
        );

        if (!roleKey || blockedActions.length === 0) {
            return res
                .status(400)
                .send({ error: 'roleKey and a non-empty blockedActions[] are required' });
        }

        const rules: DenyRule[] = blockedActions.map((actionType) => ({ actionType, effect: 'deny' }));

        try {
            const created = await prisma.$transaction(async (tx: any) => {
                // Archive any currently-active version for this role.
                const priorActive = await tx.governancePolicy.findMany({
                    where: { tenantId: session.tenantId, scope: 'role', scopeRef: roleKey, status: 'active' },
                });
                for (const p of priorActive) {
                    await tx.governancePolicy.update({ where: { id: p.id }, data: { status: 'archived' } });
                }
                // Next version number for this scope.
                const top = await tx.governancePolicy.findFirst({
                    where: { tenantId: session.tenantId, scope: 'role', scopeRef: roleKey },
                    orderBy: { version: 'desc' },
                });
                const version = (Number(top?.version) || 0) + 1;

                return tx.governancePolicy.create({
                    data: {
                        tenantId: session.tenantId, // always from session
                        scope: 'role',
                        scopeRef: roleKey,
                        version,
                        status: 'active',
                        name: body.name?.trim() || `${roleKey} role policy v${version}`,
                        description: body.description?.trim() || null,
                        rulesJson: rules as unknown as object,
                        createdBy: session.userId,
                        updatedBy: session.userId,
                    },
                });
            });

            return res.status(201).send({ policy: created, message: 'Role policy published' });
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Unknown error';
            return res.status(500).send({ error: `Failed to publish role policy: ${msg}` });
        }
    });

    // ========== LIST ROLE POLICIES ==========
    on('get', '/governance/role-policies', async (req, res) => {
        const session = getSession(req);
        if (!session) return res.status(401).send({ error: 'Unauthorized' });

        try {
            const { roleKey, status } = (req.query ?? {}) as { roleKey?: string; status?: string };
            const policies = await prisma.governancePolicy.findMany({
                where: {
                    tenantId: session.tenantId, // always from session
                    scope: 'role',
                    ...(roleKey ? { scopeRef: roleKey } : {}),
                    status: (status as any) || 'active',
                },
                orderBy: { version: 'desc' },
            });
            return res.send({ tenantId: session.tenantId, policyCount: policies.length, policies });
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Unknown error';
            return res.status(500).send({ error: `Failed to list role policies: ${msg}` });
        }
    });

    // ========== ARCHIVE ROLE POLICY ==========
    on('delete', '/governance/role-policies/:policyId', async (req, res) => {
        const session = getSession(req);
        if (!session) return res.status(401).send({ error: 'Unauthorized' });

        try {
            const { policyId } = req.params as { policyId: string };
            const policy = await prisma.governancePolicy.findUnique({ where: { id: policyId } });
            if (!policy) return res.status(404).send({ error: 'Policy not found' });
            if (policy.tenantId !== session.tenantId) return res.status(403).send({ error: 'Forbidden' });

            await prisma.governancePolicy.update({
                where: { id: policyId },
                data: { status: 'archived', updatedBy: session.userId },
            });
            return res.send({ message: 'Role policy archived', policyId });
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Unknown error';
            return res.status(500).send({ error: `Failed to archive role policy: ${msg}` });
        }
    });
}
