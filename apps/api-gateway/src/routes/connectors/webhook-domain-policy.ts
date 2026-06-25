import type { PrismaClient } from '@prisma/client';

/**
 * Phase 4 — per-tenant outbound webhook domain governance.
 *
 * Reads the tenant's active `GovernancePolicy(scope=tenant)` for `connector:'webhook'`
 * rules and projects them into an allow/deny domain policy. This layers ON TOP of the
 * SSRF floor in the outbound-webhook handlers — the SSRF check always runs first and is
 * never loosened by this policy.
 *
 *   - any `effect:'allow'` webhook rule present  → allow-list mode (only listed allowed)
 *   - otherwise                                  → deny-list mode (listed domains blocked)
 *
 * Fail-safe: missing policy or DB error → empty deny-mode policy (nothing extra blocked).
 */

export interface WebhookDomainPolicy {
    mode: 'allow' | 'deny';
    denied: Set<string>;
    allowed: Set<string>;
}

type WebhookRule = { effect?: string; connector?: string; domain?: string };

/** A rule domain matches a host if equal or the host is a subdomain of it. */
function domainMatches(ruleDomain: string, host: string): boolean {
    const d = ruleDomain.replace(/^\./, '').toLowerCase();
    const h = host.toLowerCase();
    return h === d || h.endsWith(`.${d}`);
}

/** True when an outbound webhook URL's host is denied by the policy. */
export function isWebhookDomainDenied(policy: WebhookDomainPolicy, rawUrl: string): boolean {
    let host: string;
    try {
        host = new URL(rawUrl).hostname;
    } catch {
        return true; // unparseable → fail-closed
    }
    if (policy.mode === 'allow') {
        // allow-list: deny unless some allowed domain matches
        for (const d of policy.allowed) {
            if (domainMatches(d, host)) return false;
        }
        return true;
    }
    // deny-list: deny only if a denied domain matches
    for (const d of policy.denied) {
        if (domainMatches(d, host)) return true;
    }
    return false;
}

/** Loads the tenant's webhook domain policy from the active tenant-scope governance policy. */
export async function getWebhookDomainPolicy(
    prisma: PrismaClient,
    tenantId: string,
): Promise<WebhookDomainPolicy> {
    const denied = new Set<string>();
    const allowed = new Set<string>();
    try {
        const row = await prisma.governancePolicy.findFirst({
            where: { tenantId, scope: 'tenant', scopeRef: '', status: 'active' },
            orderBy: { version: 'desc' },
        });
        const rules: WebhookRule[] = Array.isArray(row?.rulesJson) ? (row!.rulesJson as WebhookRule[]) : [];
        for (const r of rules) {
            if (r.connector !== 'webhook' || !r.domain) continue;
            if (r.effect === 'allow') allowed.add(r.domain);
            else if (r.effect === 'deny') denied.add(r.domain);
        }
    } catch {
        return { mode: 'deny', denied: new Set(), allowed: new Set() };
    }
    return { mode: allowed.size > 0 ? 'allow' : 'deny', denied, allowed };
}
