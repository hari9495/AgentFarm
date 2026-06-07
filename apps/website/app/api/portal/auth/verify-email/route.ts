
import { NextResponse } from "next/server";
import { GATEWAY_URL } from "../../_utils";

export async function GET(request: Request): Promise<NextResponse> {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token") ?? "";

    const upstream = await fetch(
        `${GATEWAY_URL}/portal/auth/verify-email?token=${encodeURIComponent(token)}`,
        { cache: "no-store" },
    );

    const data = (await upstream.json().catch(() => ({}))) as Record<string, unknown>;
    return NextResponse.json(data, { status: upstream.status });
}
