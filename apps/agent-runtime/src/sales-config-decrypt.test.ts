import test from 'node:test';
import assert from 'node:assert/strict';
import { createCipheriv, createHmac, randomBytes } from 'node:crypto';
import { decryptSalesConfigFields } from './sales-config-decrypt.js';

const TEST_KEY = 'a'.repeat(32);

// Mirrors apps/api-gateway/src/lib/field-encryption.ts's encryptField — the
// only way to produce a fixture matching what api-gateway actually writes.
function encryptForTest(plaintext: string, rawKey: string): string {
    const key = Buffer.from(createHmac('sha256', rawKey).update('agentfarm-field-v1').digest());
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `enc:${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

test('decrypts an encrypted field produced by api-gateway field-encryption.ts', () => {
    process.env['FIELD_ENCRYPTION_KEY'] = TEST_KEY;
    const ciphertext = encryptForTest('sk-real-hubspot-token', TEST_KEY);
    const result = decryptSalesConfigFields({ hubspotAccessToken: ciphertext, icp: 'saas' });
    assert.equal(result.hubspotAccessToken, 'sk-real-hubspot-token');
    assert.equal(result.icp, 'saas'); // non-sensitive field untouched
    delete process.env['FIELD_ENCRYPTION_KEY'];
});

test('legacy plaintext (no enc: prefix) passes through unchanged', () => {
    const result = decryptSalesConfigFields({ hubspotAccessToken: 'plain-legacy-token' });
    assert.equal(result.hubspotAccessToken, 'plain-legacy-token');
});

test('null config passes through unchanged', () => {
    assert.equal(decryptSalesConfigFields(null), null);
});

test('wrong FIELD_ENCRYPTION_KEY leaves ciphertext untouched instead of throwing', () => {
    const ciphertext = encryptForTest('sk-real-token', TEST_KEY);
    process.env['FIELD_ENCRYPTION_KEY'] = 'b'.repeat(32); // different key
    const result = decryptSalesConfigFields({ hubspotAccessToken: ciphertext });
    assert.equal(result.hubspotAccessToken, ciphertext); // decrypt failed → fail-safe passthrough
    delete process.env['FIELD_ENCRYPTION_KEY'];
});

test('non-sensitive fields and non-string values are never touched', () => {
    const result = decryptSalesConfigFields({ crmSyncEnabled: true, maxDiscountPercent: 15 });
    assert.equal(result.crmSyncEnabled, true);
    assert.equal(result.maxDiscountPercent, 15);
});
