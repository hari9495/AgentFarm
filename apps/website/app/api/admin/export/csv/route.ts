
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, exportDatabaseAsCsv } from "@/lib/auth-store";

const COOKIE_NAME = "agentfarm_session";

const ALLOWED_TABLES = ["users", "bots", "company_audit_events", "approvals"] as const;
type AllowedTable = (typeof ALLOWED_TABLES)[number];

function isAllowedTable(value: unknown): value is AllowedTable {
    return ALLOWED_TABLES.includes(value as AllowedTable);
}

export async function GET(req: NextRequest) {
    const jar = await cookies();
    const token = jar.get(COOKIE_NAME)?.value;
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const user = await getSessionUser(token);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin" && user.role !== "superadmin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const table = req.nextUrl.searchParams.get("table");
    if (!isAllowedTable(table)) {
        return NextResponse.json(
            { error: `table must be one of: ${ALLOWED_TABLES.join(", ")}` },
            { status: 400 },
        );
    }

    const csv = await exportDatabaseAsCsv(table);
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const filename = `agentfarm-${table}-${ts}.csv`;

    return new NextResponse(csv, {
        status: 200,
        headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="${filename}"`,
            "Cache-Control": "no-store",
        },
    });
}

