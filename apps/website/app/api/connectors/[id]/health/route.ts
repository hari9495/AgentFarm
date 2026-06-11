import { NextResponse } from "next/server";
import { getPortalUserFromRequest } from "@/lib/portal-request-auth";

export const dynamic = "force-dynamic";

const API_GATEWAY_URL =
    process.env.API_GATEWAY_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    "http://localhost:3000";

function getPortalSessionToken(request: Request): string | null {
    const cookieHeader = request.headers.get("cookie") ?? "";
    const match = cookieHeader
        .split(";")
        .map((p) => p.trim())
        .find((p) => p.startsWith("portal_session="));
    return match ? decodeURIComponent(match.slice("portal_session=".length)) : null;
}

// POST /api/connectors/[id]/health
export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> },
) {
    const user = await getPortalUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const portalToken = getPortalSessionToken(request);
    if (!portalToken) {
        return NextResponse.json({ healthy: false, message: "connector_bridge_unavailable" }, { status: 503 });
    }

    const { id: connectorId } = await params;
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get("workspaceId") ?? "";

    // Derive connector_type from connectorId (format: type:tenantId:workspaceId)
    const connectorType = connectorId.split(":")[0] ?? "custom_api";

    try {
        const res = await fetch(`${API_GATEWAY_URL}/v1/connectors/health/check`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Cookie: `portal_session=${encodeURIComponent(portalToken)}`,
            },
            body: JSON.stringify({
                workspace_id: workspaceId || connectorId.split(":")[2] || "",
                connector_type: connectorType,
            }),
        });

        const body = await res.json() as {
            results?: Array<{ connector_id: string; status_after: string; probe_outcome: string; message: string }>;
        };

        if (!res.ok) {
            return NextResponse.json({ healthy: false, message: "Health check failed." }, { status: 200 });
        }

        const result = body.results?.find((r) => r.connector_id === connectorId) ?? body.results?.[0];
        const healthy = result?.status_after === "connected";
        return NextResponse.json({
            healthy,
            message: result?.message ?? (healthy ? "Connector is healthy." : "Health check returned no result."),
        });
    } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        return NextResponse.json({ healthy: false, message: detail }, { status: 200 });
    }
}
