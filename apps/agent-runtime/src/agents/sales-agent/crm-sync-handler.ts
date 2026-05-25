/**
 * crm-sync-handler.ts
 *
 * Sprint 22 — Closing Gaps
 *
 * workspace_crm_sync
 *   Pushes prospect contact + deal data to HubSpot or Salesforce via REST API.
 *   Auto-detects which CRM to use from config / env vars.
 *
 *   HubSpot:
 *     - Upserts Contact (search by email → PATCH, else POST)
 *     - Upserts Deal (POST/PATCH /crm/v3/objects/deals)
 *     - Associates Contact ↔ Deal
 *     - Writes back hubspotContactId / hubspotDealId to DB
 *
 *   Salesforce:
 *     - Upserts Lead (PATCH /sobjects/Lead/Email/:email)
 *     - Upserts Opportunity (POST/PATCH /sobjects/Opportunity)
 *     - Writes back salesforceContactId / salesforceDealId to DB
 *
 *   Config / env:
 *     HubSpot:    config.hubspotAccessToken  OR  HUBSPOT_ACCESS_TOKEN
 *     Salesforce: config.salesforceInstanceUrl + config.salesforceAccessToken
 *                 OR  SALESFORCE_INSTANCE_URL + SALESFORCE_ACCESS_TOKEN
 */

import type { PrismaClient } from '@prisma/client';
import type { SalesAgentConfigRecord } from '@agentfarm/shared-types';

// ---------------------------------------------------------------------------
// DB structural types
// ---------------------------------------------------------------------------

type PrismaWithCrmSync = {
    prospect: {
        findUnique: (args: { where: { id: string } }) => Promise<Record<string, unknown> | null>;
        update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<Record<string, unknown>>;
    };
    salesDeal: {
        findFirst: (args: { where: Record<string, unknown>; orderBy?: Record<string, unknown> }) => Promise<Record<string, unknown> | null>;
        update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<Record<string, unknown>>;
    };
    salesActivity: {
        create: (args: { data: Record<string, unknown> }) => Promise<{ id: string }>;
    };
};

// ---------------------------------------------------------------------------
// HubSpot sync
// ---------------------------------------------------------------------------

async function syncToHubSpot(
    accessToken: string,
    prospect: Record<string, unknown>,
    deal: Record<string, unknown> | null,
): Promise<{ contactId?: string; dealId?: string; error?: string }> {
    const BASE = 'https://api.hubapi.com';
    const headers: Record<string, string> = {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
    };

    const email = String(prospect['email'] ?? '');
    const contactProperties = {
        email,
        firstname: String(prospect['firstName'] ?? ''),
        lastname: String(prospect['lastName'] ?? ''),
        company: String(prospect['company'] ?? ''),
        jobtitle: String(prospect['title'] ?? ''),
        phone: String(prospect['phone'] ?? ''),
        website: String(prospect['linkedinUrl'] ?? ''),
    };

    // ── Upsert contact ────────────────────────────────────────────────────────
    let contactId = String(prospect['hubspotContactId'] ?? '');

    if (contactId) {
        await fetch(`${BASE}/crm/v3/objects/contacts/${contactId}`, {
            method: 'PATCH',
            headers,
            body: JSON.stringify({ properties: contactProperties }),
        }).catch(() => undefined);
    } else {
        // Search by email
        const searchResp = await fetch(`${BASE}/crm/v3/objects/contacts/search`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                filterGroups: [{ filters: [{ propertyName: 'email', operator: 'EQ', value: email }] }],
                properties: ['hs_object_id'],
                limit: 1,
            }),
        });
        if (searchResp.ok) {
            const searchData = await searchResp.json() as { results?: Array<{ id: string }> };
            contactId = searchData.results?.[0]?.id ?? '';
        }

        if (contactId) {
            await fetch(`${BASE}/crm/v3/objects/contacts/${contactId}`, {
                method: 'PATCH',
                headers,
                body: JSON.stringify({ properties: contactProperties }),
            }).catch(() => undefined);
        } else {
            const createResp = await fetch(`${BASE}/crm/v3/objects/contacts`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ properties: contactProperties }),
            });
            if (createResp.ok) {
                const d = await createResp.json() as { id?: string };
                contactId = d.id ?? '';
            }
        }
    }

    if (!contactId) return { error: 'Failed to upsert HubSpot contact' };

    // ── Upsert deal ───────────────────────────────────────────────────────────
    let dealId = String(deal?.['hubspotDealId'] ?? '');
    if (deal) {
        const stage = String(deal['stage'] ?? 'discovery');
        const hubspotStage =
            stage === 'closed_won' ? 'closedwon' :
            stage === 'closed_lost' ? 'closedlost' : 'qualifiedtobuy';

        const dealProperties = {
            dealname: `${String(prospect['company'] ?? 'Deal')} — ${String(deal['title'] ?? stage)}`,
            amount: String(deal['value'] ?? '0'),
            dealstage: hubspotStage,
            pipeline: 'default',
            closedate: deal['closedAt']
                ? new Date(deal['closedAt'] as string).toISOString()
                : new Date(Date.now() + 30 * 86_400_000).toISOString(),
        };

        if (dealId) {
            await fetch(`${BASE}/crm/v3/objects/deals/${dealId}`, {
                method: 'PATCH',
                headers,
                body: JSON.stringify({ properties: dealProperties }),
            }).catch(() => undefined);
        } else {
            const createDealResp = await fetch(`${BASE}/crm/v3/objects/deals`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ properties: dealProperties }),
            });
            if (createDealResp.ok) {
                const d = await createDealResp.json() as { id?: string };
                dealId = d.id ?? '';
            }
        }

        // Associate contact ↔ deal
        if (contactId && dealId) {
            await fetch(`${BASE}/crm/v3/associations/contacts/deals/batch/create`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    inputs: [{ from: { id: contactId }, to: { id: dealId }, type: 'contact_to_deal' }],
                }),
            }).catch(() => undefined);
        }
    }

    return { contactId, dealId: dealId || undefined };
}

