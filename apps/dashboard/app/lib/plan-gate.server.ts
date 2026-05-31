// Server-only plan helpers — uses next/headers via internal-session.
// Import only from Server Components or API routes, never from 'use client' files.

import { getInternalSessionAuthHeader, getSessionPayload } from './internal-session';
import { hasAuditAccess } from './plan-gate';

const API_BASE = () => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

export async function fetchAuditAccess(): Promise<{ planName: string; access: boolean }> {
    // Internal-scope sessions (AgentFarm operators) always have full access.
    const session = await getSessionPayload();
    if (session?.scope === 'internal') {
        return { planName: 'Internal', access: true };
    }

    const authHeader = await getInternalSessionAuthHeader();
    if (!authHeader) return { planName: '', access: false };
    try {
        const res = await fetch(`${API_BASE()}/v1/dashboard/summary`, {
            headers: { Authorization: authHeader },
            cache: 'no-store',
        });
        if (!res.ok) return { planName: '', access: false };
        const data = (await res.json()) as { tenantSummary?: { plan_name?: string } };
        const planName = data.tenantSummary?.plan_name ?? '';
        return { planName, access: hasAuditAccess(planName) };
    } catch {
        return { planName: '', access: false };
    }
}
