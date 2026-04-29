import { createHmac, timingSafeEqual } from 'crypto';

type SessionPayload = {
    userId: string;
    tenantId: string;
    workspaceIds: string[];
    scope: 'customer' | 'internal';
    expiresAt: number;
};

export type SessionScope = SessionPayload['scope'];
export type { SessionPayload };

const getSecret = (): string => process.env.API_SESSION_SECRET ?? 'agentfarm-dev-secret';

const toBase64Url = (value: string): string => Buffer.from(value, 'utf8').toString('base64url');
const fromBase64Url = (value: string): string => Buffer.from(value, 'base64url').toString('utf8');

export const buildSessionToken = (
    payload: Omit<SessionPayload, 'expiresAt' | 'scope'> & { scope?: SessionScope },
    ttlMs = 8 * 60 * 60 * 1000,
): string => {
    const session: SessionPayload = {
        ...payload,
        scope: payload.scope ?? 'customer',
        expiresAt: Date.now() + ttlMs,
    };

    const encoded = toBase64Url(JSON.stringify(session));
    const signature = createHmac('sha256', getSecret()).update(`v1.${encoded}`).digest('hex');
    return `v1.${encoded}.${signature}`;
};

export const verifySessionToken = (token: string): SessionPayload | null => {
    if (!token.startsWith('v1.')) {
        return null;
    }

    const parts = token.split('.');
    if (parts.length !== 3) {
        return null;
    }

    const [, encoded, providedSignature] = parts;
    const expectedSignature = createHmac('sha256', getSecret()).update(`v1.${encoded}`).digest('hex');

    const a = Buffer.from(providedSignature, 'hex');
    const b = Buffer.from(expectedSignature, 'hex');
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
        return null;
    }

    try {
        const payload = JSON.parse(fromBase64Url(encoded)) as SessionPayload;
        if (!payload.userId || !payload.tenantId || !Array.isArray(payload.workspaceIds)) {
            return null;
        }
        const scope = payload.scope ?? 'customer';
        if (scope !== 'customer' && scope !== 'internal') {
            return null;
        }
        if (typeof payload.expiresAt !== 'number' || Date.now() > payload.expiresAt) {
            return null;
        }
        return {
            ...payload,
            scope,
        };
    } catch {
        return null;
    }
};
