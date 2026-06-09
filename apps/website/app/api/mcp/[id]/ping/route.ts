import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-store";

const COOKIE_NAME = "agentfarm_session";
const GATEWAY_URL = process.env.API_GATEWAY_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

const getCookieValue = (h: string | null, name: string): string | null => {
    if (!h) return null;
    const c = h.split(";").map(p => p.trim()).find(p => p.startsWith(`${name}=`));
    return c ? decodeURIComponent(c.slice(name.length + 1)) : null;
};

// GET /api/mcp/[id]/ping
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const token = getCookieValue(request.headers.get("cookie"), COOKIE_NAME);
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const user = await getSessionUser(token);
    if (!user?.gatewayToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;

    try {
        const res = await fetch(`${GATEWAY_URL}/v1/mcp/${encodeURIComponent(id)}/ping`, {
            headers: { Authorization: `Bearer ${user.gatewayToken}` }, cache: "no-store",
        });
        const body = await res.json().catch(() => ({ ok: false }));
        return NextResponse.json(body, { status: res.status });
    } catch {
        return NextResponse.json({ ok: false, error: "Gateway unavailable" }, { status: 502 });
    }
}
