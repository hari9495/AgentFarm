export const runtime = 'edge'

import { NextResponse } from "next/server";

const API_GATEWAY_URL =
    process.env.API_GATEWAY_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://localhost:3000";

export async function POST(request: Request) {
    const rawBody = await request.text();
    const signature = request.headers.get("stripe-signature") ?? "";

    try {
        await fetch(`${API_GATEWAY_URL}/v1/billing/webhook/stripe`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "stripe-signature": signature,
            },
            body: rawBody,
        });
    } catch {
        // best effort — always return 200 to Stripe
    }

    return NextResponse.json({ received: true }, { status: 200 });
}
