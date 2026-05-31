import { getInternalSessionAuthHeader } from './internal-session';

const AUDIT_PLANS = new Set([
    'business', 'enterprise', 'pro', 'professional',
    'team', 'scale', 'ultimate', 'advanced',
]);

export function hasAuditAccess(planName: string): boolean {
    return AUDIT_PLANS.has(planName.toLowerCase().trim());
}

const API_BASE = () => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

export async function fetchAuditAccess(): Promise<{ planName: string; access: boolean }> {
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
