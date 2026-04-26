import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import {
    getSessionUser,
    isCompanyOperatorEmail,
    getCompanyTenantById,
    getCompanyTenantFleetBots,
    getCompanyTenantIncidents,
} from "@/lib/auth-store";
import { checkRateLimit } from "@/lib/rate-limit";

const COOKIE_NAME = "agentfarm_session";

export async function GET(
    _req: NextRequest,
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

    const tenant = getCompanyTenantById(id);
    if (!tenant) return NextResponse.json({ error: "Tenant not found." }, { status: 404 });

    const fleet = getCompanyTenantFleetBots(id);
    const incidents = getCompanyTenantIncidents(id);

    return NextResponse.json({ tenant, fleet, incidents });
}
