import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Verifies an HMAC-SHA-256 signature in constant time.
 *
 * @param payload   Raw request body (string or Buffer).
 * @param secret    Shared secret used to generate the expected signature.
 * @param signature Received signature to compare against.
 * @param algorithm Output encoding of the HMAC digest ('hex' or 'base64').
 */
export function verifyHmacSha256(
    payload: string | Buffer,
    secret: string,
    signature: string,
    algorithm: 'hex' | 'base64' = 'hex',
): boolean {
    if (!secret || !signature) return false;
    const expected = createHmac('sha256', secret)
        .update(typeof payload === 'string' ? payload : payload)
        .digest(algorithm);
    const expectedBuf = Buffer.from(expected, 'utf8');
    const actualBuf = Buffer.from(signature, 'utf8');
    if (expectedBuf.length !== actualBuf.length) return false;
    return timingSafeEqual(expectedBuf, actualBuf);
}

/**
 * Constant-time string equality check.
 * Returns false if either argument is empty to prevent vacuous matches.
 */
export function verifyTimingSafeEqual(a: string, b: string): boolean {
    if (!a || !b) return false;
    const aBuf = Buffer.from(a, 'utf8');
    const bBuf = Buffer.from(b, 'utf8');
    if (aBuf.length !== bBuf.length) return false;
    return timingSafeEqual(aBuf, bBuf);
}
