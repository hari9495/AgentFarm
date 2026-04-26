import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import {
    FleetBotStatus,
    getCompanyFleetBotById,
    getSessionUser,
    isCompanyOperatorEmail,
    updateCompanyFleetBotStatus,
    writeAuditEvent,
} from "@/lib/auth-store";
import { checkRateLimit } from "@/lib/rate-limit";

const COOKIE_NAME = "agentfarm_session";
const REASON_REQUIRED_STATUSES: FleetBotStatus[] = ["paused", "maintenance"];

export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const jar = await cookies();
    const token = jar.get(COOKIE_NAME)?.value;
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const user = getSessionUser(token);
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

    let body: { status?: string; reason?: string };
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const validStatuses: FleetBotStatus[] = ["active", "paused", "error", "maintenance"];
    if (!body.status || !validStatuses.includes(body.status as FleetBotStatus)) {
        return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const newStatus = body.status as FleetBotStatus;
    if (REASON_REQUIRED_STATUSES.includes(newStatus)) {
        const reason = (body.reason ?? "").trim();
        if (!reason) {
            return NextResponse.json(
                { error: `A reason is required when setting status to '${newStatus}'.` },
                { status: 422 },
            );
        }
    }

    const { id } = await params;
    const before = getCompanyFleetBotById(id);
    const result = updateCompanyFleetBotStatus(id, newStatus);
    if (!result.ok) return NextResponse.json({ error: "Bot instance not found" }, { status: 404 });

    writeAuditEvent({
        actorId: user.id,
        actorEmail: user.email,
        action: "fleet.status_change",
        targetType: "fleet_bot",
        targetId: id,
        tenantId: before?.tenantId ?? "",
        beforeState: { status: before?.status ?? "unknown" },
        afterState: { status: newStatus },
        reason: (body.reason ?? "").trim(),
    });

    return NextResponse.json({ ok: true });
}
