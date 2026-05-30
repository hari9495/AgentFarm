import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-store";

const COOKIE_NAME = "agentfarm_session";
const GATEWAY_URL = process.env.API_GATEWAY_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

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

// GET — list MCP servers for this tenant
export async function GET(request: Request) {
    const user = await getUser(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { gatewayToken: authToken } = user;
    if (!authToken) return NextResponse.json({ error: "Workspace not provisioned" }, { status: 400 });

    try {
        const res = await fetch(`${GATEWAY_URL}/v1/mcp`, {
            headers: { Authorization: `Bearer ${authToken}` }, cache: "no-store",
        });
        const body = await res.json().catch(() => []);
        return NextResponse.json(body, { status: res.status });
    } catch {
        return NextResponse.json({ error: "Gateway unavailable" }, { status: 502 });
    }
}

// POST — register a new MCP server
export async function POST(request: Request) {
    const user = await getUser(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { gatewayToken: authToken, gatewayWorkspaceId: workspaceId } = user;
    if (!authToken) return NextResponse.json({ error: "Workspace not provisioned" }, { status: 400 });

    let body: unknown;
    try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

    try {
        const res = await fetch(`${GATEWAY_URL}/v1/mcp`, {
            method: "POST",
            headers: { Authorization: `Bearer ${authToken}`, "Content-Type": "application/json" },
            body: JSON.stringify({ ...(body as object), workspaceId: (body as Record<string,unknown>).workspaceId ?? workspaceId }),
        });
        const resBody = await res.json().catch(() => ({}));
        return NextResponse.json(resBody, { status: res.status });
    } catch {
        return NextResponse.json({ error: "Gateway unavailable" }, { status: 502 });
    }
}
