
import { NextResponse } from "next/server";
import { getPortalUserFromRequest } from "@/lib/portal-request-auth";
import { listAuditEvents, writeAuditEvent } from "@/lib/auth-store";



type CreateAuditPayload = {
    action?: string;
    targetType?: string;
    targetId?: string;
    reason?: string;
    beforeState?: Record<string, unknown>;
    afterState?: Record<string, unknown>;
};

export async function GET(request: Request) {
    const user = await getPortalUserFromRequest(request);
    if (!user) {
        return NextResponse.json({ error: "Authentication required." }, { status: 401 });
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

    // Scope strictly to this tenant. Users not yet attached to a tenant have no
    // shared log to scope to — fall back to their own actions only, never an
    // unscoped query (which would otherwise leak every tenant's audit events).
    const events = await listAuditEvents(
        user.tenantId
            ? {
                  actorEmail,
                  action,
                  tenantId: user.tenantId,
                  sinceTs: fromDate ? fromDate.getTime() : undefined,
                  untilTs: toDate ? toDate.getTime() : undefined,
                  limit: Number.isFinite(limitRaw) ? limitRaw : 100,
              }
            : {
                  actorEmail: actorEmail ?? user.email,
                  action,
                  sinceTs: fromDate ? fromDate.getTime() : undefined,
                  untilTs: toDate ? toDate.getTime() : undefined,
                  limit: Number.isFinite(limitRaw) ? limitRaw : 100,
              },
    );

    return NextResponse.json({
        status: "ok",
        count: events.length,
        events,
    });
}

export async function POST(request: Request) {
    const user = await getPortalUserFromRequest(request);
    if (!user) {
        return NextResponse.json({ error: "Authentication required." }, { status: 401 });
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

