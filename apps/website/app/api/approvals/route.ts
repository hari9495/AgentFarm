import { NextResponse } from "next/server";
import { createApprovalRequest, getSessionUser, listApprovals } from "@/lib/auth-store";

const COOKIE_NAME = "agentfarm_session";

const getCookieValue = (cookieHeader: string | null, name: string): string | null => {
    if (!cookieHeader) return null;
    const cookie = cookieHeader
        .split(";")
        .map((part) => part.trim())
        .find((part) => part.startsWith(`${name}=`));
    if (!cookie) return null;
    return decodeURIComponent(cookie.slice(name.length + 1));
};

type ApprovalCreatePayload = {
    title?: string;
    agentSlug?: string;
    agent?: string;
    requestedBy?: string;
    channel?: string;
    reason?: string;
    risk?: "low" | "medium" | "high";
};

export async function GET(request: Request) {
    const token = getCookieValue(request.headers.get("cookie"), COOKIE_NAME);
    if (!token) {
        return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const user = getSessionUser(token);
    if (!user) {
        return NextResponse.json({ error: "Invalid or expired session." }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const agentSlug = searchParams.get("agentSlug") ?? undefined;
    const status = (searchParams.get("status") ?? "pending") as "pending" | "approved" | "rejected";

    if (!["pending", "approved", "rejected"].includes(status)) {
        return NextResponse.json({ error: "Invalid status filter." }, { status: 400 });
    }

    const approvals = listApprovals({
        agentSlug,
        status,
        tenantId: user.tenantId ?? undefined,
    });

    return NextResponse.json({
        status: "ok",
        approvals,
    });
}

export async function POST(request: Request) {
    const token = getCookieValue(request.headers.get("cookie"), COOKIE_NAME);
    if (!token) {
        return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const user = getSessionUser(token);
    if (!user) {
        return NextResponse.json({ error: "Invalid or expired session." }, { status: 401 });
    }

    let payload: ApprovalCreatePayload;
    try {
        payload = (await request.json()) as ApprovalCreatePayload;
    } catch {
        return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }

    const title = payload.title?.trim() ?? "";
    const agentSlug = payload.agentSlug?.trim() ?? "";
    const agent = payload.agent?.trim() ?? "";
    const requestedBy = payload.requestedBy?.trim() ?? user.email;
    const channel = payload.channel?.trim() ?? "Dashboard";
    const reason = payload.reason?.trim() ?? "";
    const risk = payload.risk;

    if (title.length < 6) {
        return NextResponse.json({ error: "Title must be at least 6 characters." }, { status: 400 });
    }

    if (!agentSlug || !agent) {
        return NextResponse.json({ error: "Agent slug and name are required." }, { status: 400 });
    }

    if (reason.length < 8) {
        return NextResponse.json({ error: "Reason must be at least 8 characters." }, { status: 400 });
    }

    if (!risk || !["low", "medium", "high"].includes(risk)) {
        return NextResponse.json({ error: "Risk must be low, medium, or high." }, { status: 400 });
    }

    const approval = createApprovalRequest({
        title,
        agentSlug,
        agent,
        requestedBy,
        channel,
        reason,
        risk,
        actorId: user.id,
        actorEmail: user.email,
    });

    return NextResponse.json({ status: "ok", approval }, { status: 201 });
}
