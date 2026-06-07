import { NextResponse } from "next/server";
import {
    getBotBySlug,
    getSessionUser,
    updateBotConfig,
    type ApprovalPolicy,
    type AutonomyLevel,
} from "@/lib/auth-store";

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

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const VALID_DAYS = new Set(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);
const VALID_AUTONOMY = new Set<AutonomyLevel>(["low", "medium", "high"]);
const VALID_POLICY = new Set<ApprovalPolicy>(["all", "medium-high", "high-only"]);

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ slug: string }> },
) {
    const token = getCookieValue(request.headers.get("cookie"), COOKIE_NAME);
    if (!token) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const user = await getSessionUser(token);
    if (!user) return NextResponse.json({ error: "Invalid or expired session." }, { status: 401 });

    const { slug } = await params;
    const bot = await getBotBySlug(slug);
    if (!bot) return NextResponse.json({ error: "Agent not found." }, { status: 404 });

    let body: {
        shiftStart?: string;
        shiftEnd?: string;
        activeDays?: string[];
        autonomyLevel?: string;
        approvalPolicy?: string;
    };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }

    const config: Parameters<typeof updateBotConfig>[1] = {};

    if (body.shiftStart !== undefined) {
        if (!TIME_RE.test(body.shiftStart)) {
            return NextResponse.json({ error: "shiftStart must be in HH:MM 24-hour format." }, { status: 400 });
        }
        config.shiftStart = body.shiftStart;
    }

    if (body.shiftEnd !== undefined) {
        if (!TIME_RE.test(body.shiftEnd)) {
            return NextResponse.json({ error: "shiftEnd must be in HH:MM 24-hour format." }, { status: 400 });
        }
        config.shiftEnd = body.shiftEnd;
    }

    if (body.activeDays !== undefined) {
        if (!Array.isArray(body.activeDays) || body.activeDays.some((d) => typeof d !== "string" || !VALID_DAYS.has(d.toLowerCase()))) {
            return NextResponse.json({ error: "activeDays must be an array of mon..sun." }, { status: 400 });
        }
        config.activeDays = body.activeDays.map((d) => d.toLowerCase()).join(",");
    }

    if (body.autonomyLevel !== undefined) {
        if (!VALID_AUTONOMY.has(body.autonomyLevel as AutonomyLevel)) {
            return NextResponse.json({ error: "autonomyLevel must be low, medium, or high." }, { status: 400 });
        }
        config.autonomyLevel = body.autonomyLevel as AutonomyLevel;
    }

    if (body.approvalPolicy !== undefined) {
        if (!VALID_POLICY.has(body.approvalPolicy as ApprovalPolicy)) {
            return NextResponse.json({ error: "approvalPolicy must be all, medium-high, or high-only." }, { status: 400 });
        }
        config.approvalPolicy = body.approvalPolicy as ApprovalPolicy;
    }

    if (Object.keys(config).length === 0) {
        return NextResponse.json({ error: "No valid fields to update." }, { status: 400 });
    }

    const result = await updateBotConfig(slug, config);
    if (!result.ok) {
        return NextResponse.json({ error: "Update failed." }, { status: 500 });
    }

    const updated = await getBotBySlug(slug);
    return NextResponse.json({ status: "ok", bot: updated });
}
