export const runtime = 'edge'

import { NextResponse } from "next/server";

type QuickStartPayload = {
    name?: string;
    email?: string;
    company?: string;
    notes?: string;
    bots?: Array<{
        slug?: string;
        name?: string;
        price?: string;
    }>;
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
    let payload: QuickStartPayload;

    try {
        payload = (await request.json()) as QuickStartPayload;
    } catch {
        return NextResponse.json(
            { error: "Invalid request body." },
            { status: 400 },
        );
    }

    const name = payload.name?.trim() ?? "";
    const email = payload.email?.trim() ?? "";
    const company = payload.company?.trim() ?? "";
    const notes = payload.notes?.trim() ?? "";
    const bots = Array.isArray(payload.bots) ? payload.bots.filter(Boolean) : [];

    if (name.length < 2) {
        return NextResponse.json(
            { error: "Name must be at least 2 characters." },
            { status: 400 },
        );
    }

    if (!emailPattern.test(email)) {
        return NextResponse.json(
            { error: "Email address is invalid." },
            { status: 400 },
        );
    }

    if (company.length < 2) {
        return NextResponse.json(
            { error: "Company must be at least 2 characters." },
            { status: 400 },
        );
    }

    if (bots.length === 0) {
        return NextResponse.json(
            { error: "Select at least one bot to start onboarding." },
            { status: 400 },
        );
    }

    const requestId = `qs_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    return NextResponse.json({
        requestId,
        status: "accepted",
        message: "Quick-start onboarding request submitted.",
        summary: {
            requester: { name, email, company },
            selectedBots: bots.map((bot) => ({
                slug: bot.slug ?? "",
                name: bot.name ?? "",
                price: bot.price ?? "",
            })),
            notes,
            submittedAt: new Date().toISOString(),
        },
    });
}

