/**
 * Decrypt-only counterpart to apps/api-gateway/src/lib/field-encryption.ts —
 * agent-runtime never writes SalesAgentConfig (api-gateway's sales-config.ts
 * route owns that), but it does read the same encrypted columns directly via
 * its own PrismaClient (loadSalesConfig in sales-action-handler.ts), so it
 * needs the same AES-256-GCM decrypt using the same shared FIELD_ENCRYPTION_KEY.
 *
 * Values written by api-gateway are prefixed `enc:iv:tag:ciphertext`; legacy
 * plaintext rows (or any row when FIELD_ENCRYPTION_KEY isn't set) pass through
 * unchanged.
 */

import { createDecipheriv, createHmac } from 'node:crypto';

const ENCRYPTED_PREFIX = 'enc:';

const SENSITIVE_SALES_FIELDS = [
    'twilioAuthToken',
    'signalwireApiToken',
    'plivoAuthToken',
    'vonageApiSecret',
    'vonagePrivateKey',
    'phantombusterApiKey',
    'newsApiKey',
    'hubspotAccessToken',
    'salesforceAccessToken',
    'bookingWebhookSecret',
    'contractWebhookSecret',
    'winNotificationSecret',
] as const;

function getFieldKey(): Buffer {
    const raw = process.env['FIELD_ENCRYPTION_KEY'] ?? '';
    if (!raw || raw.length < 32) {
        throw new Error('FIELD_ENCRYPTION_KEY must be set and at least 32 characters');
    }
    return Buffer.from(createHmac('sha256', raw).update('agentfarm-field-v1').digest());
}

function decryptField(stored: string): string {
    const key = getFieldKey();
    const body = stored.slice(ENCRYPTED_PREFIX.length);
    const [ivHex, tagHex, ctHex] = body.split(':');
    if (!ivHex || !tagHex || ctHex === undefined) {
        throw new Error('Malformed encrypted field: expected enc:iv:tag:ciphertext');
    }
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return decipher.update(Buffer.from(ctHex, 'hex')).toString('utf8') + decipher.final('utf8');
}

/** Decrypts the sensitive SalesAgentConfig columns on a row read from Postgres. */
export function decryptSalesConfigFields<T extends Record<string, unknown> | null>(config: T): T {
    if (!config) return config;
    const out = { ...config };
    for (const field of SENSITIVE_SALES_FIELDS) {
        const value = out[field];
        if (typeof value === 'string' && value.startsWith(ENCRYPTED_PREFIX)) {
            try {
                (out as Record<string, unknown>)[field] = decryptField(value);
            } catch {
                // non-fatal — return ciphertext as-is if the key is unavailable/wrong
            }
        }
    }
    return out as T;
}
