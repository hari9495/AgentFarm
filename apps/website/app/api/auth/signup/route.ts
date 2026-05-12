import { NextResponse } from "next/server";
import { createSession, createUser, findUserByEmail, initializeTenantWorkspaceAndBot, updateUserGatewayIds } from "@/lib/auth-store";
import { checkAuthRateLimit } from "@/lib/rate-limit";

type SignupPayload = {
    name?: string;
    company?: string;
    email?: string;
    password?: string;
    agreeToTerms?: boolean;
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const COOKIE_NAME = "agentfarm_session";
const GATEWAY_COOKIE_NAME = "agentfarm_gateway_session";
const API_GATEWAY_URL = process.env.API_GATEWAY_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

const parseCsvEnv = (value: string | undefined): string[] => {
    if (!value) return [];
    return value
        .split(",")
        .map((part) => part.trim().toLowerCase())
        .filter(Boolean);
};

const adminEmailSet = new Set(parseCsvEnv(process.env.AGENTFARM_ADMIN_EMAILS));
const allowedEmailSet = new Set([
    ...parseCsvEnv(process.env.AGENTFARM_ALLOWED_SIGNUP_EMAILS),
    ...adminEmailSet,
]);
const allowedDomainSet = new Set(parseCsvEnv(process.env.AGENTFARM_ALLOWED_SIGNUP_DOMAINS));

const isAllowedSignupEmail = (email: string): boolean => {
    const normalized = email.trim().toLowerCase();
    if (!normalized) return false;
    if (allowedEmailSet.has(normalized)) return true;

    const domain = normalized.split("@")[1] ?? "";
    if (domain && allowedDomainSet.has(domain)) return true;

    return false;
};

function getClientIp(request: Request): string {
    return (
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
        request.headers.get("x-real-ip") ??
        "unknown"
    );
}

export async function POST(request: Request) {
    const ip = getClientIp(request);
    const rl = checkAuthRateLimit(`signup:${ip}`, 60 * 60 * 1000, 5);
    if (!rl.allowed) {
        return NextResponse.json(
            { error: "Too many signup attempts. Please wait before retrying." },
            { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } },
        );
    }

    let payload: SignupPayload;

    try {
        payload = (await request.json()) as SignupPayload;
    } catch {
        return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }

    const name = payload.name?.trim() ?? "";
    const company = payload.company?.trim() ?? "";
    const email = payload.email?.trim().toLowerCase() ?? "";
    const password = payload.password ?? "";
    const agreeToTerms = payload.agreeToTerms === true;

    if (name.length < 2) {
        return NextResponse.json({ error: "Name must be at least 2 characters." }, { status: 400 });
    }

    if (name.length > 100) {
        return NextResponse.json({ error: "Name must be 100 characters or fewer." }, { status: 400 });
    }

    if (company.length < 2) {
        return NextResponse.json({ error: "Company must be at least 2 characters." }, { status: 400 });
    }

    if (company.length > 100) {
        return NextResponse.json({ error: "Company must be 100 characters or fewer." }, { status: 400 });
    }

    if (email.length > 254) {
        return NextResponse.json({ error: "Email address is too long." }, { status: 400 });
    }

    if (!emailPattern.test(email)) {
        return NextResponse.json({ error: "Enter a valid work email." }, { status: 400 });
    }

    if (password.length < 8) {
        return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
    }

    if (password.length > 128) {
        return NextResponse.json({ error: "Password must be 128 characters or fewer." }, { status: 400 });
    }

    if (!agreeToTerms) {
        return NextResponse.json({ error: "You must accept terms to continue." }, { status: 400 });
    }

    if (!isAllowedSignupEmail(email)) {
        return NextResponse.json(
            {
                error: "Self-serve signup is restricted. Please book a sales call to request access.",
                redirectTo: "/book-demo",
            },
            { status: 403 },
        );
    }

    const existingUser = findUserByEmail(email);
    if (existingUser) {
        return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
    }

    const user = await createUser({
        name,
        company,
        email,
        password,
    });

    const { tenant, workspace } = initializeTenantWorkspaceAndBot({
        userId: user.id,
        tenantName: company,
    });

    // Attempt gateway signup to create Prisma-side records and obtain HMAC token.
    // Failure is non-fatal — the website signup is already committed.
    let gatewaySessionToken: string | null = null;
    try {
        const gwResponse = await fetch(`${API_GATEWAY_URL}/auth/signup`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ name, email, password, companyName: company }),
            cache: "no-store",
        });
        if (gwResponse.ok) {
            const gwBody = (await gwResponse.json()) as {
                token?: string;
                tenant_id?: string;
                workspace_id?: string;
                bot_id?: string;
            };
            if (
                typeof gwBody.token === "string" &&
                typeof gwBody.tenant_id === "string" &&
                typeof gwBody.workspace_id === "string" &&
                typeof gwBody.bot_id === "string"
            ) {
                gatewaySessionToken = gwBody.token;
                updateUserGatewayIds({
                    userId: user.id,
                    gatewayTenantId: gwBody.tenant_id,
                    gatewayWorkspaceId: gwBody.workspace_id,
                    gatewayBotId: gwBody.bot_id,
                    gatewayToken: gwBody.token,
                });
            }
        } else {
            console.error("[signup] Gateway signup returned", gwResponse.status, "— continuing without gateway IDs");
        }
    } catch (err) {
        console.error("[signup] Gateway signup call failed:", err);
    }

    const { sessionToken } = createSession(user.id);

    const response = NextResponse.json({
        status: "ok",
        user,
        tenantId: tenant.id,
        workspaceId: workspace.id,
        redirectTo: "/onboarding",
    });

    response.cookies.set({
        name: COOKIE_NAME,
        value: sessionToken,
        httpOnly: true,
        sameSite: "strict",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 8 * 60 * 60,
    });

    if (gatewaySessionToken) {
        response.cookies.set({
            name: GATEWAY_COOKIE_NAME,
            value: gatewaySessionToken,
            httpOnly: true,
            sameSite: "strict",
            secure: process.env.NODE_ENV === "production",
            path: "/",
            maxAge: 8 * 60 * 60,
        });
    }

    return response;
}
