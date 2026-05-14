
import { NextResponse } from "next/server";
import { getSessionUser, listAuditEvents, writeAuditEvent } from "@/lib/auth-store";

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

type CreateAuditPayload = {
    action?: string;
    targetType?: string;
    targetId?: string;
    reason?: string;
    beforeState?: Record<string, unknown>;
    afterState?: Record<string, unknown>;
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
    const actorEmail = searchParams.get("actorEmail") ?? undefined;
    const action = searchParams.get("action") ?? undefined;
    const fromRaw = searchParams.get("from");
    const toRaw = searchParams.get("to");
    const limitRaw = Number.parseInt(searchParams.get("limit") ?? "100", 10);

    const fromDate = fromRaw ? new Date(fromRaw) : null;
    if (fromRaw && !Number.isFinite(fromDate?.getTime() ?? Number.NaN)) {
        return NextResponse.json({ error: "Invalid from timestamp." }, { status: 400 });
    }

    const toDate = toRaw ? new Date(toRaw) : null;
    if (toRaw && !Number.isFinite(toDate?.getTime() ?? Number.NaN)) {
        return NextResponse.json({ error: "Invalid to timestamp." }, { status: 400 });
    }

    const events = await listAuditEvents({
        actorEmail,
        action,
        tenantId: user.tenantId ?? undefined,
        sinceTs: fromDate ? fromDate.getTime() : undefined,
        untilTs: toDate ? toDate.getTime() : undefined,
        limit: Number.isFinite(limitRaw) ? limitRaw : 100,
    });

    return NextResponse.json({
        status: "ok",
        count: events.length,
        events,
    });
}

export async function POST(request: Request) {
    const token = getCookieValue(request.headers.get("cookie"), COOKIE_NAME);
    if (!token) {
        return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const user = await getSessionUser(token);
    if (!user) {
        return NextResponse.json({ error: "Invalid or expired session." }, { status: 401 });
    }

    let payload: CreateAuditPayload;
    try {
        payload = (await request.json()) as CreateAuditPayload;
    } catch {
        return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }

    const action = payload.action?.trim() ?? "";
    const targetType = payload.targetType?.trim() ?? "";
    const targetId = payload.targetId?.trim() ?? "";

    if (!action || !targetType || !targetId) {
        return NextResponse.json({ error: "action, targetType, and targetId are required." }, { status: 400 });
    }

    writeAuditEvent({
        actorId: user.id,
        actorEmail: user.email,
        action,
        targetType,
        targetId,
        tenantId: user.tenantId ?? "",
        beforeState: payload.beforeState,
        afterState: payload.afterState,
        reason: payload.reason,
    });

    return NextResponse.json({ status: "created" }, { status: 201 });
}

