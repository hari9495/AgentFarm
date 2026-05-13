import type { FastifyInstance, FastifyRequest } from 'fastify';
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

function trimStr(v: unknown): string {
    return typeof v === 'string' ? v.trim() : '';
}

export function registerLeadRoutes(app: FastifyInstance): void {
    /**
     * POST /api/v1/leads
     *
     * Accepts a website contact/enquiry form submission, stores a log entry,
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

            const lead = {
                firstName: trimStr(body.firstName) || undefined,
                lastName,
                email,
                company,
                phone: trimStr(body.phone) || undefined,
                description: trimStr(body.description) || undefined,
                leadSource: trimStr(body.leadSource) || 'Web',
            };

            let crmResult: { success: boolean; id?: string; error?: string } | null = null;

            if (isSalesforceLeadSyncEnabled()) {
                crmResult = await syncLeadToSalesforce(lead).catch((err: unknown) => ({
                    success: false,
                    error: err instanceof Error ? err.message : String(err),
                }));

                if (!crmResult.success) {
                    // Non-fatal — log and continue
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
}
