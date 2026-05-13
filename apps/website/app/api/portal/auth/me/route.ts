export const runtime = 'edge'

import { NextResponse } from "next/server";
import { GATEWAY_URL } from "../../_utils";

export async function GET(request: Request): Promise<NextResponse> {
    const cookie = request.headers.get("cookie") ?? "";

    const upstream = await fetch(`${GATEWAY_URL}/portal/auth/me`, {
        headers: { cookie },
        cache: "no-store",
    });

    const data = (await upstream.json().catch(() => ({}))) as Record<string, unknown>;
    return NextResponse.json(data, { status: upstream.status });
}

