/**
 * opa-loader.ts — pushes the governance Rego bundle and per-tenant data
 * overlays into a running OPA instance via its REST API.
 *
 *   - loadPolicyBundle()  → PUT /v1/policies/agentfarm_governance   (the .rego)
 *   - pushTenantOverlay() → PUT /v1/data/agentfarm/tenants/<id>     (rules data)
 *   - removeTenantOverlay() → DELETE the tenant's data document
 *
 * The Rego source ships in services/policy-engine/policy/agentfarm/governance.rego
 * and is loaded at service startup; overlays are pushed whenever a tenant
 * publishes a policy version.
 */

import type { GovernanceRule } from '@agentfarm/shared-types';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const POLICY_ID = 'agentfarm_governance';

/** Per-tenant overlay document stored under data.agentfarm.tenants[<id>]. */
export interface TenantOverlay {
    policyId: string;
    version: number;
    rules: GovernanceRule[];
}

function resolveBaseUrl(opaBaseUrl?: string): string {
    return (opaBaseUrl ?? process.env['OPA_BASE_URL'] ?? 'http://localhost:8181').replace(/\/$/, '');
}

/** Absolute path to the bundled governance.rego (works from src and dist). */
export function defaultPolicyPath(): string {
    const here = dirname(fileURLToPath(import.meta.url));
    // src/ and dist/ both sit one level below the package root.
    return join(here, '..', 'policy', 'agentfarm', 'governance.rego');
}

/** Uploads the Rego policy document to OPA. Reads from disk when source omitted. */
export async function loadPolicyBundle(
    options: { opaBaseUrl?: string; regoSource?: string; fetchImpl?: typeof fetch } = {},
): Promise<void> {
    const baseUrl = resolveBaseUrl(options.opaBaseUrl);
    const fetchImpl = options.fetchImpl ?? globalThis.fetch;
    const source = options.regoSource ?? (await readFile(defaultPolicyPath(), 'utf8'));

    const res = await fetchImpl(`${baseUrl}/v1/policies/${POLICY_ID}`, {
        method: 'PUT',
        headers: { 'content-type': 'text/plain' },
        body: source,
    });
    if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`Failed to load OPA policy bundle: HTTP ${res.status} ${body}`);
    }
}

/** Pushes (replaces) a tenant's overlay data document. */
export async function pushTenantOverlay(
    tenantId: string,
    overlay: TenantOverlay,
    options: { opaBaseUrl?: string; fetchImpl?: typeof fetch } = {},
): Promise<void> {
    const baseUrl = resolveBaseUrl(options.opaBaseUrl);
    const fetchImpl = options.fetchImpl ?? globalThis.fetch;

    const res = await fetchImpl(
        `${baseUrl}/v1/data/agentfarm/tenants/${encodeURIComponent(tenantId)}`,
        {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(overlay),
        },
    );
    if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`Failed to push tenant overlay (${tenantId}): HTTP ${res.status} ${body}`);
    }
}

/** Removes a tenant's overlay (e.g. when all policies are archived). */
export async function removeTenantOverlay(
    tenantId: string,
    options: { opaBaseUrl?: string; fetchImpl?: typeof fetch } = {},
): Promise<void> {
    const baseUrl = resolveBaseUrl(options.opaBaseUrl);
    const fetchImpl = options.fetchImpl ?? globalThis.fetch;
    const res = await fetchImpl(
        `${baseUrl}/v1/data/agentfarm/tenants/${encodeURIComponent(tenantId)}`,
        { method: 'DELETE' },
    );
    // 404 is fine — nothing to remove.
    if (!res.ok && res.status !== 404) {
        const body = await res.text().catch(() => '');
        throw new Error(`Failed to remove tenant overlay (${tenantId}): HTTP ${res.status} ${body}`);
    }
}
