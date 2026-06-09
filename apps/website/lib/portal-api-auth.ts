/**
 * Portal session auth helper for Next.js API route handlers.
 * Validates the portal_session cookie against the API gateway.
 */

const GATEWAY_URL =
    process.env.API_GATEWAY_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://localhost:3000";

export interface PortalSession {
    accountId: string;
    tenantId: string;
    email: string;
    displayName: string | null;
    role: string;
}

/**
 * Extract the portal_session token from a raw cookie header string.
 */
export function extractPortalTokenFromRequest(request: Request): string | null {
    return extractPortalToken(request.headers.get("cookie"));
}

function extractPortalToken(cookieHeader: string | null): string | null {
    if (!cookieHeader) return null;
    const part = cookieHeader
        .split(";")
        .map((p) => p.trim())
        .find((p) => p.startsWith("portal_session="));
    if (!part) return null;
    return decodeURIComponent(part.slice("portal_session=".length)) || null;
}

/**
 * Validate the portal_session cookie from a Request and return the session.
 * Returns null if the session is missing or invalid.
 */
export async function getPortalSessionFromRequest(request: Request): Promise<PortalSession | null> {
    const token = extractPortalToken(request.headers.get("cookie"));
    if (!token) return null;
    try {
        const res = await fetch(`${GATEWAY_URL}/portal/auth/me`, {
            headers: { cookie: `portal_session=${token}` },
            cache: "no-store",
        });
        if (!res.ok) return null;
        return (await res.json()) as PortalSession;
    } catch {
        return null;
    }
}
