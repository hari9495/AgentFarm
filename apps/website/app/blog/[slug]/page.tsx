
import { NextRequest, NextResponse } from 'next/server';

const GATEWAY_URL =
    process.env.API_GATEWAY_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    'http://localhost:3000';

export async function POST(request: NextRequest) {
    let body: string;
    try {
        body = await request.text();
    } catch {
        return NextResponse.json({ error: 'Failed to read request body' }, { status: 400 });
    }

    const webhookToken = process.env.ZOHO_SIGN_WEBHOOK_TOKEN ?? '';

    let res: Response;
    try {
        res = await fetch(`${GATEWAY_URL}/v1/webhooks/zoho-sign`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-zoho-webhook-token': webhookToken,
            },
            body,
        });
    } catch {
        return NextResponse.json({ error: 'Gateway unreachable' }, { status: 502 });
    }

    let data: unknown;
    try {
        data = await res.json();
    } catch {
        data = {};
    }

    return NextResponse.json(data, { status: res.status });
}
