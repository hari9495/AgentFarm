import { NextResponse } from "next/server";
import { getPortalUserFromRequest } from "@/lib/portal-request-auth";

export const dynamic = 'force-dynamic';

const GATEWAY_URL = process.env.API_GATEWAY_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

function portalCookie(request: Request): string {
    return request.headers.get("cookie") ?? "";
}

// GET — list tracker poll sources for this tenant.
export async function GET(request: Request) {
    const user = await getPortalUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const res = await fetch(`${GATEWAY_URL}/v1/tracker-poll-sources`, {
            headers: { cookie: portalCookie(request) },
            cache: "no-store",
        });
        const body = await res.json().catch(() => ({ sources: [] }));
        return NextResponse.json(body, { status: res.status });
    } catch {
        return NextResponse.json({ error: "Gateway unavailable" }, { status: 502 });
    }
}

// POST — create a new poll source.
export async function POST(request: Request) {
    const user = await getPortalUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    try {
        const res = await fetch(`${GATEWAY_URL}/v1/tracker-poll-sources`, {
            method: "POST",
            headers: { cookie: portalCookie(request), "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        const resBody = await res.json().catch(() => ({}));
        return NextResponse.json(resBody, { status: res.status });
    } catch {
        return NextResponse.json({ error: "Gateway unavailable" }, { status: 502 });
    }
}
