export const runtime = 'edge'

import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import {
    getCompanyIncidentById,
    getSessionUser,
    isCompanyOperatorEmail,
    resolveCompanyIncident,
    writeAuditEvent,
} from "@/lib/auth-store";
import { checkRateLimit } from "@/lib/rate-limit";

const COOKIE_NAME = "agentfarm_session";

export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const jar = await cookies();
    const token = jar.get(COOKIE_NAME)?.value;
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const user = await getSessionUser(token);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!isCompanyOperatorEmail(user.email)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const rl = checkRateLimit(user.id);
    if (!rl.allowed) {
        return NextResponse.json(
            { error: "Too many requests. Please wait before retrying." },
            {
                status: 429,
                headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) },
            },
        );
    }

    let body: { reason?: string };
    try {
        body = await req.json();
    } catch {
        body = {};
    }

    const reason = (body.reason ?? "").trim();
    if (!reason) {
        return NextResponse.json(
            { error: "A resolution reason is required." },
            { status: 422 },
        );
    }

    const { id } = await params;
    const before = await getCompanyIncidentById(id);
    const result = await resolveCompanyIncident(id, reason);
    if (!result.ok) {
        return NextResponse.json({ error: result.error ?? "Unable to resolve incident" }, { status: 422 });
    }

    writeAuditEvent({
        actorId: user.id,
        actorEmail: user.email,
        action: "incident.resolve",
        targetType: "incident",
        targetId: id,
        tenantId: before?.tenantId ?? "",
        beforeState: { status: before?.status ?? "unknown" },
        afterState: { status: "resolved" },
        reason,
    });

    return NextResponse.json({ ok: true });
}
