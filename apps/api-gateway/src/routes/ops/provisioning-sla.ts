/**
 * provisioning-sla.ts — ops monitoring route for SLA reporting.
 *
 * The heavy calculation was extracted to ops-sla-service.ts (pure, testable).
 * This file is the thin HTTP binding: verify the ops token, load data, delegate.
 */

import type { FastifyInstance } from 'fastify';
import { verifyOpsToken } from '../../request-context.js';
import { buildSlaSummary } from '../../services/ops-sla-service.js';
import { prisma } from '../../lib/db.js';

export const registerOpsSlaRoutes = async (app: FastifyInstance): Promise<void> => {
    app.get('/ops/provisioning/sla', async (request, reply) => {
        if (!verifyOpsToken(request)) {
            return reply.code(401).send({
                error: 'unauthorized',
                message: 'Provide a valid x-ops-token for monitoring endpoints.',
            });
        }

        const jobs = await prisma.provisioningJob.findMany({
            select: {
                id: true,
                tenantId: true,
                status: true,
                requestedAt: true,
                startedAt: true,
                completedAt: true,
                updatedAt: true,
            },
        });

        return buildSlaSummary(jobs);
    });
};
