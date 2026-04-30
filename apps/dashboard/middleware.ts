import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

type SessionScope = 'customer' | 'internal';

const PUBLIC_PATHS = new Set(['/login']);

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

export function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    if (pathname.startsWith('/api')) {
        return NextResponse.next();
    }

    const token = request.cookies.get('agentfarm_internal_session')?.value;
    const hasInternalSession = token ? isInternalSessionToken(decodeURIComponent(token)) : false;

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

    return NextResponse.next();
}

export const config = {
    matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
