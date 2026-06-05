/**
 * Magic link token store.
 * Uses Redis (TTL-backed) when REDIS_URL is set — tokens survive restarts.
 * Falls back to a globalThis Map for local dev without Redis.
 * Tokens are single-use and expire after 15 minutes.
 */

import { getRedisClient } from '@agentfarm/redis-client';

const TTL_SEC = 15 * 60;
const KEY = (token: string) => `ml:${token}`;

type MagicLinkEntry = { email: string; used: boolean };

// ── In-memory fallback (local dev only) ──────────────────────────────────────

declare global {
    // eslint-disable-next-line no-var
    var __magicLinkStore: Map<string, MagicLinkEntry & { expiresAt: number }> | undefined;
}

const getMemStore = () => {
    if (!globalThis.__magicLinkStore) globalThis.__magicLinkStore = new Map();
    return globalThis.__magicLinkStore;
};

const purgeMemStore = () => {
    const now = Date.now();
    for (const [k, v] of getMemStore()) if (v.expiresAt < now) getMemStore().delete(k);
};

// ── Public API ────────────────────────────────────────────────────────────────

export const generateMagicToken = async (email: string): Promise<string> => {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const token = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');

    const redis = getRedisClient();
    if (redis) {
        await redis.set(KEY(token), JSON.stringify({ email, used: false }), 'EX', TTL_SEC);
    } else {
        purgeMemStore();
        getMemStore().set(token, { email, used: false, expiresAt: Date.now() + TTL_SEC * 1000 });
    }

    return token;
};

export type MagicTokenResult = { email: string } | { error: 'not_found' | 'expired' | 'used' };

export const consumeMagicToken = async (token: string): Promise<MagicTokenResult> => {
    const redis = getRedisClient();

    if (redis) {
        const raw = await redis.get(KEY(token));
        if (!raw) return { error: 'not_found' };
        const entry: MagicLinkEntry = JSON.parse(raw);
        if (entry.used) return { error: 'used' };
        await redis.set(KEY(token), JSON.stringify({ ...entry, used: true }), 'KEEPTTL');
        return { email: entry.email };
    }

    purgeMemStore();
    const store = getMemStore();
    const entry = store.get(token);
    if (!entry) return { error: 'not_found' };
    if (entry.used) return { error: 'used' };
    if (entry.expiresAt < Date.now()) { store.delete(token); return { error: 'expired' }; }
    entry.used = true;
    return { email: entry.email };
};
