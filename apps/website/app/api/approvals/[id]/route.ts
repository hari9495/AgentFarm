import { NextResponse } from "next/server";
import { getSessionUser, updateApprovalDecision } from "@/lib/auth-store";

const COOKIE_NAME = "agentfarm_session";

type ApprovalMutationPayload = {
    action?: "approve" | "reject";
};

const getCookieValue = (cookieHeader: string | null, name: string): string | null => {
    if (!cookieHeader) return null;
    const cookie = cookieHeader
        .split(";")
        .map((part) => part.trim())
        .find((part) => part.startsWith(`${name}=`));
    if (!cookie) return null;
    return decodeURIComponent(cookie.slice(name.length + 1));
};

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
    const token = getCookieValue(request.headers.get("cookie"), COOKIE_NAME);
    if (!token) {
        return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const user = getSessionUser(token);
    if (!user) {
        return NextResponse.json({ error: "Invalid or expired session." }, { status: 401 });
    }

    let payload: ApprovalMutationPayload;
    try {
        payload = (await request.json()) as ApprovalMutationPayload;
    } catch {
        return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }

    if (!payload.action || !["approve", "reject"].includes(payload.action)) {
        return NextResponse.json({ error: "Action must be approve or reject." }, { status: 400 });
    }

    const { id } = await context.params;

    const updated = updateApprovalDecision({
        id,
        decision: payload.action === "approve" ? "approved" : "rejected",
        decidedBy: user.email,
    });

    if (!updated) {
        return NextResponse.json({ error: "Approval not found or already decided." }, { status: 409 });
    }

    return NextResponse.json({
        status: "ok",
        approval: updated,
    });
}
