import { cookies } from 'next/headers';

export type SessionScope = 'customer' | 'internal';

type SessionPayload = {
    scope?: SessionScope;
};

const decodePayload = (token: string): SessionPayload | null => {
    const parts = token.split('.');
    if (parts.length !== 3) {
        return null;
    }

    try {
        const payload = JSON.parse(Buffer.from(parts[1] ?? '', 'base64url').toString('utf8')) as SessionPayload;
        return payload;
    } catch {
        return null;
    }
};

export const getSessionScopeFromToken = (token: string): SessionScope | null => {
    const payload = decodePayload(token);
    const scope = payload?.scope ?? 'customer';
    return scope === 'customer' || scope === 'internal' ? scope : null;
};

export const isInternalSessionToken = (token: string): boolean => getSessionScopeFromToken(token) === 'internal';

export const getInternalSessionAuthHeader = async (): Promise<string | null> => {
    const cookieStore = await cookies();
    const session = cookieStore.get('agentfarm_internal_session');
    if (!session?.value) {
        return null;
    }

    const token = decodeURIComponent(session.value);
    if (!isInternalSessionToken(token)) {
        return null;
    }

    return `Bearer ${token}`;
};
