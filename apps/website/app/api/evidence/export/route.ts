
import { NextResponse } from "next/server";
import { getPortalUserFromRequest } from "@/lib/portal-request-auth";
import { exportComplianceEvidencePack } from "@/lib/auth-store";

export const dynamic = 'force-dynamic';




const escapeCsv = (value: string): string => {
    const needsQuote = value.includes(",") || value.includes("\"") || value.includes("\n");
    if (!needsQuote) return value;
    return `"${value.replaceAll("\"", "\"\"")}"`;
};

export async function GET(request: Request) {
    const user = await getPortalUserFromRequest(request);
    if (!user) {
        return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const format = (searchParams.get("format") ?? "json").toLowerCase();

    const pack = await exportComplianceEvidencePack({
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

