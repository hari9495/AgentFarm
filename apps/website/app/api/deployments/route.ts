
import { NextResponse } from "next/server";
import { getPortalUserFromRequest } from "@/lib/portal-request-auth";
import { listDeploymentsForUser, requestDeployment } from "@/lib/auth-store";

type DeploymentPayload = {
    botSlug?: string;
    botName?: string;
};



export async function GET(request: Request) {
    const user = await getPortalUserFromRequest(request);
    if (!user) {
        return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limitParam = Number.parseInt(searchParams.get("limit") ?? "25", 10);
    const limit = Number.isNaN(limitParam) ? 25 : limitParam;
    const deployments = await listDeploymentsForUser(user.id, limit);

    return NextResponse.json({
        status: "ok",
        deployments,
    });
}

export async function POST(request: Request) {
    const user = await getPortalUserFromRequest(request);
    if (!user) {
        return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    let payload: DeploymentPayload;
    try {
        payload = (await request.json()) as DeploymentPayload;
    } catch {
        return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }

    const botSlug = payload.botSlug?.trim() ?? "";
    const botName = payload.botName?.trim() ?? "";

    if (botSlug.length < 3 || botName.length < 3) {
        return NextResponse.json({ error: "Bot slug and bot name are required." }, { status: 400 });
    }

    const deployment = await requestDeployment({
        userId: user.id,
        botSlug,
        botName,
        actorEmail: user.email,
    });

    if (!deployment.ok) {
        if (deployment.error === "onboarding_required") {
            return NextResponse.json(
                {
                    error: "Complete onboarding before requesting deployment.",
                    code: "onboarding_required",
                    redirectTo: `/onboarding?next=/marketplace/${encodeURIComponent(botSlug)}&reason=complete-onboarding-before-deploy`,
                },
                { status: 409 },
            );
        }

        return NextResponse.json(
            {
                error: "Please select the same starter agent in marketplace before deploying.",
                code: "missing_selection",
            },
            { status: 409 },
        );
    }

    return NextResponse.json({
        status: "ok",
        job: deployment.job,
    });
}

