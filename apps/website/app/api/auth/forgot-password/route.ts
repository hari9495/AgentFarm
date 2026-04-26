import { NextResponse } from "next/server";
import { findUserByEmail } from "@/lib/auth-store";

type ForgotPasswordPayload = {
    email?: string;
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
    let payload: ForgotPasswordPayload;

    try {
        payload = (await request.json()) as ForgotPasswordPayload;
    } catch {
        return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }

    const email = payload.email?.trim().toLowerCase() ?? "";

    if (!emailPattern.test(email)) {
        return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    }

    // Account lookup is persisted, but response stays generic to prevent user enumeration.
    findUserByEmail(email);

    return NextResponse.json({
        status: "ok",
        message: "If this account exists, a reset link has been sent.",
    });
}
