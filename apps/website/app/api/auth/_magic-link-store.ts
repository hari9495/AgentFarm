// Shared in-memory magic-link token store.
// Both send-magic-link and verify-magic-link routes import from here so that
// `consumeToken` is NOT exported from a Next.js route file (which would
// violate the constraint that route files only export HTTP method handlers).

type MagicLinkEntry = { email: string; expiresAt: number };

const tokenStore = new Map<string, MagicLinkEntry>();
export const EXPIRY_MS = 15 * 60 * 1000; // 15 minutes

export function storeToken(token: string, email: string): void {
    tokenStore.set(token, { email, expiresAt: Date.now() + EXPIRY_MS });
}

export function consumeToken(token: string): string | null {
    const entry = tokenStore.get(token);
    if (!entry) return null;
    tokenStore.delete(token);
    if (Date.now() > entry.expiresAt) return null;
    return entry.email;
}
