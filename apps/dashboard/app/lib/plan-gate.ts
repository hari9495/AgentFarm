// Pure plan-tier logic — no server-only imports, safe to use in client components.

const AUDIT_PLANS = new Set([
    'business', 'enterprise', 'pro', 'professional',
    'team', 'scale', 'ultimate', 'advanced',
]);

export function hasAuditAccess(planName: string): boolean {
    return AUDIT_PLANS.has(planName.toLowerCase().trim());
}
