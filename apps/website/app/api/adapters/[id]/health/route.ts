import { NextResponse } from "next/server";
import { getPortalUserFromRequest } from "@/lib/portal-request-auth";

export const dynamic = 'force-dynamic';


const GATEWAY_URL = process.env.API_GATEWAY_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

// POST /api/adapters/[id]/health
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const user = await getPortalUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;
    try {
        const res = await fetch(`${GATEWAY_URL}/v1/adapters/${encodeURIComponent(id)}/health-check`, { method: "POST", headers: { cookie: request.headers.get("cookie") ?? "", "Content-Type": "application/json" }, body: "{}" });
        const body = await res.json().catch(() => ({}));
        return NextResponse.json(body, { status: res.status });
    } catch { return NextResponse.json({ error: "Gateway unavailable" }, { status: 502 }); }
}
