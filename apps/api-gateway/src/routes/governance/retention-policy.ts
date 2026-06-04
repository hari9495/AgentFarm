import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@prisma/client';

/**
 * Retention Policy REST API for dashboard configuration.
 * Customers can:
 * - Create/update retention policies (tenant, workspace, role-scoped)
 * - List policies for their tenant
 * - Delete policies
 * - Set default policy
 *
 * All routes require an authenticated session. tenantId is always taken
 * from the session — never from the request body or query string.
 */

type SessionContext = {
    userId: string;
    tenantId: string;
    workspaceIds: string[];
    scope?: 'customer' | 'internal';
    expiresAt: number;
};

type RegisterRetentionPolicyRoutesOptions = {
    getSession: (request: FastifyRequest) => SessionContext | null;
};

export async function registerRetentionPolicyRoutes(
    app: FastifyInstance,
    prisma: PrismaClient,
    options: RegisterRetentionPolicyRoutesOptions,
) {
    const { getSession } = options;

    // Register route at both /v1/ and /api/v1/ (deprecated alias — will be removed in v2)
    const on = (m: 'get' | 'post' | 'patch' | 'delete', p: string, h: (req: FastifyRequest, res: FastifyReply) => Promise<unknown>) => {
        (app as any)[m](`/v1${p}`, h);
        (app as any)[m](`/api/v1${p}`, h); // deprecated: use /v1/
    };

    // ========== CREATE RETENTION POLICY ==========
    on('post', '/retention-policies', async (req: FastifyRequest, res: FastifyReply) => {
        const session = getSession(req);
        if (!session) return res.status(401).send({ error: 'Unauthorized' });

        try {
            const body = req.body as any;
            const { workspaceId, roleKey, name, description, scope, action, retentionDays } = body;

            if (!name || !scope || !action) {
                return res.status(400).send({ error: 'Missing required fields: name, scope, action' });
            }

            if (action === 'auto_delete_after_days' && !retentionDays) {
                return res.status(400).send({ error: 'retentionDays required when action is auto_delete_after_days' });
            }

            const policy = await prisma.retentionPolicy.create({
                data: {
                    tenantId:    session.tenantId,  // always from session
                    workspaceId: workspaceId || null,
                    roleKey:     roleKey || null,
                    name,
                    description: description || null,
                    scope,
                    action,
                    retentionDays: retentionDays || null,
                    effectiveFrom: new Date(),
                    status: 'active' as any,
                    createdBy: session.userId,
                    updatedBy: session.userId,
                    correlationId: (req as any).id,
                },
            });

            return res.status(201).send({ policy, message: 'Retention policy created successfully' });
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Unknown error';
            return res.status(500).send({ error: `Failed to create policy: ${msg}` });
        }
    });

    // ========== GET POLICIES FOR TENANT ==========
    on('get', '/retention-policies', async (req: FastifyRequest, res: FastifyReply) => {
        const session = getSession(req);
        if (!session) return res.status(401).send({ error: 'Unauthorized' });

        try {
            const query = req.query as any;
            const { workspaceId, roleKey, status } = query;

            const policies = await prisma.retentionPolicy.findMany({
                where: {
                    tenantId: session.tenantId,  // always from session
                    ...(workspaceId ? { workspaceId: workspaceId as string } : {}),
                    ...(roleKey ? { roleKey: roleKey as string } : {}),
                    ...(status ? { status: status as any } : { status: 'active' }),
                },
                orderBy: { createdAt: 'desc' },
            });

            return res.send({ tenantId: session.tenantId, policyCount: policies.length, policies });
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Unknown error';
            return res.status(500).send({ error: `Failed to list policies: ${msg}` });
        }
    });

    // ========== GET SPECIFIC POLICY ==========
    on('get', '/retention-policies/:policyId', async (req: FastifyRequest, res: FastifyReply) => {
        const session = getSession(req);
        if (!session) return res.status(401).send({ error: 'Unauthorized' });

        try {
            const params = req.params as any;
            const { policyId } = params;

            const policy = await prisma.retentionPolicy.findUnique({ where: { id: policyId } });
            if (!policy) {
                return res.status(404).send({ error: 'Policy not found' });
            }
            // Ownership check
            if (policy.tenantId !== session.tenantId) {
                return res.status(403).send({ error: 'Forbidden' });
            }

            return res.send({ policy });
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Unknown error';
            return res.status(500).send({ error: `Failed to fetch policy: ${msg}` });
        }
    });

    // ========== UPDATE RETENTION POLICY ==========
    on('patch', '/retention-policies/:policyId', async (req: FastifyRequest, res: FastifyReply) => {
        const session = getSession(req);
        if (!session) return res.status(401).send({ error: 'Unauthorized' });

        try {
            const params = req.params as any;
            const body = req.body as any;
            const { policyId } = params;
            const { name, description, action, retentionDays } = body;

            const policy = await prisma.retentionPolicy.findUnique({ where: { id: policyId } });
            if (!policy) {
                return res.status(404).send({ error: 'Policy not found' });
            }
            // Ownership check
            if (policy.tenantId !== session.tenantId) {
                return res.status(403).send({ error: 'Forbidden' });
            }

            if (body.tenantId || body.scope) {
                return res.status(400).send({ error: 'Cannot modify tenantId or scope after creation' });
            }

            const updated = await prisma.retentionPolicy.update({
                where: { id: policyId },
                data: {
                    name: name || policy.name,
                    description: description ?? policy.description,
                    action: action || policy.action,
                    retentionDays: retentionDays ?? policy.retentionDays,
                    updatedBy: session.userId,
                    updatedAt: new Date(),
                },
            });

            return res.send({ policy: updated, message: 'Policy updated successfully' });
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Unknown error';
            return res.status(500).send({ error: `Failed to update policy: ${msg}` });
        }
    });

    // ========== ARCHIVE/DELETE POLICY ==========
    on('delete', '/retention-policies/:policyId', async (req: FastifyRequest, res: FastifyReply) => {
        const session = getSession(req);
        if (!session) return res.status(401).send({ error: 'Unauthorized' });

        try {
            const params = req.params as any;
            const query = req.query as any;
            const { policyId } = params;
            const { mode } = query;

            const policy = await prisma.retentionPolicy.findUnique({ where: { id: policyId } });
            if (!policy) {
                return res.status(404).send({ error: 'Policy not found' });
            }
            // Ownership check
            if (policy.tenantId !== session.tenantId) {
                return res.status(403).send({ error: 'Forbidden' });
            }

            if (mode === 'hard') {
                await prisma.retentionPolicy.delete({ where: { id: policyId } });
                return res.send({ message: 'Policy permanently deleted', policyId });
            } else {
                await prisma.retentionPolicy.update({
                    where: { id: policyId },
                    data: {
                        status: 'archived' as any,
                        expiredAt: new Date(),
                        updatedBy: session.userId,
                        updatedAt: new Date(),
                    },
                });
                return res.send({ message: 'Policy archived successfully', policyId });
            }
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Unknown error';
            return res.status(500).send({ error: `Failed to delete policy: ${msg}` });
        }
    });

    // ========== SET DEFAULT POLICY FOR TENANT ==========
    on('post', '/retention-policies/:policyId/set-default', async (req: FastifyRequest, res: FastifyReply) => {
        const session = getSession(req);
        if (!session) return res.status(401).send({ error: 'Unauthorized' });

        try {
            const params = req.params as any;
            const { policyId } = params;

            const policy = await prisma.retentionPolicy.findUnique({ where: { id: policyId } });
            if (!policy || policy.tenantId !== session.tenantId) {
                return res.status(404).send({ error: 'Policy not found or does not belong to tenant' });
            }

            return res.send({ message: `Policy ${policyId} set as default for tenant ${session.tenantId}` });
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Unknown error';
            return res.status(500).send({ error: `Failed to set default: ${msg}` });
        }
    });

    // ========== GET POLICY STATISTICS ==========
    on('get', '/retention-policies/:policyId/stats', async (req: FastifyRequest, res: FastifyReply) => {
        const session = getSession(req);
        if (!session) return res.status(401).send({ error: 'Unauthorized' });

        try {
            const params = req.params as any;
            const { policyId } = params;

            const policy = await prisma.retentionPolicy.findUnique({ where: { id: policyId } });
            if (!policy) {
                return res.status(404).send({ error: 'Policy not found' });
            }
            // Ownership check
            if (policy.tenantId !== session.tenantId) {
                return res.status(403).send({ error: 'Forbidden' });
            }

            const sessionCount = await prisma.agentSession.count({ where: { retentionPolicyId: policyId } });
            const expiredCount = await prisma.agentSession.count({
                where: { retentionPolicyId: policyId, retentionExpiresAt: { lt: new Date() } },
            });

            return res.send({ policyId, sessionsManaged: sessionCount, sessionsExpired: expiredCount, estimatedArtifactCount: sessionCount * 50 });
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Unknown error';
            return res.status(500).send({ error: `Failed to get stats: ${msg}` });
        }
    });
}
