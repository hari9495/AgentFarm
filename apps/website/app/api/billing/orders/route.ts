import { NextResponse } from "next/server";
import { getPortalSessionFromRequest } from "@/lib/portal-api-auth";

function extractPortalToken(cookieHeader: string | null): string | null {
    if (!cookieHeader) return null;
    const part = cookieHeader
        .split(";")
        .map((p) => p.trim())
        .find((p) => p.startsWith("portal_session="));
    if (!part) return null;
    return decodeURIComponent(part.slice("portal_session=".length)) || null;
}

const GATEWAY_URL =
    process.env.API_GATEWAY_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://localhost:3000";

export async function GET(request: Request) {
    const session = await getPortalSessionFromRequest(request);
    if (!session) {
        return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    // Try to fetch orders from portal billing endpoint
    try {
        const token = extractPortalToken(request.headers.get("cookie"));
        const res = await fetch(`${GATEWAY_URL}/portal/data/billing/orders`, {
            headers: { cookie: `portal_session=${token ?? ""}` },
            cache: "no-store",
        });
        if (res.ok) {
            const data = (await res.json()) as unknown;
            return NextResponse.json(data);
        }
    } catch {
        // fall through
    }

    // Return empty orders list for new accounts
    return NextResponse.json({ status: "ok", orders: [] });
}
