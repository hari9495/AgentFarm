"use client";

import Link from "next/link";
import { Check } from "lucide-react";

export default function BillingSuccessPage() {
    return (
        <div className="relative min-h-screen flex items-center justify-center px-4 overflow-hidden" style={{ background: "var(--op-paper-2)", color: "var(--op-ink)" }}>
            <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(45% 40% at 50% 0%, var(--op-approved-soft), transparent 70%)" }} />

            <div className="relative op-rise w-full max-w-md text-center">
                <div className="mx-auto mb-6 flex items-center justify-center w-16 h-16 rounded-full" style={{ background: "var(--op-approved-soft)" }}>
                    <Check className="w-8 h-8" style={{ color: "var(--op-approved)" }} strokeWidth={2.5} />
                </div>

                <h1 className="font-display font-bold" style={{ fontSize: "2rem", letterSpacing: "-0.02em", lineHeight: 1.1 }}>
                    Payment successful
                </h1>

                <p className="mt-3 text-[1.0625rem] leading-relaxed max-w-sm mx-auto" style={{ color: "var(--op-muted)" }}>
                    Your contract will be sent to your email shortly.
                </p>

                <div className="mt-8">
                    <Link
                        href="/admin"
                        className="inline-flex items-center justify-center gap-2 rounded-lg px-8 py-3 text-[14px] font-semibold text-white shadow-sm transition-transform hover:-translate-y-0.5"
                        style={{ background: "var(--op-indigo)" }}
                    >
                        Go to dashboard
                    </Link>
                </div>
            </div>
        </div>
    );
}
