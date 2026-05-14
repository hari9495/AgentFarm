
import { NextResponse } from "next/server";
import { completeOnboarding, getSessionUser } from "@/lib/auth-store";

type OnboardingPayload = {
    githubOrg?: string;
    inviteEmail?: string;
    starterAgent?: string;
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const COOKIE_NAME = "agentfarm_session";
const allowedAgents = new Set([
    "ai-backend-developer",
    "ai-qa-engineer",
    "ai-devops-engineer",
    "ai-security-engineer",
]);

const getCookieValue = (cookieHeader: string | null, name: string): string | null => {
    if (!cookieHeader) return null;
    const cookie = cookieHeader
        .split(";")
        .map((part) => part.trim())
        .find((part) => part.startsWith(`${name}=`));
    if (!cookie) return null;
    return decodeURIComponent(cookie.slice(name.length + 1));
};

export async function POST(request: Request) {
    let payload: OnboardingPayload;

    try {
        payload = (await request.json()) as OnboardingPayload;
    } catch {
        return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }

    const githubOrg = payload.githubOrg?.trim() ?? "";
    const inviteEmail = payload.inviteEmail?.trim().toLowerCase() ?? "";
    const starterAgent = payload.starterAgent?.trim() ?? "";

    if (githubOrg.length < 2) {
        return NextResponse.json({ error: "GitHub organization is required." }, { status: 400 });
    }

    if (githubOrg.length > 64) {
        return NextResponse.json({ error: "GitHub organization must be 64 characters or fewer." }, { status: 400 });
    }

    if (inviteEmail.length > 254) {
        return NextResponse.json({ error: "Invite email is too long." }, { status: 400 });
    }

    if (!emailPattern.test(inviteEmail)) {
        return NextResponse.json({ error: "Invite email is invalid." }, { status: 400 });
    }

    if (!allowedAgents.has(starterAgent)) {
        return NextResponse.json({ error: "Invalid starter agent selection." }, { status: 400 });
    }

    const sessionToken = getCookieValue(request.headers.get("cookie"), COOKIE_NAME);
    if (!sessionToken) {
        return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const user = await getSessionUser(sessionToken);
    if (!user) {
        return NextResponse.json({ error: "Invalid or expired session." }, { status: 401 });
    }

    completeOnboarding({
        userId: user.id,
        githubOrg,
        inviteEmail,
        starterAgent,
    });

    const runId = `onb_${Date.now().toString(36)}`;

    return NextResponse.json({
        status: "ok",
        runId,
        message: "Onboarding completed. Your first agent is deploying.",
        redirectTo: "/dashboard",
    });
}

