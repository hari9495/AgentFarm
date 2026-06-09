import { NextResponse } from "next/server";
import { getPortalUserFromRequest } from "@/lib/portal-request-auth";

const GATEWAY_URL = process.env.API_GATEWAY_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

// POST /api/adapters/[id]/health
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const user = await getPortalUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;
    const workspaceId = user.tenantId;
    const base = workspaceId ? `${GATEWAY_URL}/v1/workspaces/${encodeURIComponent(workspaceId)}/adapters` : `${GATEWAY_URL}/v1/adapters`;
    try {
        const res = await fetch(`${base}/${encodeURIComponent(id)}/health-check`, { method: "POST", headers: { cookie: request.headers.get("cookie") ?? "", "Content-Type": "application/json" }, body: "{}" });
        const body = await res.json().catch(() => ({}));
        return NextResponse.json(body, { status: res.status });
    } catch { return NextResponse.json({ error: "Gateway unavailable" }, { status: 502 }); }
}
