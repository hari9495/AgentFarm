/**
 * OTP store.
 * Uses Redis (TTL-backed) when REDIS_URL is set — codes survive restarts.
 * Falls back to a globalThis Map for local dev without Redis.
 */

import { getRedisClient } from '@agentfarm/redis-client';

/** Primary display domain (used in UI messages). */
export const INTERNAL_DOMAIN = process.env.DASHBOARD_PRIMARY_DOMAIN || 'agentfarms.in';

/** All domains allowed to request OTP / magic-link. Read fresh each call so env changes take effect. */
export function isAllowedEmail(email: string): boolean {
    const raw = process.env.DASHBOARD_ALLOWED_DOMAINS || INTERNAL_DOMAIN;
    const allowed = raw
        .split(',')
        .map((d) => d.trim().toLowerCase())
        .filter(Boolean);
    const lower = email.toLowerCase();
    return allowed.some((d) => lower.endsWith(`@${d}`));
}

const OTP_TTL_SEC = 5 * 60;          // 5 minutes
const RESEND_COOLDOWN_MS = 60 * 1000; // 60 seconds
const MAX_ATTEMPTS = 5;
const KEY = (email: string) => `otp:${email.toLowerCase()}`;

type OtpEntry = { code: string; expiresAt: number; sentAt: number; attempts: number };

// ── In-memory fallback (local dev only) ──────────────────────────────────────

const g = globalThis as typeof globalThis & { __otpStore?: Map<string, OtpEntry> };
if (!g.__otpStore) g.__otpStore = new Map<string, OtpEntry>();
const memStore = g.__otpStore;

function purgeMemStore() {
    const now = Date.now();
    for (const [k, v] of memStore) if (v.expiresAt < now) memStore.delete(k);
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function generateOtp(email: string): Promise<{ code: string } | { cooldown: number }> {
    const now = Date.now();
    const redis = getRedisClient();

    if (redis) {
        const raw = await redis.get(KEY(email));
        if (raw) {
            const existing: OtpEntry = JSON.parse(raw);
            if (now - existing.sentAt < RESEND_COOLDOWN_MS) {
                return { cooldown: Math.ceil((RESEND_COOLDOWN_MS - (now - existing.sentAt)) / 1000) };
            }
        }
        const code = String(Math.floor(100000 + Math.random() * 900000));
        const entry: OtpEntry = { code, expiresAt: now + OTP_TTL_SEC * 1000, sentAt: now, attempts: 0 };
        await redis.set(KEY(email), JSON.stringify(entry), 'EX', OTP_TTL_SEC);
        return { code };
    }

    purgeMemStore();
    const existing = memStore.get(email.toLowerCase());
    if (existing && now - existing.sentAt < RESEND_COOLDOWN_MS) {
        return { cooldown: Math.ceil((RESEND_COOLDOWN_MS - (now - existing.sentAt)) / 1000) };
    }
    const code = String(Math.floor(100000 + Math.random() * 900000));
    memStore.set(email.toLowerCase(), { code, expiresAt: now + OTP_TTL_SEC * 1000, sentAt: now, attempts: 0 });
    return { code };
}

export type OtpResult = 'valid' | 'invalid' | 'expired' | 'too_many_attempts';

export async function verifyOtp(email: string, code: string): Promise<OtpResult> {
    const redis = getRedisClient();

    if (redis) {
        const raw = await redis.get(KEY(email));
        if (!raw) return 'invalid';
        const entry: OtpEntry = JSON.parse(raw);
        if (Date.now() > entry.expiresAt) { await redis.del(KEY(email)); return 'expired'; }
        if (entry.attempts >= MAX_ATTEMPTS) { await redis.del(KEY(email)); return 'too_many_attempts'; }
        entry.attempts++;
        if (entry.code !== code) {
            await redis.set(KEY(email), JSON.stringify(entry), 'KEEPTTL');
            return 'invalid';
        }
        await redis.del(KEY(email));
        return 'valid';
    }

    purgeMemStore();
    const entry = memStore.get(email.toLowerCase());
    if (!entry) return 'invalid';
    if (Date.now() > entry.expiresAt) { memStore.delete(email.toLowerCase()); return 'expired'; }
    if (entry.attempts >= MAX_ATTEMPTS) { memStore.delete(email.toLowerCase()); return 'too_many_attempts'; }
    entry.attempts++;
    if (entry.code !== code) return 'invalid';
    memStore.delete(email.toLowerCase());
    return 'valid';
}
