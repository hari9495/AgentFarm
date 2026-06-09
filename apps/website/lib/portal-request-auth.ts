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

export async function getPortalUserFromRequest(
    _request?: Request,
): Promise<PortalRequestUser | null> {
    let token: string | undefined;

    // Method 1: cookies() from next/headers
    try {
        const cookieStore = await cookies();
        token = cookieStore.get("portal_session")?.value;
    } catch {
        // not available in this context
    }

    // Method 2: request Cookie header fallback (always tried even if Method 1 didn't throw)
    if (!token && _request) {
        const cookieHeader = _request.headers.get("cookie") ?? "";
        const match = cookieHeader
            .split(";")
            .map((p) => p.trim())
            .find((p) => p.startsWith("portal_session="));
        token = match ? decodeURIComponent(match.slice("portal_session=".length)) : undefined;
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

/** Diagnostic helper — returns auth chain info without exposing token values. */
export async function debugPortalAuth(request?: Request): Promise<{
    hasCookiesToken: boolean;
    hasHeaderToken: boolean;
    cookieHeaderNames: string[];
    gatewayUrl: string;
    gatewayStatus: number | "fetch_error" | "no_token";
    gatewayError: string | null;
}> {
    let cookiesToken: string | undefined;
    try {
        const store = await cookies();
        cookiesToken = store.get("portal_session")?.value;
    } catch { /* ignore */ }

    let headerToken: string | undefined;
    let cookieHeaderNames: string[] = [];
    if (request) {
        const cookieHeader = request.headers.get("cookie") ?? "";
        cookieHeaderNames = cookieHeader.split(";").map((p) => p.trim().split("=")[0] ?? "").filter(Boolean);
        const match = cookieHeader.split(";").map((p) => p.trim()).find((p) => p.startsWith("portal_session="));
        headerToken = match ? decodeURIComponent(match.slice("portal_session=".length)) : undefined;
    }

    const token = cookiesToken ?? headerToken;
    if (!token) {
        return { hasCookiesToken: false, hasHeaderToken: false, cookieHeaderNames, gatewayUrl: GATEWAY_URL, gatewayStatus: "no_token", gatewayError: null };
    }

    try {
        const res = await fetch(`${GATEWAY_URL}/portal/auth/me`, {
            headers: { cookie: `portal_session=${token}` },
            cache: "no-store",
        });
        return {
            hasCookiesToken: !!cookiesToken,
            hasHeaderToken: !!headerToken,
            cookieHeaderNames,
            gatewayUrl: GATEWAY_URL,
            gatewayStatus: res.status,
            gatewayError: null,
        };
    } catch (e) {
        return {
            hasCookiesToken: !!cookiesToken,
            hasHeaderToken: !!headerToken,
            cookieHeaderNames,
            gatewayUrl: GATEWAY_URL,
            gatewayStatus: "fetch_error",
            gatewayError: e instanceof Error ? e.message : String(e),
        };
    }
}
