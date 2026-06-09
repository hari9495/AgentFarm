import { NextResponse } from "next/server";
import { getPortalUserFromRequest } from "@/lib/portal-request-auth";

const GATEWAY_URL = process.env.API_GATEWAY_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

// GET — list inbound webhook sources for this customer
export async function GET(request: Request) {
    const user = await getPortalUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const tenantId = user.tenantId;
    if (!tenantId) return NextResponse.json({ error: "Workspace not provisioned" }, { status: 400 });

    const params = new URLSearchParams({ tenantId });
    if (user.tenantId) params.set("workspaceId", user.tenantId);

    try {
        const res = await fetch(`${GATEWAY_URL}/v1/webhooks/inbound/sources?${params.toString()}`, {
            headers: { cookie: request.headers.get("cookie") ?? "" }, cache: "no-store",
        });
        const body = await res.json().catch(() => ({ sources: [] }));
        return NextResponse.json(body, { status: res.status });
    } catch {
        return NextResponse.json({ error: "Gateway unavailable" }, { status: 502 });
    }
}

// POST — create a new inbound webhook source
export async function POST(request: Request) {
    const user = await getPortalUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const tenantId = user.tenantId;
    if (!tenantId) return NextResponse.json({ error: "Workspace not provisioned" }, { status: 400 });

    let body: unknown;
    try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

    try {
        const res = await fetch(`${GATEWAY_URL}/v1/webhooks/inbound/sources`, {
            method: "POST",
            headers: { cookie: request.headers.get("cookie") ?? "", "Content-Type": "application/json" },
            body: JSON.stringify({ ...(body as object), tenantId, workspaceId: user.tenantId }),
        });
        const resBody = await res.json().catch(() => ({}));
        return NextResponse.json(resBody, { status: res.status });
    } catch {
        return NextResponse.json({ error: "Gateway unavailable" }, { status: 502 });
    }
}
