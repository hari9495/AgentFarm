import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-store";

const COOKIE_NAME = "agentfarm_session";
const GATEWAY_URL = process.env.API_GATEWAY_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

const getCookieValue = (h: string | null, name: string): string | null => {
    if (!h) return null;
    const c = h.split(";").map(p => p.trim()).find(p => p.startsWith(`${name}=`));
    return c ? decodeURIComponent(c.slice(name.length + 1)) : null;
};

// DELETE /api/webhooks/inbound/sources/[sourceId]
export async function DELETE(request: Request, { params }: { params: Promise<{ sourceId: string }> }) {
    const token = getCookieValue(request.headers.get("cookie"), COOKIE_NAME);
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const user = await getSessionUser(token);
    if (!user?.gatewayToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { sourceId } = await params;

    try {
        const res = await fetch(`${GATEWAY_URL}/v1/webhooks/inbound/sources/${encodeURIComponent(sourceId)}`, {
            method: "DELETE", headers: { Authorization: `Bearer ${user.gatewayToken}` },
        });
        return NextResponse.json({}, { status: res.status });
    } catch {
        return NextResponse.json({ error: "Gateway unavailable" }, { status: 502 });
    }
}
