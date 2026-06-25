import { NextResponse } from "next/server";
import { getPortalUserFromRequest } from "@/lib/portal-request-auth";

export const dynamic = 'force-dynamic';

const GATEWAY_URL = process.env.API_GATEWAY_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

// POST — activate a managed catalog connector with the customer-supplied field values.
export async function POST(
    request: Request,
    { params }: { params: Promise<{ connectorId: string }> },
) {
    const user = await getPortalUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { connectorId } = await params;

    let body: string;
    try { body = await request.text(); } catch { return NextResponse.json({ error: "Invalid body" }, { status: 400 }); }

    try {
        const res = await fetch(`${GATEWAY_URL}/v1/mcp/catalog/${encodeURIComponent(connectorId)}/enable`, {
            method: "POST",
            headers: { cookie: request.headers.get("cookie") ?? "", "Content-Type": "application/json" },
            body,
        });
        const resBody = await res.json().catch(() => ({}));
        return NextResponse.json(resBody, { status: res.status });
    } catch {
        return NextResponse.json({ error: "Gateway unavailable" }, { status: 502 });
    }
}
