import { NextResponse } from "next/server";
import { getPortalUserFromRequest } from "@/lib/portal-request-auth";

const GATEWAY_URL = process.env.API_GATEWAY_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

// GET /api/mcp/[id]/ping
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const user = await getPortalUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;

    try {
        const res = await fetch(`${GATEWAY_URL}/v1/mcp/${encodeURIComponent(id)}/ping`, {
            headers: { cookie: request.headers.get("cookie") ?? "" }, cache: "no-store",
        });
        const body = await res.json().catch(() => ({ ok: false }));
        return NextResponse.json(body, { status: res.status });
    } catch {
        return NextResponse.json({ ok: false, error: "Gateway unavailable" }, { status: 502 });
    }
}
