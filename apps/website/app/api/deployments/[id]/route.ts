export const runtime = 'edge'

import { NextResponse } from "next/server";
import { cancelDeployment, getSessionUser, retryDeployment } from "@/lib/auth-store";

const COOKIE_NAME = "agentfarm_session";

type DeploymentActionPayload = {
    action?: "retry" | "cancel";
};

const getCookieValue = (cookieHeader: string | null, name: string): string | null => {
    if (!cookieHeader) return null;
    const cookie = cookieHeader
        .split(";")
        .map((part) => part.trim())
        .find((part) => part.startsWith(`${name}=`));
    if (!cookie) return null;
    return decodeURIComponent(cookie.slice(name.length + 1));
};

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
    const token = getCookieValue(request.headers.get("cookie"), COOKIE_NAME);
    if (!token) {
        return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const user = await getSessionUser(token);
    if (!user) {
        return NextResponse.json({ error: "Invalid or expired session." }, { status: 401 });
    }

    let payload: DeploymentActionPayload;
    try {
        payload = (await request.json()) as DeploymentActionPayload;
    } catch {
        return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }

    if (!payload.action || !["retry", "cancel"].includes(payload.action)) {
        return NextResponse.json({ error: "Action must be retry or cancel." }, { status: 400 });
    }

    const { id } = await context.params;

    if (payload.action === "cancel") {
        const result = await cancelDeployment({ userId: user.id, deploymentId: id, actorEmail: user.email });
        if (!result.ok) {
            if (result.error === "not_found") {
                return NextResponse.json({ error: "Deployment not found." }, { status: 404 });
            }
            return NextResponse.json({ error: "Only queued or running deployments can be canceled." }, { status: 409 });
        }

        return NextResponse.json({ status: "ok", action: "cancel", job: result.job });
    }

    const result = await retryDeployment({ userId: user.id, deploymentId: id, actorEmail: user.email });
    if (!result.ok) {
        if (result.error === "not_found") {
            return NextResponse.json({ error: "Deployment not found." }, { status: 404 });
        }
        return NextResponse.json({ error: "Only failed deployments can be retried." }, { status: 409 });
    }

    return NextResponse.json({ status: "ok", action: "retry", job: result.job });
}
