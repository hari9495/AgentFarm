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

// PATCH /api/connectors/[id]  — rename a connector (display name only)
export async function PATCH(
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

    let body: { displayName?: string };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }
    const displayName = body.displayName?.trim();
    if (!displayName) {
        return NextResponse.json({ error: "Display name is required." }, { status: 400 });
    }

    try {
        const res = await fetch(
            `${API_GATEWAY_URL}/v1/connectors/${encodeURIComponent(connectorId)}`,
            {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    Cookie: `portal_session=${encodeURIComponent(portalToken)}`,
                },
                body: JSON.stringify({ display_name: displayName }),
            },
        );
        if (!res.ok) {
            const detail = await res.json().catch(() => ({})) as { message?: string };
            return NextResponse.json(
                { error: detail.message ?? "Failed to rename connector." },
                { status: res.status },
            );
        }
        return NextResponse.json({ status: "ok", displayName });
    } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        return NextResponse.json({ error: detail }, { status: 502 });
    }
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
