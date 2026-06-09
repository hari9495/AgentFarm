import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export const dynamic = 'force-dynamic';

const GATEWAY_URL =
    process.env.API_GATEWAY_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    "http://localhost:3000";

export async function GET(request: Request) {
    // Method 1: cookies() from next/headers (same as layout.tsx)
    let cookiesToken: string | undefined;
    let cookiesError: string | null = null;
    try {
        const store = await cookies();
        cookiesToken = store.get("portal_session")?.value;
    } catch (e) {
        cookiesError = e instanceof Error ? e.message : String(e);
    }

    // Method 2: raw request header
    const cookieHeader = request.headers.get("cookie") ?? "";
    const match = cookieHeader
        .split(";")
        .map((p) => p.trim())
        .find((p) => p.startsWith("portal_session="));
    const headerToken = match ? decodeURIComponent(match.slice("portal_session=".length)) : undefined;

    const token = cookiesToken ?? headerToken;

    if (!token) {
        return NextResponse.json({
            status: "no_portal_session_cookie",
            cookiesToken: cookiesToken ?? null,
            cookiesError,
            headerToken: headerToken ?? null,
            cookieNames: cookieHeader.split(";").map((c) => c.trim().split("=")[0]).filter(Boolean),
            gatewayUrl: GATEWAY_URL,
        });
    }

    try {
        const res = await fetch(`${GATEWAY_URL}/portal/auth/me`, {
            headers: { cookie: `portal_session=${token}` },
            cache: "no-store",
        });
        const body = await res.json().catch(() => ({}));
        return NextResponse.json({
            status: res.ok ? "ok" : "gateway_error",
            httpStatus: res.status,
            body,
            gatewayUrl: GATEWAY_URL,
            tokenSource: cookiesToken ? "cookies()" : "header",
            tokenLength: token.length,
        });
    } catch (err) {
        return NextResponse.json({
            status: "fetch_failed",
            error: err instanceof Error ? err.message : String(err),
            gatewayUrl: GATEWAY_URL,
            tokenSource: cookiesToken ? "cookies()" : "header",
        });
    }
}
