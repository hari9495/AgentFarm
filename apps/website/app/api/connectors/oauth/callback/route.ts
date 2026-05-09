import { NextResponse } from "next/server";

const API_GATEWAY_URL =
    process.env.API_GATEWAY_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://localhost:3000";

// ── GET /api/connectors/oauth/callback ──────────────────────────────────────
// Transparent proxy for the OAuth provider redirect.
// The OAuth provider redirects here (website domain); we forward all query
// params to the api-gateway which owns the OAuth state machine.
export async function GET(request: Request) {
    const incomingUrl = new URL(request.url);
    const qs = incomingUrl.searchParams.toString();

    try {
        const res = await fetch(
            `${API_GATEWAY_URL}/auth/connectors/callback${qs ? `?${qs}` : ""}`,
            { method: "GET", redirect: "manual" }
        );

        // If the gateway sends a redirect, forward it to the customer
        if (res.status === 301 || res.status === 302) {
            const location = res.headers.get("Location");
            if (location) {
                return NextResponse.redirect(location);
            }
        }

        // Gateway returned success JSON
        if (res.ok) {
            return NextResponse.redirect(new URL("/connectors?connected=true", incomingUrl.origin));
        }

        // Gateway returned an error response
        return NextResponse.redirect(new URL("/connectors?error=oauth_failed", incomingUrl.origin));
    } catch {
        return NextResponse.redirect(new URL("/connectors?error=oauth_failed", incomingUrl.origin));
    }
}
