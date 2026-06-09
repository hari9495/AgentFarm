import { NextResponse } from "next/server";
import { getPortalUserFromRequest } from "@/lib/portal-request-auth";

const GATEWAY_URL = process.env.API_GATEWAY_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

// GET — list workflow templates + active workflows for this workspace
export async function GET(request: Request) {
    const user = await getPortalUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const workspaceId = user.tenantId;

    try {
        const [templatesRes, workflowsRes] = await Promise.all([
            fetch(`${GATEWAY_URL}/v1/governance/workflows/templates?workspace_id=${encodeURIComponent(workspaceId)}`,
                { headers: { cookie: request.headers.get("cookie") ?? "" }, cache: "no-store" }),
            fetch(`${GATEWAY_URL}/v1/governance/workflows?workspace_id=${encodeURIComponent(workspaceId)}`,
                { headers: { cookie: request.headers.get("cookie") ?? "" }, cache: "no-store" }),
        ]);
        const [templates, workflows] = await Promise.all([
            templatesRes.json().catch(() => ({ templates: [] })),
            workflowsRes.json().catch(() => ({ workflows: [] })),
        ]);
        return NextResponse.json({ templates, workflows });
    } catch {
        return NextResponse.json({ error: "Gateway unavailable" }, { status: 502 });
    }
}

// POST — create a new workflow template
export async function POST(request: Request) {
    const user = await getPortalUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const workspaceId = user.tenantId;

    let body: unknown;
    try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

    try {
        const res = await fetch(`${GATEWAY_URL}/v1/governance/workflows/templates`, {
            method: "POST",
            headers: { cookie: request.headers.get("cookie") ?? "", "Content-Type": "application/json" },
            body: JSON.stringify({ ...(body as object), workspace_id: workspaceId }),
        });
        const resBody = await res.json().catch(() => ({}));
        return NextResponse.json(resBody, { status: res.status });
    } catch {
        return NextResponse.json({ error: "Gateway unavailable" }, { status: 502 });
    }
}
