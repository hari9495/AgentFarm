import { NextResponse } from "next/server";
import { decideApproval, getSessionUser } from "@/lib/auth-store";

const COOKIE_NAME = "agentfarm_session";

const getCookieValue = (cookieHeader: string | null, name: string): string | null => {
    if (!cookieHeader) return null;
    const cookie = cookieHeader
        .split(";")
        .map((c) => c.trim())
        .find((c) => c.startsWith(`${name}=`));
    if (!cookie) return null;
    return decodeURIComponent(cookie.slice(name.length + 1));
};

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> },
) {
    const token = getCookieValue(request.headers.get("cookie"), COOKIE_NAME);
    if (!token) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const user = await getSessionUser(token);
    if (!user) return NextResponse.json({ error: "Invalid or expired session." }, { status: 401 });

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

    const approval = await decideApproval({
        id,
        decision: action === "approve" ? "approved" : "rejected",
        decidedBy: user.email,
        reason,
    });

    if (!approval) {
        return NextResponse.json(
            { error: "Approval not found or already decided." },
            { status: 404 },
        );
    }

    return NextResponse.json({ status: "ok", approval });
}
