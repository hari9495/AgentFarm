import { NextResponse } from "next/server";
import { getPortalSessionFromRequest } from "@/lib/portal-api-auth";

const GATEWAY_URL =
    process.env.API_GATEWAY_URL ||
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

type ApprovalCreatePayload = {
    title?: string;
    agentSlug?: string;
    agent?: string;
    requestedBy?: string;
    channel?: string;
    reason?: string;
    risk?: "low" | "medium" | "high";
    escalationTimeoutSeconds?: number;
};

export async function GET(request: Request) {
    const session = await getPortalSessionFromRequest(request);
    if (!session) {
        return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    // Proxy to gateway portal approvals endpoint (uses portal_session cookie)
    const token = extractPortalToken(request.headers.get("cookie"));
    const { searchParams } = new URL(request.url);

    // Map query params to gateway format
    const status = searchParams.get("status") ?? "pending";
    const limit = searchParams.get("limit") ?? "100";
    const agentSlug = searchParams.get("agentSlug");

    const qs = new URLSearchParams({ status, limit });
    if (agentSlug) qs.set("agentSlug", agentSlug);

    try {
        const res = await fetch(`${GATEWAY_URL}/portal/data/approvals?${qs.toString()}`, {
            headers: { cookie: `portal_session=${token ?? ""}` },
            cache: "no-store",
        });

        if (!res.ok) {
            // Gateway approval endpoint may not exist yet — return empty list gracefully
            return NextResponse.json({ status: "ok", approvals: [] });
        }

        const data = (await res.json()) as { approvals?: unknown[] };
        return NextResponse.json({ status: "ok", approvals: data.approvals ?? [] });
    } catch {
        return NextResponse.json({ status: "ok", approvals: [] });
    }
}

export async function POST(request: Request) {
    const session = await getPortalSessionFromRequest(request);
    if (!session) {
        return NextResponse.json({ error: "Authentication required." }, { status: 401 });
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
    const requestedBy = payload.requestedBy?.trim() ?? session.email;
    const channel = payload.channel?.trim() ?? "Dashboard";
    const reason = payload.reason?.trim() ?? "";
    const risk = payload.risk;

    if (title.length < 6) return NextResponse.json({ error: "Title must be at least 6 characters." }, { status: 400 });
    if (title.length > 100) return NextResponse.json({ error: "Title must be 100 characters or fewer." }, { status: 400 });
    if (!agentSlug || !agent) return NextResponse.json({ error: "Agent slug and name are required." }, { status: 400 });
    if (reason.length < 8) return NextResponse.json({ error: "Reason must be at least 8 characters." }, { status: 400 });
    if (!risk || !["low", "medium", "high"].includes(risk)) return NextResponse.json({ error: "Risk must be low, medium, or high." }, { status: 400 });

    // Proxy to the gateway runtime approvals intake endpoint
    try {
        const token = extractPortalToken(request.headers.get("cookie"));
        const res = await fetch(`${GATEWAY_URL}/portal/data/approvals`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                cookie: `portal_session=${token ?? ""}`,
            },
            body: JSON.stringify({ title, agentSlug, agent, requestedBy, channel, reason, risk, escalationTimeoutSeconds: payload.escalationTimeoutSeconds }),
        });

        if (res.ok) {
            const data = (await res.json()) as { approval?: unknown };
            return NextResponse.json({ status: "ok", approval: data.approval }, { status: 201 });
        }
    } catch {
        // fall through to stub
    }

    // Stub approval for UI feedback when gateway endpoint isn't available
    const stubApproval = {
        id: `approval-${Date.now()}`,
        title,
        agentSlug,
        agent,
        requestedBy,
        channel,
        reason,
        risk,
        status: "pending",
        createdAt: Date.now(),
        decidedAt: null,
        decisionReason: null,
        decisionLatencySeconds: null,
        escalationTimeoutSeconds: payload.escalationTimeoutSeconds ?? 3600,
        escalatedAt: null,
    };
    return NextResponse.json({ status: "ok", approval: stubApproval }, { status: 201 });
}

export async function PATCH(request: Request) {
    const session = await getPortalSessionFromRequest(request);
    if (!session) {
        return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }
    return NextResponse.json({ status: "ok", escalatedCount: 0, escalatedIds: [] });
}
