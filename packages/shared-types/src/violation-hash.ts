/**
 * violation-hash.ts — tamper-evident hash chain for policy-violation records.
 *
 * Each PolicyViolation links to the previous one for its tenant via
 *   hash = sha256(prevHash + canonical(materialFields))
 * forming a per-tenant chain. Any edit/insert/delete of a historical row breaks
 * the chain, which the compliance verifier detects. The SAME function is used by
 * the runtime recorder (to write the hash) and the gateway verifier (to re-walk
 * it), so the two can never disagree.
 */

import { createHash } from 'node:crypto';

/** Material fields covered by the hash (decision content, not mutable metadata). */
export interface ViolationHashFields {
    tenantId: string;
    actionType: string;
    connector?: string | null;
    effect: string;
    reason: string;
    matchedPolicyId?: string | null;
    policyVersion?: number | null;
    source: string;
}

/** Canonical, order-stable serialization of the material fields. */
function canonical(f: ViolationHashFields): string {
    return JSON.stringify([
        f.tenantId,
        f.actionType,
        f.connector ?? '',
        f.effect,
        f.reason,
        f.matchedPolicyId ?? '',
        f.policyVersion ?? '',
        f.source,
    ]);
}

/** Computes the chain hash for a violation given the previous row's hash. */
export function computeViolationHash(prevHash: string, fields: ViolationHashFields): string {
    return createHash('sha256').update(`${prevHash}\n${canonical(fields)}`).digest('hex');
}
