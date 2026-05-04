/**
 * Feature #6: PII Strip middleware for agent federation
 *
 * Strips personally-identifiable information from request/response payloads
 * before they are forwarded across trust boundaries (connector-gateway ↔ agent federation).
 *
 * Scrubbed field names (case-insensitive, applied recursively):
 *   email, password, token, secret, apiKey, api_key, phone, phoneNumber,
 *   ssn, nationalId, creditCard, cardNumber, cvv, dob, dateOfBirth,
 *   ipAddress, ip_address, address, postalCode, zipCode
 *
 * Values are replaced with the sentinel "[REDACTED]".
 * Arrays are walked element-by-element; non-object leaf values are passed through.
 */

const PII_FIELDS = new Set([
    'email',
    'password',
    'token',
    'secret',
    'apikey',
    'api_key',
    'phone',
    'phonenumber',
    'ssn',
    'nationalid',
    'creditcard',
    'cardnumber',
    'cvv',
    'dob',
    'dateofbirth',
    'ipaddress',
    'ip_address',
    'address',
    'postalcode',
    'zipcode',
]);

const REDACTED = '[REDACTED]';

export type PiiSafePayload = Record<string, unknown>;

/**
 * Recursively strips PII fields from a plain-object payload.
 * Returns a new deep copy — the original is never mutated.
 */
export function stripPii(input: unknown): unknown {
    if (Array.isArray(input)) {
        return input.map(stripPii);
    }
    if (input !== null && typeof input === 'object') {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
            if (PII_FIELDS.has(k.toLowerCase())) {
                out[k] = REDACTED;
            } else {
                out[k] = stripPii(v);
            }
        }
        return out;
    }
    return input;
}

/**
 * Returns true if the payload contains at least one PII field at any depth.
 * Useful for audit logging: "payload contained PII — stripped before forwarding".
 */
export function containsPii(input: unknown): boolean {
    if (Array.isArray(input)) {
        return input.some(containsPii);
    }
    if (input !== null && typeof input === 'object') {
        for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
            if (PII_FIELDS.has(k.toLowerCase())) return true;
            if (containsPii(v)) return true;
        }
    }
    return false;
}

export { REDACTED, PII_FIELDS };
