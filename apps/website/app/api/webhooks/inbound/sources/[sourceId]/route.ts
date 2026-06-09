import { NextResponse } from "next/server";
import { getPortalUserFromRequest } from "@/lib/portal-request-auth";

export const dynamic = 'force-dynamic';


const GATEWAY_URL = process.env.API_GATEWAY_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

// DELETE /api/webhooks/inbound/sources/[sourceId]
export async function DELETE(request: Request, { params }: { params: Promise<{ sourceId: string }> }) {
    const user = await getPortalUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { sourceId } = await params;

    try {
        const res = await fetch(`${GATEWAY_URL}/v1/webhooks/inbound/sources/${encodeURIComponent(sourceId)}`, {
            method: "DELETE", headers: { cookie: request.headers.get("cookie") ?? "" },
        });
        return NextResponse.json({}, { status: res.status });
    } catch {
        return NextResponse.json({ error: "Gateway unavailable" }, { status: 502 });
    }
}
