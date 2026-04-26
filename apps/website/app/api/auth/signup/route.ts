import { NextResponse } from "next/server";
import { createSession, createUser, findUserByEmail, initializeTenantWorkspaceAndBot } from "@/lib/auth-store";

type SignupPayload = {
    name?: string;
    company?: string;
    email?: string;
    password?: string;
    agreeToTerms?: boolean;
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const COOKIE_NAME = "agentfarm_session";

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

export async function POST(request: Request) {
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

    if (company.length < 2) {
        return NextResponse.json({ error: "Company must be at least 2 characters." }, { status: 400 });
    }

    if (!emailPattern.test(email)) {
        return NextResponse.json({ error: "Enter a valid work email." }, { status: 400 });
    }

    if (password.length < 8) {
        return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
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
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 8 * 60 * 60,
    });

    return response;
}
