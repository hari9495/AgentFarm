import { NextResponse } from "next/server";
import { getPortalUserFromRequest } from "@/lib/portal-request-auth";
import { listBots, updateBotConfig, type ApprovalPolicy } from "@/lib/auth-store";

export const dynamic = 'force-dynamic';


// Presets translate a one-click choice into a concrete `approvalPolicy` applied
// across every deployed agent — there is no separate "policy preset" entity to
// persist, so the preset *is* the bulk update of the underlying real field.
const PRESETS: Record<string, ApprovalPolicy> = {
    startup: "high-only",
    enterprise: "medium-high",
};

export async function POST(request: Request) {
    const user = await getPortalUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    let body: { preset?: string };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }

    const policy = body.preset ? PRESETS[body.preset] : undefined;
    if (!policy) {
        return NextResponse.json({ error: "preset must be 'startup' or 'enterprise'." }, { status: 400 });
    }

    const bots = await listBots();
    await Promise.all(bots.map((bot) => updateBotConfig(bot.slug, { approvalPolicy: policy })));

    return NextResponse.json({ status: "ok", appliedTo: bots.length, approvalPolicy: policy });
}
