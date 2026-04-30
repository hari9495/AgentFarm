import { NextResponse } from "next/server";
import { exportComplianceEvidencePack, getSessionUser } from "@/lib/auth-store";

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

const escapeCsv = (value: string): string => {
    const needsQuote = value.includes(",") || value.includes("\"") || value.includes("\n");
    if (!needsQuote) return value;
    return `"${value.replaceAll("\"", "\"\"")}"`;
};

export async function GET(request: Request) {
    const token = getCookieValue(request.headers.get("cookie"), COOKIE_NAME);
    if (!token) {
        return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const user = getSessionUser(token);
    if (!user) {
        return NextResponse.json({ error: "Invalid or expired session." }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const format = (searchParams.get("format") ?? "json").toLowerCase();

    const pack = exportComplianceEvidencePack({
        tenantId: user.tenantId ?? undefined,
    });

    if (format === "csv") {
        const lines: string[] = [];
        lines.push("section,id,timestamp,field_1,field_2,field_3,field_4,field_5");

        for (const approval of pack.approvals) {
            lines.push([
                "approval",
                approval.id,
                new Date(approval.createdAt).toISOString(),
                approval.status,
                approval.risk,
                String(approval.decisionLatencySeconds ?? ""),
                approval.agent,
                approval.reason,
            ].map(escapeCsv).join(","));
        }

        for (const event of pack.auditEvents) {
            lines.push([
                "audit_event",
                event.id,
                new Date(event.createdAt).toISOString(),
                event.action,
                event.actorEmail,
                event.targetType,
                event.targetId,
                event.reason,
            ].map(escapeCsv).join(","));
        }

        return new NextResponse(`${lines.join("\n")}\n`, {
            status: 200,
            headers: {
                "content-type": "text/csv; charset=utf-8",
                "content-disposition": `attachment; filename=agentfarm-compliance-evidence-${Date.now()}.csv`,
            },
        });
    }

    return NextResponse.json({
        status: "ok",
        pack,
    });
}
