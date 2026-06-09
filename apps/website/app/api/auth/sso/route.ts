import { NextResponse } from "next/server";

const GATEWAY_URL =
    process.env.API_GATEWAY_URL ??
    process.env.NEXT_PUBLIC_API_URL ||
    "http://localhost:3000";

/**
 * GET /api/auth/sso?tenantId=...
 *
 * Proxy for the gateway SAML SP-initiated login.
 * - If SSO is configured → follows the 302 redirect to the IdP
 * - If SSO is not configured → redirects back to /login?error=sso_not_configured
 * - Any other error → redirects back to /login?error=sso_error
 */
export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get("tenantId");

    if (!tenantId) {
        return NextResponse.redirect(new URL("/login?error=sso_no_tenant", request.url));
    }

    try {
        const res = await fetch(`${GATEWAY_URL}/v1/auth/sso/${encodeURIComponent(tenantId)}/login`, {
            redirect: "manual", // Don't auto-follow — we handle it ourselves
            cache: "no-store",
        });

        // SSO configured → gateway returns 302 redirect to the IdP
        if (res.status === 302 || res.status === 301) {
            const location = res.headers.get("location");
            if (location) {
                return NextResponse.redirect(location, { status: 302 });
            }
        }

        // SSO not configured or disabled
        if (res.status === 404) {
            return NextResponse.redirect(new URL("/login?error=sso_not_configured", request.url));
        }

        // Any other failure
        return NextResponse.redirect(new URL("/login?error=sso_error", request.url));
    } catch {
        return NextResponse.redirect(new URL("/login?error=sso_error", request.url));
    }
}
