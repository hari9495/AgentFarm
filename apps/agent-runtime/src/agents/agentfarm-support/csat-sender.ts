// CSAT sender for the agentfarm-support agent.
// Fetches the tenant admin email from the gateway, then delegates to the
// customer-support-executive sendSurvey() function.
// Best-effort — any failure is swallowed so resolve actions are never blocked.

import { sendSurvey } from '../customer-support-executive/csat-surveyor.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CsatSenderDeps {
    gatewayBaseUrl: string;
    serviceToken: string;
}

export interface SupportCsatParams {
    tenantId: string;
    botId: string;
    issueId: string;
    resolutionNotes?: string;
}

// ---------------------------------------------------------------------------
// Fetch tenant admin email
// ---------------------------------------------------------------------------

export async function fetchTenantAdminEmail(
    tenantId: string,
    deps: CsatSenderDeps,
): Promise<string | null> {
    const base = deps.gatewayBaseUrl.replace(/\/+$/, '');
    try {
        const res = await fetch(`${base}/v1/tenants/${encodeURIComponent(tenantId)}/admin-contact`, {
            headers: { Authorization: `Bearer ${deps.serviceToken}` },
            signal: AbortSignal.timeout(5_000),
        });
        if (!res.ok) return null;
        const data = (await res.json()) as { email?: string };
        return typeof data.email === 'string' && data.email.trim() ? data.email.trim() : null;
    } catch {
        return null;
    }
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function sendSupportCsatSurvey(
    params: SupportCsatParams,
    deps: CsatSenderDeps,
): Promise<{ sent: boolean; surveyId?: string; reason?: string }> {
    const email = await fetchTenantAdminEmail(params.tenantId, deps);
    if (!email) {
        return { sent: false, reason: 'no admin email on file for tenant' };
    }

    try {
        const result = await sendSurvey({
            tenantId: params.tenantId,
            botId: params.botId,
            surveyType: 'csat',
            customerEmail: email,
            ticketId: params.issueId || undefined,
            agentName: 'AgentFarm Support',
            companyName: 'AgentFarm',
        });

        return {
            sent: result.status !== 'failed',
            surveyId: result.surveyId,
        };
    } catch {
        return { sent: false, reason: 'survey send error' };
    }
}
