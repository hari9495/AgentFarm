export const runtime = 'edge'

import { NextResponse } from "next/server";

const API_GATEWAY_URL =
    process.env.API_GATEWAY_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://localhost:3000";

export async function GET() {
    try {
        const res = await fetch(`${API_GATEWAY_URL}/v1/billing/plans`, {
            cache: "no-store",
        });
        const data: unknown = await res.json();
        return NextResponse.json(data, { status: res.status });
    } catch {
        return NextResponse.json({ error: "Gateway unavailable." }, { status: 500 });
    }
}

