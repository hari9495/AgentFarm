import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateCallbackUrl, isBlockedIpv4, isBlockedIpv6 } from './ssrf-guard.js';

// ---------------------------------------------------------------------------
// Unit tests for IP helpers
// ---------------------------------------------------------------------------

describe('isBlockedIpv4', () => {
    it('blocks 10.x.x.x (RFC-1918)', () => {
        assert.equal(isBlockedIpv4('10.0.0.1'), true);
        assert.equal(isBlockedIpv4('10.255.255.255'), true);
    });
    it('blocks 172.16–31.x.x (RFC-1918)', () => {
        assert.equal(isBlockedIpv4('172.16.0.1'), true);
        assert.equal(isBlockedIpv4('172.31.255.255'), true);
        assert.equal(isBlockedIpv4('172.15.0.1'), false); // just outside range
        assert.equal(isBlockedIpv4('172.32.0.1'), false);
    });
    it('blocks 192.168.x.x (RFC-1918)', () => {
        assert.equal(isBlockedIpv4('192.168.1.1'), true);
    });
    it('blocks 127.x.x.x (loopback)', () => {
        assert.equal(isBlockedIpv4('127.0.0.1'), true);
        assert.equal(isBlockedIpv4('127.255.255.255'), true);
    });
    it('blocks 169.254.x.x (link-local / metadata)', () => {
        assert.equal(isBlockedIpv4('169.254.169.254'), true);
        assert.equal(isBlockedIpv4('169.254.0.1'), true);
    });
    it('blocks 0.0.0.0 (unspecified)', () => {
        assert.equal(isBlockedIpv4('0.0.0.0'), true);
    });
    it('allows public IPs', () => {
        assert.equal(isBlockedIpv4('8.8.8.8'), false);
        assert.equal(isBlockedIpv4('93.184.216.34'), false);
        assert.equal(isBlockedIpv4('1.1.1.1'), false);
    });
    it('returns false for malformed input (does not throw)', () => {
        assert.equal(isBlockedIpv4('not-an-ip'), false);
        assert.equal(isBlockedIpv4(''), false);
        assert.equal(isBlockedIpv4('999.0.0.1'), false);
    });
});

describe('isBlockedIpv6', () => {
    it('blocks loopback ::1', () => {
        assert.equal(isBlockedIpv6('::1'), true);
        assert.equal(isBlockedIpv6('[::1]'), true);
    });
    it('blocks ULA fc::/7', () => {
        assert.equal(isBlockedIpv6('fc00::1'), true);
        assert.equal(isBlockedIpv6('fd12:3456::1'), true);
    });
    it('allows public IPv6', () => {
        assert.equal(isBlockedIpv6('2001:4860:4860::8888'), false);
    });
});

// ---------------------------------------------------------------------------
// validateCallbackUrl — uses mock DNS resolver (no real network calls)
// ---------------------------------------------------------------------------

// Mock DNS resolver that returns a configurable IP
const mockDns = (ip: string, family: 4 | 6 = 4) =>
    async (_host: string) => ({ address: ip, family });

const mockDnsFail = async (_host: string): Promise<never> => {
    throw new Error('ENOTFOUND');
};

describe('validateCallbackUrl', () => {
    describe('scheme validation', () => {
        it('allows https://', async () => {
            const r = await validateCallbackUrl('https://example.com/cb', mockDns('93.184.216.34'));
            assert.equal(r.ok, true);
        });
        it('allows http://', async () => {
            const r = await validateCallbackUrl('http://example.com/cb', mockDns('93.184.216.34'));
            assert.equal(r.ok, true);
        });
        it('blocks file://', async () => {
            const r = await validateCallbackUrl('file:///etc/passwd');
            assert.equal(r.ok, false);
            assert.match(r.ok ? '' : r.reason, /scheme/i);
        });
        it('blocks ftp://', async () => {
            const r = await validateCallbackUrl('ftp://example.com/');
            assert.equal(r.ok, false);
        });
        it('rejects malformed URLs', async () => {
            const r = await validateCallbackUrl('not a url');
            assert.equal(r.ok, false);
        });
    });

    describe('blocked hostnames', () => {
        it('blocks localhost', async () => {
            const r = await validateCallbackUrl('http://localhost/cb');
            assert.equal(r.ok, false);
        });
        it('blocks 169.254.169.254 (metadata hostname)', async () => {
            const r = await validateCallbackUrl('http://169.254.169.254/latest/meta-data');
            assert.equal(r.ok, false);
        });
        it('blocks metadata.google.internal', async () => {
            const r = await validateCallbackUrl('http://metadata.google.internal/');
            assert.equal(r.ok, false);
        });
    });

    describe('direct IP literals', () => {
        it('blocks 10.0.0.1 directly in URL', async () => {
            const r = await validateCallbackUrl('http://10.0.0.1/callback');
            assert.equal(r.ok, false);
        });
        it('blocks 192.168.1.1', async () => {
            const r = await validateCallbackUrl('https://192.168.1.1/webhook');
            assert.equal(r.ok, false);
        });
        it('blocks 127.0.0.1', async () => {
            const r = await validateCallbackUrl('http://127.0.0.1:8080/');
            assert.equal(r.ok, false);
        });
        it('allows a public IP', async () => {
            const r = await validateCallbackUrl('https://8.8.8.8/');
            assert.equal(r.ok, true);
        });
    });

    describe('DNS resolution check', () => {
        it('blocks URL whose hostname resolves to private IP', async () => {
            const r = await validateCallbackUrl('https://internal.corp', mockDns('10.0.0.5'));
            assert.equal(r.ok, false);
            assert.match(r.ok ? '' : r.reason, /private/i);
        });
        it('blocks URL whose hostname resolves to loopback', async () => {
            const r = await validateCallbackUrl('https://sneaky.example.com', mockDns('127.0.0.1'));
            assert.equal(r.ok, false);
        });
        it('blocks URL whose hostname resolves to metadata range', async () => {
            const r = await validateCallbackUrl('https://evil.example.com', mockDns('169.254.169.254'));
            assert.equal(r.ok, false);
        });
        it('allows URL resolving to public IP', async () => {
            const r = await validateCallbackUrl('https://example.com', mockDns('93.184.216.34'));
            assert.equal(r.ok, true);
        });
        it('blocks URL when DNS lookup fails (fail closed)', async () => {
            const r = await validateCallbackUrl('https://nonexistent.invalid', mockDnsFail);
            assert.equal(r.ok, false);
            assert.match(r.ok ? '' : r.reason, /could not be resolved/i);
        });
    });

    describe('allowlist bypass', () => {
        it('allows explicitly allowlisted hostname even if it looks internal', async () => {
            const original = process.env['WEBHOOK_CALLBACK_ALLOWLIST'];
            process.env['WEBHOOK_CALLBACK_ALLOWLIST'] = 'internal.trusted.corp';
            const r = await validateCallbackUrl('https://internal.trusted.corp/cb', mockDns('10.0.0.1'));
            process.env['WEBHOOK_CALLBACK_ALLOWLIST'] = original ?? '';
            assert.equal(r.ok, true);
        });
    });
});
