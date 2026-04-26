import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import {
    getSessionUser,
    isCompanyOperatorEmail,
    getCompanyIncidentById,
    assignCompanyIncident,
    updateCompanyIncidentSeverity,
    writeAuditEvent,
    type IncidentSeverity,
} from "@/lib/auth-store";
import { checkRateLimit } from "@/lib/rate-limit";

const COOKIE_NAME = "agentfarm_session";
const VALID_SEVERITIES: IncidentSeverity[] = ["low", "medium", "high", "critical"];

export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const { id } = await params;

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

    const { assigneeEmail, severity, reason } = body as Record<string, unknown>;

    if (!assigneeEmail && !severity) {
        return NextResponse.json({ error: "assigneeEmail or severity is required." }, { status: 422 });
    }

    if (typeof reason !== "string" || !reason.trim()) {
        return NextResponse.json({ error: "A reason is required for incident escalation." }, { status: 422 });
    }

    const before = getCompanyIncidentById(id);
    if (!before) return NextResponse.json({ error: "Incident not found." }, { status: 404 });

    const beforeState: Record<string, unknown> = {
        assigneeEmail: before.assigneeEmail,
        severity: before.severity,
    };
    const afterState: Record<string, unknown> = {
        assigneeEmail: before.assigneeEmail,
        severity: before.severity,
    };

    if (assigneeEmail !== undefined) {
        if (typeof assigneeEmail !== "string" || !assigneeEmail.trim()) {
            return NextResponse.json({ error: "assigneeEmail must be a non-empty string." }, { status: 422 });
        }
        const res = assignCompanyIncident(id, String(assigneeEmail));
        if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
        afterState.assigneeEmail = String(assigneeEmail).trim().toLowerCase();
    }

    if (severity !== undefined) {
        if (!VALID_SEVERITIES.includes(severity as IncidentSeverity)) {
            return NextResponse.json({ error: `Severity must be one of: ${VALID_SEVERITIES.join(", ")}.` }, { status: 422 });
        }
        const res = updateCompanyIncidentSeverity(id, severity as IncidentSeverity);
        if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
        afterState.severity = severity;
    }

    writeAuditEvent({
        actorId: user.id,
        actorEmail: user.email,
        action: "incident.escalate",
        targetType: "incident",
        targetId: id,
        tenantId: before.tenantId,
        beforeState,
        afterState,
        reason: String(reason).trim(),
    });

    // Emit critical alert audit event when severity escalated to critical
    if (severity === "critical" && before.severity !== "critical") {
        writeAuditEvent({
            actorId: "system",
            actorEmail: "system",
            action: "incident.critical_alert",
            targetType: "incident",
            targetId: id,
            tenantId: before.tenantId,
            beforeState: { severity: before.severity },
            afterState: { severity: "critical", title: before.title },
            reason: `CRITICAL: ${before.title} — escalated by ${user.email}. Configure AGENTFARM_NOTIFY_EMAILS for email delivery.`,
        });
    }

    return NextResponse.json({ ok: true });
}
