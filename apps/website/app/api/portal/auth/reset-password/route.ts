
import { NextResponse } from "next/server";
import { GATEWAY_URL } from "../../_utils";

export async function POST(request: Request): Promise<NextResponse> {
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }

    const upstream = await fetch(`${GATEWAY_URL}/portal/auth/reset-password`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });

    const data = (await upstream.json().catch(() => ({}))) as Record<string, unknown>;
    return NextResponse.json(data, { status: upstream.status });
}
