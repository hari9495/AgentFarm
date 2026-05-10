import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { verifyHmacSha256, verifyTimingSafeEqual } from './webhook-verify.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSignature(payload: string, secret: string, encoding: 'hex' | 'base64' = 'hex'): string {
    return createHmac('sha256', secret).update(payload).digest(encoding);
}

// ---------------------------------------------------------------------------
// verifyHmacSha256
// ---------------------------------------------------------------------------

test('verifyHmacSha256 returns true for correct hex signature', () => {
    const payload = 'hello world';
    const secret = 'my-secret';
    const sig = makeSignature(payload, secret, 'hex');
    assert.equal(verifyHmacSha256(payload, secret, sig, 'hex'), true);
});

test('verifyHmacSha256 returns true for correct base64 signature', () => {
    const payload = 'test body';
    const secret = 'b64-secret';
    const sig = makeSignature(payload, secret, 'base64');
    assert.equal(verifyHmacSha256(payload, secret, sig, 'base64'), true);
});

test('verifyHmacSha256 returns false for wrong signature', () => {
    const payload = 'hello world';
    const secret = 'my-secret';
    const wrongSig = makeSignature(payload, 'other-secret', 'hex');
    assert.equal(verifyHmacSha256(payload, secret, wrongSig, 'hex'), false);
});

test('verifyHmacSha256 returns false for empty secret', () => {
    const payload = 'hello';
    const sig = makeSignature(payload, 'real-secret', 'hex');
    assert.equal(verifyHmacSha256(payload, '', sig, 'hex'), false);
});

test('verifyHmacSha256 returns false for empty signature', () => {
    const payload = 'hello';
    assert.equal(verifyHmacSha256(payload, 'secret', '', 'hex'), false);
});

test('verifyHmacSha256 does not throw for mismatched length inputs (length-extension safe)', () => {
    // Different payload → different length hex → length mismatch returns false, not throw
    const payload = 'short';
    const secret = 'sec';
    const wrongSig = 'abc'; // not a valid 64-char hex — different length
    assert.doesNotThrow(() => {
        const result = verifyHmacSha256(payload, secret, wrongSig, 'hex');
        assert.equal(result, false);
    });
});

test('verifyHmacSha256 accepts Buffer payload', () => {
    const payload = Buffer.from('buffer payload');
    const secret = 'buf-secret';
    const sig = createHmac('sha256', secret).update(payload).digest('hex');
    assert.equal(verifyHmacSha256(payload, secret, sig, 'hex'), true);
});

// ---------------------------------------------------------------------------
// verifyTimingSafeEqual
// ---------------------------------------------------------------------------

test('verifyTimingSafeEqual returns true for matching strings', () => {
    assert.equal(verifyTimingSafeEqual('abc123', 'abc123'), true);
});

test('verifyTimingSafeEqual returns false for mismatched strings', () => {
    assert.equal(verifyTimingSafeEqual('abc123', 'xyz789'), false);
});

test('verifyTimingSafeEqual returns false when first arg is empty', () => {
    assert.equal(verifyTimingSafeEqual('', 'abc123'), false);
});

test('verifyTimingSafeEqual returns false when second arg is empty', () => {
    assert.equal(verifyTimingSafeEqual('abc123', ''), false);
});

test('verifyTimingSafeEqual returns false when both args are empty', () => {
    assert.equal(verifyTimingSafeEqual('', ''), false);
});
