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
            <div className="flex flex-col items-center gap-2 text-slate-400 dark:text-slate-500">
                <Loader2 className="h-6 w-6 animate-spin" />
                <p className="text-sm">Verifying your email…</p>
            </div>
        );
    }

    if (status === "error") {
        return (
            <div className="text-center space-y-3">
                <XCircle className="h-9 w-9 text-rose-500 mx-auto" />
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Verification failed</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                    This link is invalid or has already been used. Try requesting a new link from the login page.
                </p>
                <Link href="/portal/login" className="inline-block text-sm text-sky-600 hover:underline">
                    Back to login
                </Link>
            </div>
        );
    }

    return (
        <div className="text-center space-y-3">
            <CheckCircle2 className="h-9 w-9 text-emerald-500 mx-auto" />
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                {status === "already" ? "Already verified" : "Email verified!"}
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
                {status === "already"
                    ? "Your email address was already verified."
                    : "Your account is now active. You can sign in."}
            </p>
            <Link
                href="/portal/login?verified=1"
                className="inline-flex items-center justify-center gap-2 py-2 px-5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold shadow-sm transition-colors"
            >
                Sign in →
            </Link>
        </div>
    );
}

export default function VerifyEmailPage() {
    return (
        <Suspense fallback={null}>
            <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center px-4">
                <div className="w-full max-w-md">
                    <div className="flex flex-col items-center mb-8 gap-3">
                        <div className="h-12 w-12 rounded-2xl bg-sky-600 flex items-center justify-center shadow-lg shadow-sky-500/20">
                            <LayoutDashboard className="h-6 w-6 text-white" />
                        </div>
                        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">AgentFarms Portal</h1>
                    </div>
                    <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl shadow-slate-900/5 border border-slate-200 dark:border-slate-800 p-8">
                        <VerifyEmailContent />
                    </div>
                </div>
            </div>
        </Suspense>
    );
}
