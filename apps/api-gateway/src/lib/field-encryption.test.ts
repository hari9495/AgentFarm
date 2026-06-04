/**
 * field-encryption.test.ts — Unit tests for AES-256-GCM field-level encryption.
 */

import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    encryptField,
    decryptField,
    encryptFieldIfSet,
    decryptFieldMaybeUnencrypted,
    isEncrypted,
    ENCRYPTED_PREFIX,
} from './field-encryption.js';

const TEST_KEY = 'test-field-encryption-key-min-32-chars!!';

const withKey = (key: string | undefined, fn: () => void) => {
    const prev = process.env['FIELD_ENCRYPTION_KEY'];
    if (key === undefined) {
        delete process.env['FIELD_ENCRYPTION_KEY'];
    } else {
        process.env['FIELD_ENCRYPTION_KEY'] = key;
    }
    try {
        fn();
    } finally {
        if (prev === undefined) delete process.env['FIELD_ENCRYPTION_KEY'];
        else process.env['FIELD_ENCRYPTION_KEY'] = prev;
    }
};

describe('encryptField / decryptField', () => {
    test('round-trips plaintext correctly', () => {
        withKey(TEST_KEY, () => {
            const plain = 'my-twilio-auth-token-abc123';
            const enc = encryptField(plain);
            const dec = decryptField(enc);
            assert.equal(dec, plain);
        });
    });

    test('encrypted value starts with enc: prefix', () => {
        withKey(TEST_KEY, () => {
            const enc = encryptField('secret');
            assert.ok(enc.startsWith(ENCRYPTED_PREFIX), `Expected enc: prefix, got: ${enc.slice(0, 20)}`);
        });
    });

    test('encrypted value is never the plaintext', () => {
        withKey(TEST_KEY, () => {
            const plain = 'vonage-api-secret-xyz';
            const enc = encryptField(plain);
            assert.notEqual(enc, plain);
            assert.ok(!enc.includes(plain), 'plaintext must not appear inside ciphertext');
        });
    });

    test('two encryptions of the same value produce different ciphertexts (random IV)', () => {
        withKey(TEST_KEY, () => {
            const plain = 'hubspot-access-token';
            const enc1 = encryptField(plain);
            const enc2 = encryptField(plain);
            assert.notEqual(enc1, enc2, 'each encryption must use a fresh random IV');
            // But both must decrypt to the same plaintext
            assert.equal(decryptField(enc1), plain);
            assert.equal(decryptField(enc2), plain);
        });
    });

    test('decryptField throws on tampered ciphertext (GCM auth tag fails)', () => {
        withKey(TEST_KEY, () => {
            const enc = encryptField('sensitive-data');
            // Flip the last byte of the ciphertext hex
            const lastChar = enc.slice(-1);
            const flipped = lastChar === 'a' ? 'b' : 'a';
            const tampered = enc.slice(0, -1) + flipped;
            assert.throws(() => decryptField(tampered));
        });
    });

    test('decryptField throws on wrong key', () => {
        // Encrypt with KEY_A, attempt to decrypt with KEY_B must fail
        const KEY_A = TEST_KEY;
        const KEY_B = 'different-key-that-is-also-32-chars-long!!';
        let encryptedWithA = '';
        withKey(KEY_A, () => {
            encryptedWithA = encryptField('salesforce-token');
        });
        withKey(KEY_B, () => {
            assert.throws(() => decryptField(encryptedWithA));
        });
    });

    test('decryptField throws when FIELD_ENCRYPTION_KEY is not set', () => {
        let enc: string;
        withKey(TEST_KEY, () => {
            enc = encryptField('test-value');
        });
        withKey(undefined, () => {
            assert.throws(() => decryptField(enc!), /FIELD_ENCRYPTION_KEY must be set/);
        });
    });

    test('encryptField throws when FIELD_ENCRYPTION_KEY is not set', () => {
        withKey(undefined, () => {
            assert.throws(() => encryptField('anything'), /FIELD_ENCRYPTION_KEY must be set/);
        });
    });

    test('decryptField throws on value without enc: prefix', () => {
        withKey(TEST_KEY, () => {
            assert.throws(() => decryptField('plaintext-not-encrypted'), /not encrypted/);
        });
    });

    test('round-trips empty string', () => {
        withKey(TEST_KEY, () => {
            assert.equal(decryptField(encryptField('')), '');
        });
    });

    test('round-trips multiline / unicode value', () => {
        withKey(TEST_KEY, () => {
            const value = '-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n-----END RSA PRIVATE KEY-----\n';
            assert.equal(decryptField(encryptField(value)), value);
        });
    });
});

describe('isEncrypted', () => {
    test('returns true for encrypted values', () => {
        withKey(TEST_KEY, () => {
            assert.ok(isEncrypted(encryptField('secret')));
        });
    });

    test('returns false for plaintext values', () => {
        assert.ok(!isEncrypted('plain-api-key'));
        assert.ok(!isEncrypted(''));
    });
});

describe('encryptFieldIfSet', () => {
    test('encrypts when key is present', () => {
        withKey(TEST_KEY, () => {
            const result = encryptFieldIfSet('my-token');
            assert.ok(isEncrypted(result));
        });
    });

    test('returns plaintext unchanged when key is absent (graceful degradation)', () => {
        withKey(undefined, () => {
            const result = encryptFieldIfSet('my-token');
            assert.equal(result, 'my-token');
        });
    });
});

describe('decryptFieldMaybeUnencrypted', () => {
    test('decrypts encrypted values', () => {
        withKey(TEST_KEY, () => {
            const enc = encryptField('webhook-secret-xyz');
            assert.equal(decryptFieldMaybeUnencrypted(enc), 'webhook-secret-xyz');
        });
    });

    test('passes through plaintext (legacy unencrypted rows)', () => {
        withKey(TEST_KEY, () => {
            assert.equal(decryptFieldMaybeUnencrypted('legacy-plaintext'), 'legacy-plaintext');
        });
    });

    test('passes through plaintext even without a key set', () => {
        withKey(undefined, () => {
            assert.equal(decryptFieldMaybeUnencrypted('legacy-key'), 'legacy-key');
        });
    });
});