// ---------------------------------------------------------------------------
// Salesforce sync
// ---------------------------------------------------------------------------

async function syncToSalesforce(
    instanceUrl: string,
    accessToken: string,
    prospect: Record<string, unknown>,
    deal: Record<string, unknown> | null,
): Promise<{ contactId?: string; dealId?: string; error?: string }> {
    const API = `${instanceUrl.replace(/\/$/, '')}/services/data/v59.0`;
    const headers: Record<string, string> = {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
    };

    const email = String(prospect['email'] ?? '');
    const firstName = String(prospect['firstName'] ?? '');
    const lastName = String(prospect['lastName'] ?? '') || 'Unknown';

    const leadData = {
        FirstName: firstName,
        LastName: lastName,
        Email: email,
        Company: String(prospect['company'] ?? 'Unknown'),
        Title: String(prospect['title'] ?? ''),
        Website: String(prospect['linkedinUrl'] ?? ''),
        LeadSource: 'AgentFarm',
    };

    // ── Upsert Lead by email ──────────────────────────────────────────────────
    let contactId = String(prospect['salesforceContactId'] ?? '');

    if (contactId) {
        await fetch(`${API}/sobjects/Lead/${contactId}`, {
            method: 'PATCH',
            headers,
            body: JSON.stringify(leadData),
        }).catch(() => undefined);
    } else {
        // Upsert via external id (Email field)
        const upsertResp = await fetch(
            `${API}/sobjects/Lead/Email/${encodeURIComponent(email)}`,
            { method: 'PATCH', headers, body: JSON.stringify(leadData) },
        );
        if (upsertResp.status === 201) {
            const d = await upsertResp.json() as { id?: string };
            contactId = d.id ?? '';
        } else if (upsertResp.ok) {
            // 200 = updated, id not in body — query by email
            const qResp = await fetch(
                `${API}/query?q=${encodeURIComponent(`SELECT Id FROM Lead WHERE Email = '${email}' LIMIT 1`)}`,
                { headers },
            );
            if (qResp.ok) {
                const q = await qResp.json() as { records?: Array<{ Id: string }> };
                contactId = q.records?.[0]?.Id ?? '';
            }
        } else {
            // Create new Lead
            const createResp = await fetch(`${API}/sobjects/Lead`, {
                method: 'POST',
                headers,
                body: JSON.stringify(leadData),
            });
            if (createResp.ok) {
                const d = await createResp.json() as { id?: string };
                contactId = d.id ?? '';
            }
        }
    }

    // ── Upsert Opportunity ────────────────────────────────────────────────────
    let dealId = String(deal?.['salesforceDealId'] ?? '');
    if (deal) {
        const stage = String(deal['stage'] ?? 'Prospecting');
        const sfStage =
            stage === 'closed_won' ? 'Closed Won' :
            stage === 'closed_lost' ? 'Closed Lost' : 'Prospecting';

        const oppData = {
            Name: `${String(prospect['company'] ?? 'Unknown')} — ${String(deal['title'] ?? sfStage)}`,
            StageName: sfStage,
            Amount: deal['value'] ?? 0,
            CloseDate: deal['closedAt']
                ? new Date(deal['closedAt'] as string).toISOString().slice(0, 10)
                : new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10),
            LeadSource: 'AgentFarm',
        };

        if (dealId) {
            await fetch(`${API}/sobjects/Opportunity/${dealId}`, {
                method: 'PATCH',
                headers,
                body: JSON.stringify(oppData),
            }).catch(() => undefined);
        } else {
            const createResp = await fetch(`${API}/sobjects/Opportunity`, {
                method: 'POST',
                headers,
                body: JSON.stringify(oppData),
            });
            if (createResp.ok) {
                const d = await createResp.json() as { id?: string };
                dealId = d.id ?? '';
            }
        }
    }

    return { contactId: contactId || undefined, dealId: dealId || undefined };
}

