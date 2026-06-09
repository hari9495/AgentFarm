import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-store";

const COOKIE_NAME = "agentfarm_session";
const GATEWAY_URL = process.env.API_GATEWAY_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

const getCookieValue = (h: string | null, name: string): string | null => {
    if (!h) return null;
    const c = h.split(";").map(p => p.trim()).find(p => p.startsWith(`${name}=`));
    return c ? decodeURIComponent(c.slice(name.length + 1)) : null;
};

async function getUser(request: Request) {
    const token = getCookieValue(request.headers.get("cookie"), COOKIE_NAME);
    if (!token) return null;
    return getSessionUser(token);
}

// DELETE /api/adapters/[id]
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const user = await getUser(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;
    const { gatewayWorkspaceId: workspaceId, gatewayToken: authToken } = user;
    if (!authToken) return NextResponse.json({ error: "Workspace not provisioned" }, { status: 400 });
    const base = workspaceId ? `${GATEWAY_URL}/v1/workspaces/${encodeURIComponent(workspaceId)}/adapters` : `${GATEWAY_URL}/v1/adapters`;
    try {
        const res = await fetch(`${base}/${encodeURIComponent(id)}`, { method: "DELETE", headers: { Authorization: `Bearer ${authToken}` } });
        return NextResponse.json({}, { status: res.status });
    } catch { return NextResponse.json({ error: "Gateway unavailable" }, { status: 502 }); }
}
