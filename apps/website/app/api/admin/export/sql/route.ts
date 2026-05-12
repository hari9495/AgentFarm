import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSessionUser, exportSqlDump } from "@/lib/auth-store";

const COOKIE_NAME = "agentfarm_session";

export async function GET() {
    const jar = await cookies();
    const token = jar.get(COOKIE_NAME)?.value;
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const user = getSessionUser(token);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin" && user.role !== "superadmin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const sql = exportSqlDump();
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const filename = `agentfarm-backup-${ts}.sql`;

    return new NextResponse(sql, {
        status: 200,
        headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Content-Disposition": `attachment; filename="${filename}"`,
            "Cache-Control": "no-store",
        },
    });
}
