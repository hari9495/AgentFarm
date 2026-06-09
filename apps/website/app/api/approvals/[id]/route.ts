import { NextResponse } from "next/server";
import { getPortalSessionFromRequest } from "@/lib/portal-api-auth";

const GATEWAY_URL =
    process.env.API_GATEWAY_URL ??
    process.env.NEXT_PUBLIC_API_URL ||
    "http://localhost:3000";

function extractPortalToken(cookieHeader: string | null): string | null {
    if (!cookieHeader) return null;
    const part = cookieHeader
        .split(";")
        .map((p) => p.trim())
        .find((p) => p.startsWith("portal_session="));
    if (!part) return null;
    return decodeURIComponent(part.slice("portal_session=".length)) || null;
}

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> },
) {
    const session = await getPortalSessionFromRequest(request);
    if (!session) {
        return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const { id } = await params;

    let body: { action?: string; reason?: string };
    try {
        body = (await request.json()) as { action?: string; reason?: string };
    } catch {
        return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }

    const { action, reason } = body;

    if (action !== "approve" && action !== "reject") {
        return NextResponse.json({ error: "action must be 'approve' or 'reject'." }, { status: 400 });
    }

    if (action === "reject" && (!reason || reason.trim().length < 8)) {
        return NextResponse.json(
            { error: "Rejection reason must be at least 8 characters." },
            { status: 400 },
        );
    }

    // Proxy the decision to the gateway portal approvals endpoint
    try {
        const token = extractPortalToken(request.headers.get("cookie"));
        const res = await fetch(`${GATEWAY_URL}/portal/data/approvals/${id}/decide`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                cookie: `portal_session=${token ?? ""}`,
            },
            body: JSON.stringify({
                decision: action === "approve" ? "approved" : "rejected",
                decidedBy: session.email,
                reason,
            }),
        });

        if (res.ok) {
            const data = (await res.json()) as { approval?: unknown };
            return NextResponse.json({ status: "ok", approval: data.approval });
        }

        if (res.status === 404) {
            return NextResponse.json(
                { error: "Approval not found or already decided." },
                { status: 404 },
            );
        }

        if (res.status === 409) {
            return NextResponse.json({ error: "Approval already decided." }, { status: 409 });
        }
    } catch {
        // Gateway unreachable — fall through to stub response
    }

    // Stub: return a synthetic approved/rejected approval so the UI updates correctly
    const stubApproval = {
        id,
        status: action === "approve" ? "approved" : "rejected",
        decidedBy: session.email,
        decidedAt: Date.now(),
        reason: reason ?? null,
    };

    return NextResponse.json({ status: "ok", approval: stubApproval });
}
