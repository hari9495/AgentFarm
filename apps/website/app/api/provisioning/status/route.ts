export const runtime = 'edge'

import { NextResponse } from "next/server";
import {
    autoProcessProvisioningForUser,
    getProvisioningEstimatedSecondsRemaining,
    getProvisioningSlaMetrics,
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

    const user = await getSessionUser(token);
    if (!user) {
        return NextResponse.json({ error: "Invalid or expired session." }, { status: 401 });
    }

    const now = Date.now();
    let autoProcessed = { processed: 0, completed: 0, failed: 0 };
    if (now - lastAutoTickAt >= AUTO_TICK_MIN_INTERVAL_MS) {
        lastAutoTickAt = now;
        autoProcessed = await autoProcessProvisioningForUser({
            userId: user.id,
            actorId: user.id,
            actorEmail: user.email,
        });
    }

    const { tenant, workspace, bot, provisioningJob } = await getProvisioningStatusForUser(user.id);
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
    const slaMetrics = provisioningJob
        ? getProvisioningSlaMetrics(provisioningJob)
        : null;

    const provisioningAlerts = [] as Array<{ level: "warning" | "critical"; code: string; message: string }>;
    if (slaMetrics?.isTimedOut) {
        provisioningAlerts.push({
            level: "critical",
            code: "provisioning_timeout_24h",
            message: "Provisioning exceeded 24 hours and requires immediate remediation.",
        });
    } else if (slaMetrics?.isStuck) {
        provisioningAlerts.push({
            level: "warning",
            code: "provisioning_stuck_1h",
            message: "Provisioning has been in progress for over 1 hour.",
        });
    }

    return NextResponse.json({
        status: "ok",
        tenant,
        workspace,
        bot,
        provisioningJob,
        provisioningTimeline,
        estimatedSecondsRemaining,
        slaMetrics,
        provisioningAlerts,
        autoProcessed,
    });
}

