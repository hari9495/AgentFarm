/**
 * SSRF Guard
 *
 * Validates that a URL is safe to use as an outbound webhook callback before
 * `fetch()` is called with user-supplied input.
 *
 * Blocks:
 *   - Non-HTTP(S) schemes (file://, ftp://, etc.)
 *   - RFC-1918 private IPv4 ranges (10/8, 172.16/12, 192.168/16)
 *   - Loopback (127.0.0.0/8, ::1)
 *   - Link-local / cloud metadata (169.254.0.0/16)
 *   - Known metadata service hostnames (AWS/GCP/Azure IMDSv2)
 *   - The IPv4 unspecified address (0.0.0.0)
 *
 * Opt-outs (for trusted internal deployments):
 *   WEBHOOK_CALLBACK_ALLOWLIST — comma-separated exact hostnames that bypass all checks.
 *   SSRF_DNS_CHECK=false       — skip the async DNS resolution step (useful in tests /
 *                                air-gapped environments).
 */

import { lookup } from 'node:dns/promises';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Hostnames that are always blocked regardless of IP resolution. */
const BLOCKED_HOSTNAMES = new Set([
    'localhost',
    '0.0.0.0',
    '169.254.169.254',          // AWS/Azure/GCP instance metadata (HTTP)
    'metadata.google.internal',  // GCP metadata
    'metadata.azure.com',
    'instance-data',             // DigitalOcean metadata
]);

// ---------------------------------------------------------------------------
// IP helpers
// ---------------------------------------------------------------------------

/**
 * Returns true when the IPv4 string falls in a blocked CIDR range.
 * Does NOT throw — returns false for malformed input.
 */
export function isBlockedIpv4(ip: string): boolean {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) return false;
    const [a, b] = parts as [number, number, number, number];
    return (
        a === 0 ||                               // 0.0.0.0/8       unspecified
        a === 10 ||                              // 10.0.0.0/8      private
        a === 127 ||                             // 127.0.0.0/8     loopback
        (a === 172 && b >= 16 && b <= 31) ||     // 172.16.0.0/12   private
        (a === 192 && b === 168) ||              // 192.168.0.0/16  private
        (a === 169 && b === 254)                 // 169.254.0.0/16  link-local / metadata
    );
}

/**
 * Returns true when the IPv6 string is loopback or a private ULA range.
 * Strips brackets (e.g. "[::1]") before comparing.
 */
export function isBlockedIpv6(ip: string): boolean {
    const n = ip.toLowerCase().replace(/^\[|\]$/g, '');
    return (
        n === '::1' ||
        n === '0:0:0:0:0:0:0:1' ||
        n.startsWith('fc') ||   // fc00::/7  ULA private
        n.startsWith('fd')
    );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type SsrfGuardResult =
    | { ok: true }
    | { ok: false; reason: string };

/**
 * Validate that `rawUrl` is safe to use as an outbound webhook callback URL.
 *
 * The optional `dnsLookup` parameter exists for testing — pass a mock to avoid
 * real DNS calls. Defaults to `node:dns/promises`'s `lookup`.
 */
export async function validateCallbackUrl(
    rawUrl: string,
    dnsLookup: (host: string) => Promise<{ address: string; family: number }> = lookup,
): Promise<SsrfGuardResult> {

    // ── 1. Parse ─────────────────────────────────────────────────────────────
    let parsed: URL;
    try {
        parsed = new URL(rawUrl);
    } catch {
        return { ok: false, reason: `Invalid URL: ${rawUrl.slice(0, 100)}` };
    }

    // ── 2. Scheme whitelist ───────────────────────────────────────────────────
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        return { ok: false, reason: `Scheme "${parsed.protocol}" is not permitted; only http/https are allowed` };
    }

    // ── 3. Explicit allowlist (trusted internal domains) ────────────────────
    const allowlist = (process.env['WEBHOOK_CALLBACK_ALLOWLIST'] ?? '')
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
    if (allowlist.includes(parsed.hostname.toLowerCase())) {
        return { ok: true };
    }

    // ── 4. Blocked hostnames ─────────────────────────────────────────────────
    if (BLOCKED_HOSTNAMES.has(parsed.hostname.toLowerCase())) {
        return { ok: false, reason: `Hostname "${parsed.hostname}" is blocked` };
    }

    // ── 5. Direct IPv4 literal ───────────────────────────────────────────────
    if (/^(\d{1,3}\.){3}\d{1,3}$/.test(parsed.hostname)) {
        return isBlockedIpv4(parsed.hostname)
            ? { ok: false, reason: `IP address ${parsed.hostname} is in a private/internal range` }
            : { ok: true };
    }

    // ── 6. Direct IPv6 literal ───────────────────────────────────────────────
    if (parsed.hostname.includes(':') || parsed.hostname.startsWith('[')) {
        return isBlockedIpv6(parsed.hostname)
            ? { ok: false, reason: `IPv6 address ${parsed.hostname} is in a private/internal range` }
            : { ok: true };
    }

    // ── 7. DNS resolution check ───────────────────────────────────────────────
    // Skip when explicitly disabled (e.g. SSRF_DNS_CHECK=false in tests / CI).
    if (process.env['SSRF_DNS_CHECK'] === 'false') {
        return { ok: true };
    }

    try {
        const { address, family } = await dnsLookup(parsed.hostname);
        if (family === 4 && isBlockedIpv4(address)) {
            return { ok: false, reason: `"${parsed.hostname}" resolves to private address ${address}` };
        }
        if (family === 6 && isBlockedIpv6(address)) {
            return { ok: false, reason: `"${parsed.hostname}" resolves to private IPv6 address ${address}` };
        }
    } catch {
        // Fail closed: unresolvable hostname → block (safer than allowing blindly).
        return { ok: false, reason: `Hostname "${parsed.hostname}" could not be resolved` };
    }

    return { ok: true };
}
