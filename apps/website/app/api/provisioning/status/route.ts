import { NextResponse } from "next/server";
import {
    autoProcessProvisioningForUser,
    getProvisioningEstimatedSecondsRemaining,
    getProvisioningStatusForUser,
    getProvisioningTimelineForJob,
    getSessionUser,
} from "@/lib/auth-store";

const COOKIE_NAME = "agentfarm_session";
const AUTO_TICK_MIN_INTERVAL_MS = 1500;
let lastAutoTickAt = 0;

const getCookieValue = (cookieHeader: string | null, name: string): string | null => {
    if (!cookieHeader) return null;
    const cookie = cookieHeader
        .split(";")
        .map((part) => part.trim())
        .find((part) => part.startsWith(`${name}=`));
    if (!cookie) return null;
    return decodeURIComponent(cookie.slice(name.length + 1));
};

export async function GET(request: Request) {
    const token = getCookieValue(request.headers.get("cookie"), COOKIE_NAME);
    if (!token) {
        return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const user = getSessionUser(token);
    if (!user) {
        return NextResponse.json({ error: "Invalid or expired session." }, { status: 401 });
    }

    const now = Date.now();
    let autoProcessed = { processed: 0, completed: 0, failed: 0 };
    if (now - lastAutoTickAt >= AUTO_TICK_MIN_INTERVAL_MS) {
        lastAutoTickAt = now;
        autoProcessed = autoProcessProvisioningForUser({
            userId: user.id,
            actorId: user.id,
            actorEmail: user.email,
        });
    }

    const { tenant, workspace, bot, provisioningJob } = getProvisioningStatusForUser(user.id);
    const provisioningTimeline = provisioningJob && user.tenantId
        ? getProvisioningTimelineForJob({
            tenantId: user.tenantId,
            jobId: provisioningJob.id,
            createdAt: provisioningJob.createdAt,
            currentStatus: provisioningJob.status,
            updatedAt: provisioningJob.updatedAt,
        })
        : [];
    const estimatedSecondsRemaining = provisioningJob
        ? getProvisioningEstimatedSecondsRemaining(provisioningJob.status)
        : null;

    return NextResponse.json({
        status: "ok",
        tenant,
        workspace,
        bot,
        provisioningJob,
        provisioningTimeline,
        estimatedSecondsRemaining,
        autoProcessed,
    });
}
