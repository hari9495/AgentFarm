
import { NextResponse } from "next/server";

const API_GATEWAY_URL =
    process.env.API_GATEWAY_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://localhost:3000";

export async function POST(request: Request) {
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ received: true }, { status: 200 });
    }

    try {
        await fetch(`${API_GATEWAY_URL}/v1/billing/webhook/razorpay`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
    } catch {
        // best effort
    }

    return NextResponse.json({ received: true }, { status: 200 });
}

