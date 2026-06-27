/**
 * policy-violation-recorder.ts — Phase 6.
 *
 * Records an append-only PolicyViolation row whenever a task is blocked by a
 * governance policy. Called from the single action-result chokepoint
 * (persistActionResultRecord) when failureClass === 'policy_violation', so it
 * captures every deny path (connector / env-time / role / document) without
 * instrumenting each enforcer.
 *
 * Best-effort: never throws, never affects task flow.
 */

import { PrismaClient } from '@prisma/client';
import { computeViolationHash } from '@agentfarm/shared-types';

let _prisma: PrismaClient | null | undefined;

function getPrisma(): PrismaClient | null {
    if (_prisma !== undefined) return _prisma;
    if (!process.env['DATABASE_URL']?.trim()) {
        _prisma = null;
        return null;
    }
    try {
        _prisma = new PrismaClient();
    } catch {
        _prisma = null;
    }
    return _prisma;
}

/** Extracts `policy=<id>@v<n>` provenance from a deny errorMessage, if present. */
export function parsePolicyProvenance(
    errorMessage: string | undefined,
): { matchedPolicyId?: string; policyVersion?: number } {
    if (!errorMessage) return {};
    const m = errorMessage.match(/policy=([^@\s]+)@v(\d+)/);
    if (!m) {
        const idOnly = errorMessage.match(/policy=([^@\s]+)@v\?/);
        return idOnly ? { matchedPolicyId: idOnly[1] } : {};
    }
    return { matchedPolicyId: m[1], policyVersion: Number(m[2]) };
}

/** Heuristically classifies which enforcer produced the deny. */
export function inferViolationSource(errorMessage: string | undefined, actionType: string): string {
    const s = `${errorMessage ?? ''} ${actionType}`.toLowerCase();
    if (s.includes('connector')) return 'connector';
    if (s.includes('environment') || s.includes('time') || s.includes('window')) return 'env_time';
    if (s.includes('role')) return 'role';
    if (s.includes('policy_denied') || s.includes('from ')) return 'document';
    return 'runtime';
}

export interface PolicyViolationInput {
    tenantId: string;
    workspaceId?: string;
    botId?: string;
    taskId?: string;
    actionType: string;
    connector?: string;
    riskLevel?: string;
    reason: string;
    correlationId?: string;
}

type PrismaLike = Pick<PrismaClient, 'policyViolation'>;

/**
 * Persists a PolicyViolation. `prismaOverride` is for tests; production uses the
 * lazy singleton. Returns true on write, false when skipped/failed (best-effort).
 *
 * Maintains a per-tenant tamper-evident hash chain: each row links to the
 * previous tenant row via `prevHash`, and `hash = sha256(prevHash + content)`.
 */
export async function recordPolicyViolation(
    input: PolicyViolationInput,
    prismaOverride?: PrismaLike,
): Promise<boolean> {
    const prisma = prismaOverride ?? getPrisma();
    if (!prisma || !input.tenantId) return false;
    const prov = parsePolicyProvenance(input.reason);
    const reason = input.reason.slice(0, 1000);
    const source = inferViolationSource(input.reason, input.actionType);
    try {
        // Link to the tenant's latest hashed row (genesis '' if none).
        const last = await prisma.policyViolation.findFirst({
            where: { tenantId: input.tenantId, hash: { not: null } },
            orderBy: { createdAt: 'desc' },
            select: { hash: true },
        });
        const prevHash = last?.hash ?? '';
        const hash = computeViolationHash(prevHash, {
            tenantId: input.tenantId,
            actionType: input.actionType,
            connector: input.connector || null,
            effect: 'deny',
            reason,
            matchedPolicyId: prov.matchedPolicyId ?? null,
            policyVersion: prov.policyVersion ?? null,
            source,
        });

        await prisma.policyViolation.create({
            data: {
                tenantId: input.tenantId,
                workspaceId: input.workspaceId || null,
                botId: input.botId || null,
                taskId: input.taskId || null,
                actionType: input.actionType,
                connector: input.connector || null,
                riskLevel: input.riskLevel || null,
                effect: 'deny',
                reason,
                matchedPolicyId: prov.matchedPolicyId ?? null,
                policyVersion: prov.policyVersion ?? null,
                source,
                correlationId: input.correlationId || null,
                prevHash,
                hash,
            },
        });
        return true;
    } catch {
        return false;
    }
}
