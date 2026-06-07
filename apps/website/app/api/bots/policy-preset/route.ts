import { NextResponse } from "next/server";
import { getSessionUser, listBots, updateBotConfig, type ApprovalPolicy } from "@/lib/auth-store";

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

// Presets translate a one-click choice into a concrete `approvalPolicy` applied
// across every deployed agent — there is no separate "policy preset" entity to
// persist, so the preset *is* the bulk update of the underlying real field.
const PRESETS: Record<string, ApprovalPolicy> = {
    startup: "high-only",
    enterprise: "medium-high",
};

export async function POST(request: Request) {
    const token = getCookieValue(request.headers.get("cookie"), COOKIE_NAME);
    if (!token) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const user = await getSessionUser(token);
    if (!user) return NextResponse.json({ error: "Invalid or expired session." }, { status: 401 });

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
