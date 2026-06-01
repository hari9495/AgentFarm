/**
 * In-memory magic link token store.
 * Uses globalThis to survive Next.js hot-reload in development.
 * Tokens are single-use and expire after 15 minutes.
 */

const TTL_MS = 15 * 60 * 1000; // 15 minutes

type MagicLinkEntry = {
    email: string;
    expiresAt: number;
    used: boolean;
};

declare global {
    // eslint-disable-next-line no-var
    var __magicLinkStore: Map<string, MagicLinkEntry> | undefined;
}

const getStore = (): Map<string, MagicLinkEntry> => {
    if (!globalThis.__magicLinkStore) {
        globalThis.__magicLinkStore = new Map();
    }
    return globalThis.__magicLinkStore;
};

const purgeExpired = (store: Map<string, MagicLinkEntry>): void => {
    const now = Date.now();
    for (const [k, v] of store) {
        if (v.expiresAt < now) store.delete(k);
    }
};

/** Generate a cryptographically random magic link token for the given email. */
export const generateMagicToken = (email: string): string => {
    const store = getStore();
    purgeExpired(store);

    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const token = Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');

    store.set(token, { email, expiresAt: Date.now() + TTL_MS, used: false });
    return token;
};

export type MagicTokenResult = { email: string } | { error: 'not_found' | 'expired' | 'used' };

/**
 * Consume (verify + invalidate) a magic link token.
 * Tokens can only be consumed once — replay returns `used`.
 */
export const consumeMagicToken = (token: string): MagicTokenResult => {
    const store = getStore();
    purgeExpired(store);

    const entry = store.get(token);
    if (!entry) return { error: 'not_found' };
    if (entry.used) return { error: 'used' };
    if (entry.expiresAt < Date.now()) {
        store.delete(token);
        return { error: 'expired' };
    }

    entry.used = true;
    return { email: entry.email };
};
