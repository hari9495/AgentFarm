import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import {
    getSessionUser,
    isCompanyOperatorEmail,
    createCompanyTenant,
    createCompanyTenantBot,
    writeAuditEvent,
} from "@/lib/auth-store";
import { checkRateLimit } from "@/lib/rate-limit";

const COOKIE_NAME = "agentfarm_session";

const VALID_PLANS = ["starter", "growth", "enterprise"] as const;
const VALID_REGIONS = ["eastus", "westeurope", "southeastasia", "westus", "australiaeast"] as const;

export async function POST(req: NextRequest) {
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

    const { name, plan, region } = body as Record<string, unknown>;

    if (typeof name !== "string" || !name.trim()) {
        return NextResponse.json({ error: "Tenant name is required." }, { status: 422 });
    }
    if (name.trim().length > 80) {
        return NextResponse.json({ error: "Tenant name must be 80 characters or fewer." }, { status: 422 });
    }
    if (typeof plan !== "string" || !(VALID_PLANS as readonly string[]).includes(plan)) {
        return NextResponse.json({ error: `Plan must be one of: ${VALID_PLANS.join(", ")}.` }, { status: 422 });
    }
    if (typeof region !== "string" || !(VALID_REGIONS as readonly string[]).includes(region)) {
        return NextResponse.json({ error: `Region must be one of: ${VALID_REGIONS.join(", ")}.` }, { status: 422 });
    }

    const tenant = createCompanyTenant({ name: name.trim(), plan, region });

    // Auto-provision first bot (AI Backend Developer)
    const bot = createCompanyTenantBot({
        tenantId: tenant.id,
        botSlug: "ai-backend-developer",
        displayName: "Backend Worker",
    });

    writeAuditEvent({
        actorId: user.id,
        actorEmail: user.email,
        action: "tenant.provision",
        targetType: "tenant",
        targetId: tenant.id,
        tenantId: tenant.id,
        beforeState: {},
        afterState: { name: tenant.name, plan: tenant.plan, region: tenant.region, firstBotId: bot.id },
        reason: `Tenant provisioned from portal by ${user.email}`,
    });

    return NextResponse.json({ tenant, bot }, { status: 201 });
}
