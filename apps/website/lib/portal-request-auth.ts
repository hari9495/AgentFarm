/**
 * Request-scoped portal auth helper for Next.js API route handlers.
 *
 * All customer-facing API routes (app/api/**) receive the request object and
 * need to verify the portal_session cookie against the API gateway. Use
 * getPortalUserFromRequest() as a drop-in replacement for the old
 * getSessionUser(token) + agentfarm_session pattern.
 */

const GATEWAY_URL =
    process.env.API_GATEWAY_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    "http://localhost:3000";

export interface PortalRequestUser {
    /** Same as accountId — kept for compatibility with old auth-store usage */
    id: string;
    accountId: string;
    tenantId: string;
    email: string;
    displayName: string | null;
    role: string;
}

function getPortalToken(request: Request): string | null {
    const cookieHeader = request.headers.get("cookie");
    if (!cookieHeader) return null;
    const match = cookieHeader
        .split(";")
        .map((p) => p.trim())
        .find((p) => p.startsWith("portal_session="));
    if (!match) return null;
    return decodeURIComponent(match.slice("portal_session=".length));
}

/**
 * Validate the portal_session cookie in the incoming request.
 * Returns the authenticated user or null if unauthenticated / session expired.
 */
export async function getPortalUserFromRequest(
    request: Request,
): Promise<PortalRequestUser | null> {
    const token = getPortalToken(request);
    if (!token) return null;
    try {
        const res = await fetch(`${GATEWAY_URL}/portal/auth/me`, {
            headers: { cookie: `portal_session=${token}` },
            cache: "no-store",
        });
        if (!res.ok) return null;
        const data = (await res.json()) as {
            accountId: string;
            tenantId: string;
            email: string;
            displayName: string | null;
            role: string;
        };
        return { id: data.accountId, ...data };
    } catch {
        return null;
    }
}
