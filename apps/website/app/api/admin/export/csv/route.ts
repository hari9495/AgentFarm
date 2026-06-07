
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, exportDatabaseAsCsv, isTenantScopedExportTable } from "@/lib/auth-store";

const COOKIE_NAME = "agentfarm_session";

// Tables an org admin may export — restricted to tenant-scoped, customer-owned
// data. See lib/auth-store.ts (TENANT_SCOPED_EXPORT_TABLES) for the full set
// and the security rationale; this is a UI-facing subset of it.
const ALLOWED_TABLES = ["users", "approvals", "tenant_bots"] as const;
type AllowedTable = (typeof ALLOWED_TABLES)[number];

function isAllowedTable(value: unknown): value is AllowedTable {
    return ALLOWED_TABLES.includes(value as AllowedTable) && isTenantScopedExportTable(value);
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
    // Org-admin exports are scoped to the caller's own tenant — never accept
    // a tenant id from the request, and untenanted callers get nothing rather
    // than an unscoped/global dump.
    if (!user.tenantId) {
        return NextResponse.json({ error: "No workspace to export" }, { status: 400 });
    }

    const table = req.nextUrl.searchParams.get("table");
    if (!isAllowedTable(table)) {
        return NextResponse.json(
            { error: `table must be one of: ${ALLOWED_TABLES.join(", ")}` },
            { status: 400 },
        );
    }

    const csv = await exportDatabaseAsCsv(table, user.tenantId);
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

