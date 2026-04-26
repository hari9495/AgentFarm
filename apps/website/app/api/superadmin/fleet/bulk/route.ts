import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import {
    getSessionUser,
    isCompanyOperatorEmail,
    getCompanyFleetBotById,
    updateCompanyFleetBotStatus,
    writeAuditEvent,
    type FleetBotStatus,
} from "@/lib/auth-store";
import { checkRateLimit } from "@/lib/rate-limit";

const COOKIE_NAME = "agentfarm_session";
const VALID_STATUSES: FleetBotStatus[] = ["active", "paused", "error", "maintenance"];
const SENSITIVE_STATUSES: FleetBotStatus[] = ["paused", "maintenance"];

export async function POST(req: NextRequest) {
    const jar = await cookies();
    const token = jar.get(COOKIE_NAME)?.value;
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const user = getSessionUser(token);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!isCompanyOperatorEmail(user.email)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const rl = checkRateLimit(user.id);
    if (!rl.allowed) {
        return NextResponse.json(
            { error: "Rate limit exceeded. Please wait before retrying." },
            { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } },
        );
    }

    let body: unknown;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    if (typeof body !== "object" || body === null) {
        return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }

    const { ids, status, reason } = body as Record<string, unknown>;

    if (!Array.isArray(ids) || ids.length === 0) {
        return NextResponse.json({ error: "ids must be a non-empty array." }, { status: 422 });
    }
    if (ids.length > 50) {
        return NextResponse.json({ error: "Maximum 50 bots per bulk action." }, { status: 422 });
    }
    if (typeof status !== "string" || !VALID_STATUSES.includes(status as FleetBotStatus)) {
        return NextResponse.json({ error: `Status must be one of: ${VALID_STATUSES.join(", ")}.` }, { status: 422 });
    }
    if (SENSITIVE_STATUSES.includes(status as FleetBotStatus)) {
        if (typeof reason !== "string" || !reason.trim()) {
            return NextResponse.json({ error: "A reason is required for bulk paused/maintenance actions." }, { status: 422 });
        }
    }

    let updated = 0;
    for (const rawId of ids) {
        if (typeof rawId !== "string") continue;
        const bot = getCompanyFleetBotById(rawId);
        if (!bot) continue;
        const result = updateCompanyFleetBotStatus(rawId, status as FleetBotStatus);
        if (result.ok) {
            updated++;
            writeAuditEvent({
                actorId: user.id,
                actorEmail: user.email,
                action: "fleet.status_change",
                targetType: "fleet_bot",
                targetId: rawId,
                tenantId: bot.tenantId,
                beforeState: { status: bot.status },
                afterState: { status },
                reason: typeof reason === "string" ? reason.trim() : "",
            });
        }
    }

    return NextResponse.json({ ok: true, updated });
}
