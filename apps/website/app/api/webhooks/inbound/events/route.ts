import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth-store";

const COOKIE_NAME = "agentfarm_session";
const GATEWAY_URL = process.env.API_GATEWAY_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

const getCookieValue = (h: string | null, name: string): string | null => {
    if (!h) return null;
    const c = h.split(";").map(p => p.trim()).find(p => p.startsWith(`${name}=`));
    return c ? decodeURIComponent(c.slice(name.length + 1)) : null;
};

// GET /api/webhooks/inbound/events — list recent inbound events
export async function GET(request: NextRequest) {
    const token = getCookieValue(request.headers.get("cookie"), COOKIE_NAME);
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const user = await getSessionUser(token);
    if (!user?.gatewayToken || !user.tenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const upstream = new URL(`${GATEWAY_URL}/v1/webhooks/inbound/events`);
    upstream.searchParams.set("tenantId", user.tenantId);
    if (user.gatewayWorkspaceId) upstream.searchParams.set("workspaceId", user.gatewayWorkspaceId);
    for (const key of ["source", "limit", "cursor"]) {
        const val = searchParams.get(key);
        if (val) upstream.searchParams.set(key, val);
    }

    try {
        const res = await fetch(upstream.toString(), {
            headers: { Authorization: `Bearer ${user.gatewayToken}` }, cache: "no-store",
        });
        const body = await res.json().catch(() => ({ events: [] }));
        return NextResponse.json(body, { status: res.status });
    } catch {
        return NextResponse.json({ error: "Gateway unavailable" }, { status: 502 });
    }
}
