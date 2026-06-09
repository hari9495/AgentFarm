import { NextResponse } from "next/server";
import { getPortalUserFromRequest } from "@/lib/portal-request-auth";

const GATEWAY_URL = process.env.API_GATEWAY_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

function portalCookie(request: Request): string {
    return request.headers.get("cookie") ?? "";
}

// GET — list registered adapters for this workspace
export async function GET(request: Request) {
    const user = await getPortalUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const url = `${GATEWAY_URL}/v1/workspaces/${encodeURIComponent(user.tenantId)}/adapters`;
    try {
        const res = await fetch(url, { headers: { cookie: portalCookie(request) }, cache: "no-store" });
        const body = await res.json().catch(() => ({ adapters: [] }));
        return NextResponse.json(body, { status: res.status });
    } catch {
        return NextResponse.json({ error: "Gateway unavailable" }, { status: 502 });
    }
}

// POST — register a new custom adapter
export async function POST(request: Request) {
    const user = await getPortalUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    let body: unknown;
    try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

    const url = `${GATEWAY_URL}/v1/workspaces/${encodeURIComponent(user.tenantId)}/adapters`;
    try {
        const res = await fetch(url, {
            method: "POST",
            headers: { cookie: portalCookie(request), "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        const resBody = await res.json().catch(() => ({}));
        return NextResponse.json(resBody, { status: res.status });
    } catch {
        return NextResponse.json({ error: "Gateway unavailable" }, { status: 502 });
    }
}
