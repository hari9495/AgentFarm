import { cookies } from "next/headers";

const GATEWAY_URL =
    process.env.API_GATEWAY_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    "http://localhost:3000";

export interface PortalRequestUser {
    id: string;
    accountId: string;
    tenantId: string;
    email: string;
    displayName: string | null;
    role: string;
}

/**
 * Validate the portal_session cookie using Next.js cookies() API.
 * Returns the authenticated user or null if unauthenticated / session expired.
 *
 * Uses cookies() from next/headers (same as dashboard layout) instead of
 * request.headers.get("cookie") to avoid any cookie forwarding issues in the
 * Cloudflare Worker runtime.
 */
export async function getPortalUserFromRequest(
    _request?: Request,
): Promise<PortalRequestUser | null> {
    let token: string | undefined;
    try {
        const cookieStore = await cookies();
        token = cookieStore.get("portal_session")?.value;
    } catch {
        // cookies() may throw outside of a request context — fall back to header
        if (_request) {
            const cookieHeader = _request.headers.get("cookie") ?? "";
            const match = cookieHeader
                .split(";")
                .map((p) => p.trim())
                .find((p) => p.startsWith("portal_session="));
            token = match ? decodeURIComponent(match.slice("portal_session=".length)) : undefined;
        }
    }
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
