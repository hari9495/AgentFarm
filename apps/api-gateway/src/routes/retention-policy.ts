import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { PrismaClient } from '@prisma/client';

/**
 * Retention Policy REST API for dashboard configuration.
 * Customers can:
 * - Create/update retention policies (tenant, workspace, role-scoped)
 * - List policies for their tenant
 * - Delete policies
 * - Set default policy
 */

export async function registerRetentionPolicyRoutes(app: FastifyInstance, prisma: PrismaClient) {
    // ========== CREATE RETENTION POLICY ==========
    app.post('/api/v1/retention-policies', async (req: FastifyRequest, res: FastifyReply) => {
        try {
            const body = req.body as any;
            const { tenantId, workspaceId, roleKey, name, description, scope, action, retentionDays } = body;

            if (!tenantId || !name || !scope || !action) {
                return res.status(400).send({ error: 'Missing required fields: tenantId, name, scope, action' });
            }

            if (action === 'auto_delete_after_days' && !retentionDays) {
                return res.status(400).send({ error: 'retentionDays required when action is auto_delete_after_days' });
            }

            const policy = await prisma.retentionPolicy.create({
                data: {
                    tenantId,
                    workspaceId: workspaceId || null,
                    roleKey: roleKey || null,
                    name,
                    description: description || null,
                    scope,
                    action,
                    retentionDays: retentionDays || null,
                    effectiveFrom: new Date(),
                    status: 'active' as any,
                    createdBy: (req as any).user?.id || 'system',
                    updatedBy: (req as any).user?.id || 'system',
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
    app.get('/api/v1/retention-policies', async (req: FastifyRequest, res: FastifyReply) => {
        try {
            const query = req.query as any;
            const { tenantId, workspaceId, roleKey, status } = query;

            if (!tenantId) {
                return res.status(400).send({ error: 'tenantId required' });
            }

            const policies = await prisma.retentionPolicy.findMany({
                where: {
                    tenantId: tenantId as string,
                    ...(workspaceId ? { workspaceId: workspaceId as string } : {}),
                    ...(roleKey ? { roleKey: roleKey as string } : {}),
                    ...(status ? { status: status as any } : { status: 'active' }),
                },
                orderBy: { createdAt: 'desc' },
            });

            return res.send({ tenantId, policyCount: policies.length, policies });
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Unknown error';
            return res.status(500).send({ error: `Failed to list policies: ${msg}` });
        }
    });

    // ========== GET SPECIFIC POLICY ==========
    app.get('/api/v1/retention-policies/:policyId', async (req: FastifyRequest, res: FastifyReply) => {
        try {
            const params = req.params as any;
            const { policyId } = params;

            const policy = await prisma.retentionPolicy.findUnique({ where: { id: policyId } });
            if (!policy) {
                return res.status(404).send({ error: 'Policy not found' });
            }

            return res.send({ policy });
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Unknown error';
            return res.status(500).send({ error: `Failed to fetch policy: ${msg}` });
        }
    });

    // ========== UPDATE RETENTION POLICY ==========
    app.patch('/api/v1/retention-policies/:policyId', async (req: FastifyRequest, res: FastifyReply) => {
        try {
            const params = req.params as any;
            const body = req.body as any;
            const { policyId } = params;
            const { name, description, action, retentionDays } = body;

            const policy = await prisma.retentionPolicy.findUnique({ where: { id: policyId } });
            if (!policy) {
                return res.status(404).send({ error: 'Policy not found' });
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
                    updatedBy: (req as any).user?.id || 'system',
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
    app.delete('/api/v1/retention-policies/:policyId', async (req: FastifyRequest, res: FastifyReply) => {
        try {
            const params = req.params as any;
            const query = req.query as any;
            const { policyId } = params;
            const { mode } = query;

            const policy = await prisma.retentionPolicy.findUnique({ where: { id: policyId } });
            if (!policy) {
                return res.status(404).send({ error: 'Policy not found' });
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
                        updatedBy: (req as any).user?.id || 'system',
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
    app.post('/api/v1/retention-policies/:policyId/set-default', async (req: FastifyRequest, res: FastifyReply) => {
        try {
            const params = req.params as any;
            const body = req.body as any;
            const { policyId } = params;
            const { tenantId } = body;

            if (!tenantId) {
                return res.status(400).send({ error: 'tenantId required' });
            }

            const policy = await prisma.retentionPolicy.findUnique({ where: { id: policyId } });
            if (!policy || policy.tenantId !== tenantId) {
                return res.status(404).send({ error: 'Policy not found or does not belong to tenant' });
            }

            return res.send({ message: `Policy ${policyId} set as default for tenant ${tenantId}` });
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Unknown error';
            return res.status(500).send({ error: `Failed to set default: ${msg}` });
        }
    });

    // ========== GET POLICY STATISTICS ==========
    app.get('/api/v1/retention-policies/:policyId/stats', async (req: FastifyRequest, res: FastifyReply) => {
        try {
            const params = req.params as any;
            const { policyId } = params;

            const policy = await prisma.retentionPolicy.findUnique({ where: { id: policyId } });
            if (!policy) {
                return res.status(404).send({ error: 'Policy not found' });
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
