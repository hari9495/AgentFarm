import { NextResponse } from "next/server";
import { GATEWAY_URL } from "../../_utils";

export async function GET(request: Request): Promise<NextResponse> {
    const { searchParams } = new URL(request.url);
    const email = searchParams.get("email") ?? "";

    const upstream = await fetch(
        `${GATEWAY_URL}/portal/auth/lookup-tenant?email=${encodeURIComponent(email)}`,
        { cache: "no-store" },
    );

    const data = (await upstream.json().catch(() => ({ tenants: [] }))) as Record<string, unknown>;
    return NextResponse.json(data, { status: upstream.status });
}
