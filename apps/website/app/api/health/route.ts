
import { NextResponse } from "next/server";

/**
 * Public health check â€” returns 200 with minimal status info.
 * Suitable for uptime monitors (UptimeRobot, BetterStack, etc.).
 * No sensitive internal state is exposed here.
 */
export function GET() {
    return NextResponse.json(
        {
            status: "ok",
            service: "website",
            ts: new Date().toISOString(),
        },
        { status: 200 },
    );
}

