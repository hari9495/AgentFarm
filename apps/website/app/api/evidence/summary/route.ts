export const runtime = 'edge'

import { NextResponse } from "next/server";
import { getComplianceEvidenceSummary, getSessionUser } from "@/lib/auth-store";

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

export async function GET(request: Request) {
    const token = getCookieValue(request.headers.get("cookie"), COOKIE_NAME);
    if (!token) {
        return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const user = await getSessionUser(token);
    if (!user) {
        return NextResponse.json({ error: "Invalid or expired session." }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const windowHoursRaw = Number.parseInt(searchParams.get("windowHours") ?? "24", 10);
    const summary = await getComplianceEvidenceSummary({
        tenantId: user.tenantId ?? undefined,
        windowHours: Number.isFinite(windowHoursRaw) ? windowHoursRaw : 24,
    });

    return NextResponse.json({
        status: "ok",
        summary,
    });
}

