import { NextResponse } from "next/server";
import { getPortalUserFromRequest } from "@/lib/portal-request-auth";

const GATEWAY_URL = process.env.API_GATEWAY_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

// GET — list retention policies for this tenant/workspace
export async function GET(request: Request) {
    const user = await getPortalUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const workspaceId = user.tenantId;

    const params = new URLSearchParams();
    params.set("tenant_id", workspaceId);
    params.set("workspace_id", workspaceId);

    try {
        const res = await fetch(`${GATEWAY_URL}/v1/retention?${params.toString()}`,
            { headers: { cookie: request.headers.get("cookie") ?? "" }, cache: "no-store" }
        );
        const body = await res.json().catch(() => ({ policies: [] }));
        return NextResponse.json(body, { status: res.status });
    } catch {
        return NextResponse.json({ error: "Gateway unavailable" }, { status: 502 });
    }
}

// POST — create a new retention policy
export async function POST(request: Request) {
    const user = await getPortalUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const workspaceId = user.tenantId;

    let body: unknown;
    try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

    try {
        const res = await fetch(`${GATEWAY_URL}/v1/retention`, {
            method: "POST",
            headers: { cookie: request.headers.get("cookie") ?? "", "Content-Type": "application/json" },
            body: JSON.stringify({
                ...(body as object),
                tenant_id: workspaceId,
                workspace_id: workspaceId,
            }),
        });
        const resBody = await res.json().catch(() => ({}));
        return NextResponse.json(resBody, { status: res.status });
    } catch {
        return NextResponse.json({ error: "Gateway unavailable" }, { status: 502 });
    }
}

// DELETE — remove a retention policy by ID
export async function DELETE(request: Request) {
    const user = await getPortalUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const policyId = searchParams.get("id");
    if (!policyId) return NextResponse.json({ error: "Policy ID required" }, { status: 400 });

    try {
        const res = await fetch(`${GATEWAY_URL}/v1/retention/${encodeURIComponent(policyId)}`,
            { method: "DELETE", headers: { cookie: request.headers.get("cookie") ?? "" } }
        );
        const resBody = await res.json().catch(() => ({}));
        return NextResponse.json(resBody, { status: res.status });
    } catch {
        return NextResponse.json({ error: "Gateway unavailable" }, { status: 502 });
    }
}
