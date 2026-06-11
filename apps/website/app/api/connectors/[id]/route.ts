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

// DELETE /api/connectors/[id]  — revoke / remove a connector
export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> },
) {
    const user = await getPortalUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const portalToken = getPortalSessionToken(request);
    if (!portalToken) {
        return NextResponse.json({ error: "connector_bridge_unavailable" }, { status: 503 });
    }

    const { id: connectorId } = await params;

    try {
        const res = await fetch(
            `${API_GATEWAY_URL}/v1/connectors/${encodeURIComponent(connectorId)}`,
            {
                method: "DELETE",
                headers: {
                    "Content-Type": "application/json",
                    Cookie: `portal_session=${encodeURIComponent(portalToken)}`,
                },
            },
        );

        if (!res.ok) {
            const body = await res.json().catch(() => ({})) as { message?: string };
            return NextResponse.json(
                { error: body.message ?? "Failed to remove connector." },
                { status: res.status },
            );
        }

        return NextResponse.json({ status: "ok" });
    } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        return NextResponse.json({ error: detail }, { status: 502 });
    }
}
