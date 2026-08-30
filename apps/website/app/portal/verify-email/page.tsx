"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { LayoutDashboard, CheckCircle2, XCircle, Loader2 } from "lucide-react";

function VerifyEmailContent() {
    const searchParams = useSearchParams();
    const token = searchParams.get("token") ?? "";
    const [status, setStatus] = useState<"loading" | "success" | "already" | "error">("loading");

    useEffect(() => {
        if (!token) { setStatus("error"); return; }
        fetch(`/api/portal/auth/verify-email?token=${encodeURIComponent(token)}`)
            .then(async (r) => {
                if (!r.ok) { setStatus("error"); return; }
                const data = (await r.json()) as { ok: boolean; alreadyVerified?: boolean };
                setStatus(data.alreadyVerified ? "already" : "success");
            })
            .catch(() => setStatus("error"));
    }, [token]);

    if (status === "loading") {
        return (
            <div className="flex flex-col items-center gap-2 text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)]">
                <Loader2 className="h-6 w-6 animate-spin" />
                <p className="text-sm">Verifying your email…</p>
            </div>
        );
    }

    if (status === "error") {
        return (
            <div className="text-center space-y-3">
                <XCircle className="h-9 w-9 text-[color:var(--danger)] mx-auto" />
                <h2 className="text-base font-bold text-[color:var(--ink)] dark:text-[color:var(--ink)]">Verification failed</h2>
                <p className="text-sm text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)]">
                    This link is invalid or has already been used. Try requesting a new link from the login page.
                </p>
                <Link href="/portal/login" className="inline-block text-sm text-[color:var(--accent)] hover:underline">
                    Back to login
                </Link>
            </div>
        );
    }

    return (
        <div className="text-center space-y-3">
            <CheckCircle2 className="h-9 w-9 text-[color:var(--ok)] mx-auto" />
            <h2 className="text-base font-bold text-[color:var(--ink)] dark:text-[color:var(--ink)]">
                {status === "already" ? "Already verified" : "Email verified!"}
            </h2>
            <p className="text-sm text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)]">
                {status === "already"
                    ? "Your email address was already verified."
                    : "Your account is now active. You can sign in."}
            </p>
            <Link
                href="/portal/login?verified=1"
                className="inline-flex items-center justify-center gap-2 py-2 px-5 rounded-[3px] bg-[var(--accent)] hover:bg-[var(--accent)] text-white text-sm font-semibold shadow-sm transition-colors"
            >
                Sign in →
            </Link>
        </div>
    );
}

export default function VerifyEmailPage() {
    return (
        <Suspense fallback={null}>
            <div className="min-h-screen bg-[var(--bg-deep)] dark:bg-[var(--bg)] flex flex-col items-center justify-center px-4">
                <div className="w-full max-w-md">
                    <div className="flex flex-col items-center mb-8 gap-3">
                        <div className="h-12 w-12 rounded-[4px] bg-[var(--accent)] flex items-center justify-center shadow-lg shadow-blue-500/20">
                            <LayoutDashboard className="h-6 w-6 text-white" />
                        </div>
                        <h1 className="text-2xl font-bold text-[color:var(--ink)] dark:text-[color:var(--ink)]">AgentFarms Portal</h1>
                    </div>
                    <div className="bg-[var(--card)] dark:bg-[var(--card)] rounded-[4px] shadow-xl shadow-slate-900/5 border border-[color:var(--line)] dark:border-[color:var(--line)] p-8">
                        <VerifyEmailContent />
                    </div>
                </div>
            </div>
        </Suspense>
    );
}
