
import { NextResponse } from "next/server";
import { getPortalUserFromRequest } from "@/lib/portal-request-auth";
import { completeOnboarding } from "@/lib/auth-store";

type OnboardingPayload = {
    githubOrg?: string;
    inviteEmail?: string;
    starterAgent?: string;
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const allowedAgents = new Set([
    "ai-backend-developer",
    "ai-qa-engineer",
    "ai-devops-engineer",
    "ai-security-engineer",
]);

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

    const user = await getPortalUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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

