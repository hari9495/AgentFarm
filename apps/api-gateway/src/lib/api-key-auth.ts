import crypto from 'node:crypto';
import type { PrismaClient } from '@prisma/client';

// ── Key generation ────────────────────────────────────────────────────────────

/**
 * Generate a new raw API key.
 * Format: "af_" + 64 hex chars = 67 chars total.
 * The raw key is returned only once at creation — never stored.
 */
export function generateApiKey(): string {
    return 'af_' + crypto.randomBytes(32).toString('hex');
}

/**
 * Hash a raw key for storage using SHA-256.
 * Never store the raw key; always store and compare the hash.
 */
export function hashApiKey(rawKey: string): string {
    return crypto.createHash('sha256').update(rawKey).digest('hex');
}

/**
 * Return the key prefix used for display (first 11 chars: "af_" + 8 hex).
 */
export function getKeyPrefix(rawKey: string): string {
    return rawKey.slice(0, 11);
}

// ── Validation ────────────────────────────────────────────────────────────────

export type ApiKeyData = {
    apiKeyId: string;
    tenantId: string;
    role: string;
    scopes: string[];
};

/**
 * Validate a raw API key against the database.
 * Returns ApiKeyData on success, null on any failure (not found, disabled, expired).
 * Fire-and-forget updates lastUsedAt on success.
 */
export async function validateApiKey(
    rawKey: string,
    prisma: PrismaClient,
): Promise<ApiKeyData | null> {
    if (!rawKey.startsWith('af_')) {
        return null;
    }

    const keyHash = hashApiKey(rawKey);

    const record = await prisma.apiKey.findUnique({
        where: { keyHash },
        select: {
            id: true,
            tenantId: true,
            role: true,
            scopes: true,
            enabled: true,
            expiresAt: true,
        },
    });

    if (!record) {
        return null;
    }

    if (!record.enabled) {
        return null;
    }

    if (record.expiresAt !== null && record.expiresAt < new Date()) {
        return null;
    }

    // Fire-and-forget — do not await so we don't delay the request
    void prisma.apiKey
        .update({ where: { keyHash }, data: { lastUsedAt: new Date() } })
        .catch(() => undefined);

    return {
        apiKeyId: record.id,
        tenantId: record.tenantId,
        role: record.role,
        scopes: record.scopes,
    };
}
