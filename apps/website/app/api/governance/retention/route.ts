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

// GET — list retention policies for this tenant/workspace
export async function GET(request: Request) {
    const user = await getUser(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { gatewayWorkspaceId: workspaceId, gatewayToken: authToken, tenantId } = user;
    if (!authToken) return NextResponse.json({ error: "Workspace not provisioned" }, { status: 400 });

    const params = new URLSearchParams();
    if (tenantId) params.set("tenant_id", tenantId);
    if (workspaceId) params.set("workspace_id", workspaceId);

    try {
        const res = await fetch(`${GATEWAY_URL}/v1/retention?${params.toString()}`,
            { headers: { Authorization: `Bearer ${authToken}` }, cache: "no-store" }
        );
        const body = await res.json().catch(() => ({ policies: [] }));
        return NextResponse.json(body, { status: res.status });
    } catch {
        return NextResponse.json({ error: "Gateway unavailable" }, { status: 502 });
    }
}

// POST — create a new retention policy
export async function POST(request: Request) {
    const user = await getUser(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { gatewayWorkspaceId: workspaceId, gatewayToken: authToken, tenantId } = user;
    if (!authToken) return NextResponse.json({ error: "Workspace not provisioned" }, { status: 400 });

    let body: unknown;
    try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

    try {
        const res = await fetch(`${GATEWAY_URL}/v1/retention`, {
            method: "POST",
            headers: { Authorization: `Bearer ${authToken}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                ...(body as object),
                tenant_id: tenantId,
                workspace_id: workspaceId ?? undefined,
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
    const user = await getUser(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { gatewayToken: authToken } = user;
    if (!authToken) return NextResponse.json({ error: "Workspace not provisioned" }, { status: 400 });

    const { searchParams } = new URL(request.url);
    const policyId = searchParams.get("id");
    if (!policyId) return NextResponse.json({ error: "Policy ID required" }, { status: 400 });

    try {
        const res = await fetch(`${GATEWAY_URL}/v1/retention/${encodeURIComponent(policyId)}`,
            { method: "DELETE", headers: { Authorization: `Bearer ${authToken}` } }
        );
        const resBody = await res.json().catch(() => ({}));
        return NextResponse.json(resBody, { status: res.status });
    } catch {
        return NextResponse.json({ error: "Gateway unavailable" }, { status: 502 });
    }
}
