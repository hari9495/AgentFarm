import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import {
    isSalesforceLeadSyncEnabled,
    syncLeadToSalesforce,
} from '../lib/salesforce-lead-sync.js';

type LeadFormBody = {
    firstName?: string;
    lastName?: string;
    email?: string;
    company?: string;
    phone?: string;
    description?: string;
    leadSource?: string;
};

type LeadStatusBody = {
    status?: string;
};

type LeadListQuery = {
    status?: string;
    page?: string;
    limit?: string;
};

type LeadIdParams = { id: string };

const VALID_STATUSES = new Set(['NEW', 'NURTURE', 'QUALIFIED', 'DISQUALIFIED', 'CONVERTED']);

function trimStr(v: unknown): string {
    return typeof v === 'string' ? v.trim() : '';
}

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

export function registerLeadRoutes(app: FastifyInstance, options: { prisma?: PrismaClient } = {}): void {
    const getPrisma = async (): Promise<PrismaClient> => {
        if (options.prisma) return options.prisma;
        const { prisma: dbPrisma } = await import('../lib/db.js');
        return dbPrisma;
    };

    /**
     * POST /api/v1/leads
     *
     * Accepts a website contact/enquiry form submission, persists a Lead record,
     * and (when SALESFORCE_LEAD_SYNC_ENABLED=true) syncs the lead to Salesforce.
     *
     * The Salesforce sync is best-effort — a CRM failure never returns an error
     * to the form submitter.
     */
    app.post<{ Body: LeadFormBody }>(
        '/api/v1/leads',
        async (request, reply) => {
            const body = request.body ?? ({} as LeadFormBody);

            const lastName = trimStr(body.lastName);
            const email = trimStr(body.email);
            const company = trimStr(body.company);

            if (!lastName) {
                return reply.code(400).send({ error: 'lastName is required' });
            }
            if (!email || !email.includes('@')) {
                return reply.code(400).send({ error: 'A valid email is required' });
            }
            if (!company) {
                return reply.code(400).send({ error: 'company is required' });
            }

            const prisma = await getPrisma();
            const lead = await prisma.lead.create({
                data: {
                    firstName: trimStr(body.firstName),
                    lastName,
                    email,
                    company,
                    message: trimStr(body.description) || null,
                    leadSource: trimStr(body.leadSource) || 'Web',
                    status: 'NEW',
                },
            });

            let crmResult: { success: boolean; id?: string; error?: string } | null = null;

            if (isSalesforceLeadSyncEnabled()) {
                crmResult = await syncLeadToSalesforce({
                    firstName: lead.firstName,
                    lastName: lead.lastName,
                    email: lead.email,
                    company: lead.company,
                    phone: trimStr(body.phone) || undefined,
                    description: lead.message ?? undefined,
                    leadSource: lead.leadSource,
                }).catch((err: unknown) => ({
                    success: false,
                    error: err instanceof Error ? err.message : String(err),
                }));

                if (crmResult.success && crmResult.id) {
                    await prisma.lead.update({
                        where: { id: lead.id },
                        data: { sfLeadId: crmResult.id },
                    });
                } else if (!crmResult.success) {
                    console.warn('[leads] Salesforce sync failed:', crmResult.error);
                }
            }

            return reply.code(201).send({
                ok: true,
                lead,
                salesforce: crmResult
                    ? { synced: crmResult.success, id: crmResult.id ?? null }
                    : { synced: false, id: null },
            });
        },
    );

    /**
     * PATCH /api/v1/leads/:id/status
     *
     * Transitions a lead to a new status. Sets relevant timestamp fields
     * and schedules next nurture contact when transitioning to NURTURE.
     */
    app.patch<{ Params: LeadIdParams; Body: LeadStatusBody }>(
        '/api/v1/leads/:id/status',
        async (request, reply) => {
            const { id } = request.params;
            const status = trimStr((request.body as LeadStatusBody)?.status).toUpperCase();

            if (!VALID_STATUSES.has(status)) {
                return reply.code(400).send({ error: `status must be one of: ${[...VALID_STATUSES].join(', ')}` });
            }

            const prisma = await getPrisma();
            const existing = await prisma.lead.findUnique({ where: { id } });
            if (!existing) {
                return reply.code(404).send({ error: 'Lead not found' });
            }

            const now = new Date();
            const updateData: Record<string, unknown> = { status };

            if (status === 'NURTURE') {
                updateData['nextContactAt'] = new Date(now.getTime() + THREE_DAYS_MS);
                updateData['lastContactAt'] = now;
            } else if (status === 'QUALIFIED') {
                updateData['qualifiedAt'] = now;
            } else if (status === 'DISQUALIFIED') {
                updateData['disqualifiedAt'] = now;
            } else if (status === 'CONVERTED') {
                updateData['convertedAt'] = now;
            }

            const updated = await prisma.lead.update({
                where: { id },
                data: updateData as never,
            });

            return reply.code(200).send({ ok: true, lead: updated });
        },
    );

    /**
     * GET /api/v1/leads
     *
     * Returns a paginated list of leads, optionally filtered by status.
     */
    app.get<{ Querystring: LeadListQuery }>(
        '/api/v1/leads',
        async (request, reply) => {
            const { status, page, limit } = request.query;

            const pageNum = Math.max(1, parseInt(page ?? '1', 10) || 1);
            const limitNum = Math.min(100, Math.max(1, parseInt(limit ?? '20', 10) || 20));
            const skip = (pageNum - 1) * limitNum;

            const where: Record<string, unknown> = {};
            if (status) {
                const upperStatus = status.toUpperCase();
                if (!VALID_STATUSES.has(upperStatus)) {
                    return reply.code(400).send({ error: `status must be one of: ${[...VALID_STATUSES].join(', ')}` });
                }
                where['status'] = upperStatus;
            }

            const prisma = await getPrisma();
            const [leads, total] = await Promise.all([
                prisma.lead.findMany({
                    where: where as never,
                    orderBy: { createdAt: 'desc' },
                    skip,
                    take: limitNum,
                }),
                prisma.lead.count({ where: where as never }),
            ]);

            return reply.code(200).send({ leads, total, page: pageNum, limit: limitNum });
        },
    );
}
