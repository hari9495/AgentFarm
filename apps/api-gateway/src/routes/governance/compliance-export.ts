/**
 * compliance-export.ts — GET /v1/governance/compliance-export
 *
 * Returns the tenant's full governance compliance report (active policies,
 * uploaded policy documents, violation history). Session-authed; tenant always
 * from session. Read-only.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { getComplianceExport } from '../../lib/compliance-export.js';

type SessionContext = {
    userId: string;
    tenantId: string;
    workspaceIds: string[];
    scope?: 'customer' | 'internal';
    expiresAt: number;
};

type Options = { getSession: (request: FastifyRequest) => SessionContext | null };

export async function registerComplianceExportRoutes(
    app: FastifyInstance,
    prisma: PrismaClient,
    options: Options,
): Promise<void> {
    const { getSession } = options;
    const handler = async (req: FastifyRequest, res: FastifyReply) => {
        const session = getSession(req);
        if (!session) return res.status(401).send({ error: 'Unauthorized' });
        try {
            const report = await getComplianceExport(prisma, session.tenantId);
            const { format } = (req.query ?? {}) as { format?: string };
            if (format === 'download') {
                res.header('content-type', 'application/json');
                res.header(
                    'content-disposition',
                    `attachment; filename="compliance-${session.tenantId}-${new Date().toISOString().slice(0, 10)}.json"`,
                );
            }
            return res.send(report);
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Unknown error';
            return res.status(500).send({ error: `Failed to build compliance export: ${msg}` });
        }
    };
    app.get('/v1/governance/compliance-export', handler);
    app.get('/api/v1/governance/compliance-export', handler);
}
