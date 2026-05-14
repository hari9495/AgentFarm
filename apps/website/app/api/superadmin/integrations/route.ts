
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSessionUser, isCompanyOperatorEmail, listCompanyIntegrations } from "@/lib/auth-store";

const COOKIE_NAME = "agentfarm_session";

export async function GET() {
    const jar = await cookies();
    const token = jar.get(COOKIE_NAME)?.value;
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const user = await getSessionUser(token);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!isCompanyOperatorEmail(user.email)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    return NextResponse.json({ integrations: listCompanyIntegrations() });
}

