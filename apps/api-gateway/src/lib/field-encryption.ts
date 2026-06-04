/**
 * field-encryption.ts — AES-256-GCM at-rest encryption for sensitive DB columns.
 *
 * Uses the same cipher design as the MFA TOTP secret encryption so the two can
 * share operational procedures (key rotation, auditing). Stored format:
 *
 *   iv(24 hex chars):authTag(32 hex chars):ciphertext(hex)
 *
 * Key derivation:
 *   FIELD_ENCRYPTION_KEY env var (≥32 chars) → HMAC-SHA256("agentfarm-field-v1") → 32-byte AES key.
 *
 * Usage:
 *   const enc = encryptField(plaintext);   // store in DB
 *   const plain = decryptField(enc);       // read from DB
 *   const enc = encryptFieldIfSet(plain);  // no-op when key absent (logs warning)
 *
 * Intended for columns in SalesAgentConfig:
 *   twilioAuthToken, signalwireApiToken, plivoAuthToken, vonageApiSecret,
 *   vonagePrivateKey, phantombusterApiKey, hubspotAccessToken, salesforceAccessToken,
 *   bookingWebhookSecret, contractWebhookSecret, winNotificationSecret, newsApiKey
 *
 * The FIELD_ENCRYPTION_KEY MUST be set before encrypting new values. Existing
 * plaintext rows must be migrated (re-written through encryptField) after the
 * key is introduced. See scripts/migrate-encrypt-fields.ts for guidance.
 */

import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';

// Prefix used to distinguish encrypted ciphertext from legacy plaintext in the DB.
// Any value that starts with 'enc:' was stored by this module.
export const ENCRYPTED_PREFIX = 'enc:';

function getFieldKey(): Buffer {
    const raw = process.env['FIELD_ENCRYPTION_KEY'] ?? '';
    if (!raw || raw.length < 32) {
        throw new Error('FIELD_ENCRYPTION_KEY must be set and at least 32 characters');
    }
    return Buffer.from(createHmac('sha256', raw).update('agentfarm-field-v1').digest());
}

/**
 * Encrypt a plaintext string. Returns a compact `enc:iv:tag:ciphertext` string.
 * Throws if FIELD_ENCRYPTION_KEY is not configured.
 */
export function encryptField(plaintext: string): string {
    const key = getFieldKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${ENCRYPTED_PREFIX}${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypt a value produced by encryptField.
 * Throws if the value is malformed, the auth tag is invalid, or the key is wrong.
 */
export function decryptField(stored: string): string {
    if (!stored.startsWith(ENCRYPTED_PREFIX)) {
        throw new Error(`Value is not encrypted (missing "${ENCRYPTED_PREFIX}" prefix)`);
    }
    const key = getFieldKey();
    const body = stored.slice(ENCRYPTED_PREFIX.length);
    const [ivHex, tagHex, ctHex] = body.split(':');
    // ctHex may be '' for empty-string plaintext, so check for undefined not falsiness
    if (!ivHex || !tagHex || ctHex === undefined) {
        throw new Error('Malformed encrypted field: expected enc:iv:tag:ciphertext');
    }
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return decipher.update(Buffer.from(ctHex, 'hex')).toString('utf8') + decipher.final('utf8');
}

/**
 * Returns true if the value was encrypted by this module (has the enc: prefix).
 * Useful for mixed-state rows during a migration window.
 */
export function isEncrypted(value: string): boolean {
    return value.startsWith(ENCRYPTED_PREFIX);
}

/**
 * Encrypt a field only if FIELD_ENCRYPTION_KEY is configured.
 * Returns the plaintext unchanged if the key is absent (with a console.warn).
 * Use this during a transition period when the key may not yet be set on all
 * deployments — it allows writes to proceed without crashing while reminding
 * operators to set the key.
 */
export function encryptFieldIfSet(plaintext: string): string {
    if (!process.env['FIELD_ENCRYPTION_KEY']?.trim()) {
        console.warn('[field-encryption] FIELD_ENCRYPTION_KEY not set — storing field as plaintext');
        return plaintext;
    }
    return encryptField(plaintext);
}

/**
 * Decrypt a field that may be plaintext (legacy) or encrypted (new).
 * During a migration window, rows may be stored in either format.
 */
export function decryptFieldMaybeUnencrypted(stored: string): string {
    if (!isEncrypted(stored)) return stored;
    return decryptField(stored);
}
