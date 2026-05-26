/**
 * request-context.ts — session and auth token extraction helpers.
 *
 * Extracted from main.ts so every route/hook can share the same implementation
 * rather than duplicating inline functions or accepting `getSession` callbacks.
 */

import { timingSafeEqual } from 'node:crypto';
import { verifySessionToken, type SessionPayload } from './lib/session-auth.js';
import { validateApiKey } from './lib/api-key-auth.js';
import { prisma } from './lib/db.js';

type RequestLike = { headers: Record<string, unknown> };

// ---------------------------------------------------------------------------
// Session extraction
// ---------------------------------------------------------------------------

const readSessionToken = (request: RequestLike): string | null => {
    const authHeader = request.headers.authorization;
    if (typeof authHeader === 'string' && authHeader.toLowerCase().startsWith('bearer ')) {
        return authHeader.slice(7).trim();
    }

    const rawCookie = request.headers.cookie;
    if (typeof rawCookie !== 'string') return null;

    const cookieItem = rawCookie
        .split(';')
        .map((v) => v.trim())
        .find((v) => v.startsWith('agentfarm_session='));

    return cookieItem ? decodeURIComponent(cookieItem.slice('agentfarm_session='.length)) : null;
};

/**
 * Reads the session from a request — checks the `_injectedSession` property
 * first (set by the API key preHandler), then falls back to the JWT cookie/bearer.
 */
export const readSession = (request: RequestLike): SessionPayload | null => {
    const injected = (request as Record<string, unknown>)._injectedSession as SessionPayload | undefined;
    if (injected) return injected;

    const token = readSessionToken(request);
    return token ? verifySessionToken(token) : null;
};

/**
 * Validates a `Bearer af_<key>` header and returns a synthetic SessionPayload
 * that can be injected onto the request. Returns null if the key is invalid.
 */
export const resolveApiKeySession = async (
    authHeader: string | undefined,
): Promise<SessionPayload | null> => {
    if (typeof authHeader !== 'string' || !authHeader.startsWith('Bearer af_')) return null;

    const rawKey = authHeader.slice(7);
    const keyData = await validateApiKey(rawKey, prisma);
    if (!keyData) return null;

    return {
        userId: keyData.apiKeyId,
        tenantId: keyData.tenantId,
        workspaceIds: [],
        scope: 'customer',
        role: keyData.role,
        expiresAt: Date.now() + 60_000,
    };
};

// ---------------------------------------------------------------------------
// Ops monitoring token
// ---------------------------------------------------------------------------

/**
 * Constant-time comparison for the internal ops monitoring token.
 * Prevents timing-based secret leakage.
 */
export const verifyOpsToken = (request: RequestLike): boolean => {
    const configuredToken = process.env.OPS_MONITORING_TOKEN;
    if (!configuredToken) return false;

    const headerToken = request.headers['x-ops-token'];
    if (typeof headerToken !== 'string') return false;

    try {
        const a = Buffer.from(headerToken, 'utf8');
        const b = Buffer.from(configuredToken, 'utf8');
        return a.length === b.length && timingSafeEqual(a, b);
    } catch {
        return false;
    }
};
