
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSessionUser, listBots, createBot } from "@/lib/auth-store";
import { getPortalUserFromRequest } from "@/lib/portal-request-auth";

const COOKIE_NAME = "agentfarm_session";

async function getAuthorizedUser(request: Request) {
    const jar = await cookies();
    const token = jar.get(COOKIE_NAME)?.value;
    if (token) {
        return await getSessionUser(token);
    }
    return await getPortalUserFromRequest(request);
}

export async function GET(request: Request) {
    const user = await getAuthorizedUser(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const bots = await listBots();
    return NextResponse.json({ bots });
}

export async function POST(request: Request) {
    const jar = await cookies();
    const token = jar.get(COOKIE_NAME)?.value;
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const user = await getSessionUser(token);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin" && user.role !== "superadmin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let body: Record<string, string>;
    try {
        body = await request.json() as Record<string, string>;
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const { name, role, slug: rawSlug, tone, autonomyLevel, approvalPolicy, shiftStart, shiftEnd, activeDays, notes } = body;
    if (!name || !role) {
        return NextResponse.json({ error: "name and role are required" }, { status: 400 });
    }

    const slug = rawSlug?.trim() || name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

    try {
        const bot = await createBot({ slug, name, role, tone, autonomyLevel: autonomyLevel as any, approvalPolicy: approvalPolicy as any, shiftStart, shiftEnd, activeDays, notes });
        return NextResponse.json({ bot }, { status: 201 });
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("UNIQUE") || msg.includes("unique")) {
            return NextResponse.json({ error: "A bot with that slug already exists" }, { status: 409 });
        }
        return NextResponse.json({ error: "Failed to create bot" }, { status: 500 });
    }
}
