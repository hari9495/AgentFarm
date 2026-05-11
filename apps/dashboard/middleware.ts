import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

type SessionScope = 'customer' | 'internal';

const PUBLIC_PATHS = new Set(['/login', '/onboarding']);

const decodeBase64Url = (value: string): string | null => {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');

    try {
        return atob(padded);
    } catch {
        return null;
    }
};

const getSessionScopeFromToken = (token: string): SessionScope | null => {
    const parts = token.split('.');
    if (parts.length !== 3) {
        return null;
    }

    const payloadRaw = decodeBase64Url(parts[1] ?? '');
    if (!payloadRaw) {
        return null;
    }

    try {
        const payload = JSON.parse(payloadRaw) as { scope?: SessionScope };
        const scope = payload.scope ?? 'customer';
        return scope === 'internal' || scope === 'customer' ? scope : null;
    } catch {
        return null;
    }
};

const isInternalSessionToken = (token: string): boolean => getSessionScopeFromToken(token) === 'internal';

const getWorkspaceIdsFromToken = (token: string): string[] => {
    const parts = token.split('.');
    if (parts.length !== 3) return [];
    const payloadRaw = decodeBase64Url(parts[1] ?? '');
    if (!payloadRaw) return [];
    try {
        const payload = JSON.parse(payloadRaw) as { workspaceIds?: string[] };
        return Array.isArray(payload.workspaceIds) ? payload.workspaceIds : [];
    } catch {
        return [];
    }
};

export function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    if (pathname.startsWith('/api')) {
        return NextResponse.next();
    }

    const rawToken = request.cookies.get('agentfarm_internal_session')?.value;
    const decodedToken = rawToken ? decodeURIComponent(rawToken) : null;
    const hasInternalSession = decodedToken ? isInternalSessionToken(decodedToken) : false;

    // /onboarding: unauthenticated users may pass through; authenticated users with
    // workspaces are redirected to the dashboard (they don't need onboarding again).
    if (pathname === '/onboarding') {
        if (hasInternalSession && decodedToken) {
            const workspaceIds = getWorkspaceIdsFromToken(decodedToken);
            if (workspaceIds.length > 0) {
                return NextResponse.redirect(new URL('/', request.url));
            }
        }
        return NextResponse.next();
    }

    if (PUBLIC_PATHS.has(pathname)) {
        if (pathname === '/login' && hasInternalSession) {
            return NextResponse.redirect(new URL('/', request.url));
        }
        return NextResponse.next();
    }

    if (!hasInternalSession) {
        const loginUrl = new URL('/login', request.url);
        loginUrl.searchParams.set('next', pathname);
        return NextResponse.redirect(loginUrl);
    }

    // Authenticated users with no workspaces are directed to onboarding.
    if (decodedToken) {
        const workspaceIds = getWorkspaceIdsFromToken(decodedToken);
        if (workspaceIds.length === 0) {
            return NextResponse.redirect(new URL('/onboarding', request.url));
        }
    }

    return NextResponse.next();
}

export const config = {
    matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
