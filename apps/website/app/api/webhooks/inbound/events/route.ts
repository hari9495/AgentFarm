import { NextResponse } from "next/server";
import { getPortalUserFromRequest } from "@/lib/portal-request-auth";
import type { NextRequest } from "next/server";

export const dynamic = 'force-dynamic';


const GATEWAY_URL = process.env.API_GATEWAY_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

// GET /api/webhooks/inbound/events — list recent inbound events
export async function GET(request: NextRequest) {
    const user = await getPortalUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const upstream = new URL(`${GATEWAY_URL}/v1/webhooks/inbound/events`);
    upstream.searchParams.set("tenantId", user.tenantId);
    if (user.tenantId) upstream.searchParams.set("workspaceId", user.tenantId);
    for (const key of ["source", "limit", "cursor"]) {
        const val = searchParams.get(key);
        if (val) upstream.searchParams.set(key, val);
    }

    try {
        const res = await fetch(upstream.toString(), {
            headers: { cookie: request.headers.get("cookie") ?? "" }, cache: "no-store",
        });
        const body = await res.json().catch(() => ({ events: [] }));
        return NextResponse.json(body, { status: res.status });
    } catch {
        return NextResponse.json({ error: "Gateway unavailable" }, { status: 502 });
    }
}