// ---------------------------------------------------------------------------
// Public params / result
// ---------------------------------------------------------------------------

export type CrmSyncProvider = 'hubspot' | 'salesforce' | 'auto';

export interface CrmSyncParams {
    prospectId: string;
    tenantId: string;
    botId: string;
    config: SalesAgentConfigRecord & {
        hubspotAccessToken?: string;
        salesforceInstanceUrl?: string;
        salesforceAccessToken?: string;
        crmSyncEnabled?: boolean;
    };
    dealId?: string;
    /** Force a specific provider, or leave as 'auto' to pick from env/config */
    provider?: CrmSyncProvider;
}

export interface CrmSyncResult {
    ok: boolean;
    provider?: string;
    crmContactId?: string;
    crmDealId?: string;
    error?: string;
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

export async function syncToCrm(
    params: CrmSyncParams,
    prisma?: PrismaClient,
): Promise<CrmSyncResult> {
    const { prospectId, tenantId, botId, config } = params;

    const db = prisma ? (prisma as unknown as PrismaWithCrmSync) : null;

    const prospect = db ? await db.prospect.findUnique({ where: { id: prospectId } }) : null;
    if (!prospect) return { ok: false, error: 'Prospect not found' };
    if (String(prospect['tenantId'] ?? '') !== tenantId) return { ok: false, error: 'Tenant isolation violation' };

    // Resolve deal
    let deal: Record<string, unknown> | null = null;
    if (db) {
        if (params.dealId) {
            deal = await db.salesDeal.findFirst({ where: { id: params.dealId, tenantId } });
        } else {
            deal = await db.salesDeal.findFirst({
                where: { prospectId, tenantId },
                orderBy: { createdAt: 'desc' },
            });
        }
    }

    // Resolve provider
    const hubspotToken = config.hubspotAccessToken ?? process.env['HUBSPOT_ACCESS_TOKEN'] ?? '';
    const sfInstanceUrl = config.salesforceInstanceUrl ?? process.env['SALESFORCE_INSTANCE_URL'] ?? '';
    const sfAccessToken = config.salesforceAccessToken ?? process.env['SALESFORCE_ACCESS_TOKEN'] ?? '';

    const wantHubSpot = params.provider === 'hubspot' || (params.provider !== 'salesforce' && !!hubspotToken);
    const wantSalesforce = params.provider === 'salesforce' || (!wantHubSpot && !!(sfInstanceUrl && sfAccessToken));

    const resolvedProvider: 'hubspot' | 'salesforce' | null = wantHubSpot ? 'hubspot' : wantSalesforce ? 'salesforce' : null;

    if (!resolvedProvider) {
        return {
            ok: false,
            error: 'No CRM provider configured. Set HUBSPOT_ACCESS_TOKEN or SALESFORCE_INSTANCE_URL + SALESFORCE_ACCESS_TOKEN.',
        };
    }

    let syncResult: { contactId?: string; dealId?: string; error?: string };

    if (resolvedProvider === 'hubspot') {
        if (!hubspotToken) return { ok: false, error: 'HUBSPOT_ACCESS_TOKEN not set' };
        syncResult = await syncToHubSpot(hubspotToken, prospect, deal);
    } else {
        if (!sfInstanceUrl || !sfAccessToken) {
            return { ok: false, error: 'SALESFORCE_INSTANCE_URL and SALESFORCE_ACCESS_TOKEN are required' };
        }
        syncResult = await syncToSalesforce(sfInstanceUrl, sfAccessToken, prospect, deal);
    }

    if (syncResult.error) return { ok: false, error: syncResult.error };

    // Write CRM IDs back to DB
    if (db && syncResult.contactId) {
        const contactField = resolvedProvider === 'hubspot' ? 'hubspotContactId' : 'salesforceContactId';
        await db.prospect.update({
            where: { id: prospectId },
            data: { [contactField]: syncResult.contactId },
        }).catch(() => undefined);
    }

    if (db && deal && syncResult.dealId) {
        const dealField = resolvedProvider === 'hubspot' ? 'hubspotDealId' : 'salesforceDealId';
        await db.salesDeal.update({
            where: { id: String(deal['id']) },
            data: { [dealField]: syncResult.dealId },
        }).catch(() => undefined);
    }

    const now = new Date();
    if (db) {
        await db.salesActivity.create({
            data: {
                tenantId, botId, prospectId,
                dealId: deal ? String(deal['id']) : null,
                activityType: 'crm_synced',
                subject: `Synced to ${resolvedProvider}`,
                body: JSON.stringify({ contactId: syncResult.contactId, dealId: syncResult.dealId }),
                outcome: 'synced',
                completedAt: now,
                createdAt: now,
                updatedAt: now,
            },
        }).catch(() => undefined);
    }

    return {
        ok: true,
        provider: resolvedProvider,
        crmContactId: syncResult.contactId,
        crmDealId: syncResult.dealId,
    };
}
