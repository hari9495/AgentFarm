import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, updateBotStatus, updateBotConfig, BotStatus, AutonomyLevel, ApprovalPolicy } from "@/lib/auth-store";

const COOKIE_NAME = "agentfarm_session";

export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ slug: string }> },
) {
    const jar = await cookies();
    const token = jar.get(COOKIE_NAME)?.value;
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const actor = getSessionUser(token);
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (actor.role === "member") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { slug } = await params;
    let body: Record<string, string>;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    // Status update (pause / resume / maintenance)
    if (body.status !== undefined) {
        const valid: BotStatus[] = ["active", "paused", "error", "maintenance"];
        if (!valid.includes(body.status as BotStatus)) {
            return NextResponse.json({ error: "Invalid status" }, { status: 400 });
        }
        const result = updateBotStatus(slug, body.status as BotStatus);
        if (!result.ok) return NextResponse.json({ error: "Bot not found" }, { status: 404 });
    }

    // Config update
    const configFields: Parameters<typeof updateBotConfig>[1] = {};
    if (body.autonomyLevel !== undefined) {
        const valid: AutonomyLevel[] = ["low", "medium", "high"];
        if (!valid.includes(body.autonomyLevel as AutonomyLevel)) return NextResponse.json({ error: "Invalid autonomyLevel" }, { status: 400 });
        configFields.autonomyLevel = body.autonomyLevel as AutonomyLevel;
    }
    if (body.approvalPolicy !== undefined) {
        const valid: ApprovalPolicy[] = ["all", "medium-high", "high-only"];
        if (!valid.includes(body.approvalPolicy as ApprovalPolicy)) return NextResponse.json({ error: "Invalid approvalPolicy" }, { status: 400 });
        configFields.approvalPolicy = body.approvalPolicy as ApprovalPolicy;
    }
    if (body.shiftStart !== undefined) configFields.shiftStart = body.shiftStart;
    if (body.shiftEnd !== undefined) configFields.shiftEnd = body.shiftEnd;
    if (body.activeDays !== undefined) configFields.activeDays = body.activeDays;
    if (body.notes !== undefined) configFields.notes = body.notes;

    if (Object.keys(configFields).length > 0) {
        const result = updateBotConfig(slug, configFields);
        if (!result.ok) return NextResponse.json({ error: "Bot not found or no changes" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
}
