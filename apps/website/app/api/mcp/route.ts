import { NextResponse } from "next/server";
import { getPortalUserFromRequest } from "@/lib/portal-request-auth";

export const dynamic = 'force-dynamic';


const GATEWAY_URL = process.env.API_GATEWAY_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

// GET — list MCP servers for this tenant
export async function GET(request: Request) {
    const user = await getPortalUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const res = await fetch(`${GATEWAY_URL}/v1/mcp`, {
            headers: { cookie: request.headers.get("cookie") ?? "" }, cache: "no-store",
        });
        const body = await res.json().catch(() => []);
        return NextResponse.json(body, { status: res.status });
    } catch {
        return NextResponse.json({ error: "Gateway unavailable" }, { status: 502 });
    }
}

// POST — register a new MCP server
export async function POST(request: Request) {
    const user = await getPortalUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const workspaceId = user.tenantId;

    let body: unknown;
    try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

    try {
        const res = await fetch(`${GATEWAY_URL}/v1/mcp`, {
            method: "POST",
            headers: { cookie: request.headers.get("cookie") ?? "", "Content-Type": "application/json" },
            body: JSON.stringify({ ...(body as object), workspaceId: (body as Record<string,unknown>).workspaceId ?? workspaceId }),
        });
        const resBody = await res.json().catch(() => ({}));
        return NextResponse.json(resBody, { status: res.status });
    } catch {
        return NextResponse.json({ error: "Gateway unavailable" }, { status: 502 });
    }
}
