/**
 * Feature #6: mTLS certificate verifier for agent federation
 *
 * Validates that an inbound TLS client certificate:
 *   1. Is present (not null/undefined)
 *   2. Has not expired (notAfter > now)
 *   3. Has not started after now (notBefore ≤ now)
 *   4. Matches one of the trusted subject CNs (allowList)
 *
 * In production the real cert parsing would use Node's built-in TLS
 * `getPeerCertificate()` result, which matches the shape of `MtlsCertificate`
 * defined here. Tests use plain objects to avoid native TLS setup.
 */

export interface MtlsCertificate {
    subject: {
        CN: string;
        O?: string;
    };
    issuer: {
        CN: string;
        O?: string;
    };
    /** ISO-8601 string or timestamp string returned by TLSSocket.getPeerCertificate() */
    valid_from: string;
    valid_to: string;
    fingerprint: string;
    serialNumber: string;
}

export type MtlsVerifyResult =
    | { ok: true; cn: string }
    | { ok: false; reason: string };

export interface MtlsVerifierOptions {
    /** Allowed subject CNs — agent service identities. */
    allowList: string[];
    /** Override current time (ms since epoch) for testing. */
    now?: () => number;
}

/**
 * Verifies an mTLS client certificate against the configured allow-list.
 */
export function verifyMtlsCert(
    cert: MtlsCertificate | null | undefined,
    opts: MtlsVerifierOptions,
): MtlsVerifyResult {
    if (!cert) {
        return { ok: false, reason: 'no client certificate presented' };
    }

    const nowMs = opts.now ? opts.now() : Date.now();

    const notBefore = Date.parse(cert.valid_from);
    const notAfter = Date.parse(cert.valid_to);

    if (isNaN(notBefore) || isNaN(notAfter)) {
        return { ok: false, reason: 'certificate has unparseable validity dates' };
    }
    if (nowMs < notBefore) {
        return { ok: false, reason: 'certificate is not yet valid' };
    }
    if (nowMs > notAfter) {
        return { ok: false, reason: 'certificate has expired' };
    }

    const cn = cert.subject?.CN;
    if (!cn) {
        return { ok: false, reason: 'certificate subject CN is missing' };
    }

    if (!opts.allowList.includes(cn)) {
        return { ok: false, reason: `CN "${cn}" is not in the federation allow-list` };
    }

    return { ok: true, cn };
}

/**
 * Factory that creates a verifier bound to a fixed allow-list.
 * Convenient for middleware registration.
 */
export class MtlsVerifier {
    private readonly opts: Required<MtlsVerifierOptions>;

    constructor(opts: MtlsVerifierOptions) {
        this.opts = { now: () => Date.now(), ...opts };
    }

    verify(cert: MtlsCertificate | null | undefined): MtlsVerifyResult {
        return verifyMtlsCert(cert, this.opts);
    }

    isAllowed(cn: string): boolean {
        return this.opts.allowList.includes(cn);
    }

    allowList(): string[] {
        return [...this.opts.allowList];
    }
}
