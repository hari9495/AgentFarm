export const INTERNAL_DOMAIN = 'agentfarms.in';

const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes
const RESEND_COOLDOWN_MS = 60 * 1000; // 60 seconds
const MAX_ATTEMPTS = 5;

type OtpEntry = {
    code: string;
    expiresAt: number;
    sentAt: number;
    attempts: number;
};

// Survive Next.js hot-reload in dev by attaching to globalThis
const g = globalThis as typeof globalThis & { __otpStore?: Map<string, OtpEntry> };
if (!g.__otpStore) g.__otpStore = new Map<string, OtpEntry>();
const store = g.__otpStore;

function purgeExpired() {
    const now = Date.now();
    for (const [key, entry] of store) {
        if (entry.expiresAt < now) store.delete(key);
    }
}

export function generateOtp(email: string): { code: string } | { cooldown: number } {
    purgeExpired();
    const key = email.toLowerCase();
    const now = Date.now();
    const existing = store.get(key);
    if (existing && now - existing.sentAt < RESEND_COOLDOWN_MS) {
        return { cooldown: Math.ceil((RESEND_COOLDOWN_MS - (now - existing.sentAt)) / 1000) };
    }
    // Cryptographically adequate for a 6-digit OTP
    const code = String(Math.floor(100000 + Math.random() * 900000));
    store.set(key, { code, expiresAt: now + OTP_TTL_MS, sentAt: now, attempts: 0 });
    return { code };
}

export type OtpResult = 'valid' | 'invalid' | 'expired' | 'too_many_attempts';

export function verifyOtp(email: string, code: string): OtpResult {
    purgeExpired();
    const key = email.toLowerCase();
    const entry = store.get(key);
    if (!entry) return 'invalid';
    if (Date.now() > entry.expiresAt) {
        store.delete(key);
        return 'expired';
    }
    if (entry.attempts >= MAX_ATTEMPTS) {
        store.delete(key);
        return 'too_many_attempts';
    }
    entry.attempts++;
    if (entry.code !== code) return 'invalid';
    store.delete(key); // one-time use
    return 'valid';
}
