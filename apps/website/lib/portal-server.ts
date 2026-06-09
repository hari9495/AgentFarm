/**
 * Server-side portal auth helpers for Next.js server components and page handlers.
 * Use getPortalUser() in any dashboard page that needs the current user's identity.
 */
import { cookies } from "next/headers";

const GATEWAY_URL =
    process.env.API_GATEWAY_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://localhost:3000";

export interface PortalUser {
    accountId: string;
    tenantId: string;
    email: string;
    displayName: string | null;
    role: string;
}

/**
 * Read the current portal_session cookie and validate it against the API gateway.
 * Returns null if there is no session or it is invalid.
 */
export async function getPortalUser(): Promise<PortalUser | null> {
    const cookieStore = await cookies();
    const token = cookieStore.get("portal_session")?.value;
    if (!token) return null;
    try {
        const res = await fetch(`${GATEWAY_URL}/portal/auth/me`, {
            headers: { cookie: `portal_session=${token}` },
            cache: "no-store",
        });
        if (!res.ok) return null;
        return (await res.json()) as PortalUser;
    } catch {
        return null;
    }
}

/** Return the raw portal_session token (for use in downstream fetch calls). */
export async function getPortalToken(): Promise<string | null> {
    const cookieStore = await cookies();
    return cookieStore.get("portal_session")?.value ?? null;
}

/** Fetch a portal data endpoint, forwarding the session cookie. Returns null on error. */
export async function portalFetch<T>(path: string): Promise<T | null> {
    const token = await getPortalToken();
    if (!token) return null;
    try {
        const res = await fetch(`${GATEWAY_URL}${path}`, {
            headers: { cookie: `portal_session=${token}` },
            cache: "no-store",
        });
        if (!res.ok) return null;
        return (await res.json()) as T;
    } catch {
        return null;
    }
}
