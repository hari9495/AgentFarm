"use client";

import Link from "next/link";

export default function BillingSuccessPage() {
    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 flex items-center justify-center px-4">
            <div className="w-full max-w-md text-center">

                {/* Checkmark */}
                <div className="mx-auto mb-6 flex items-center justify-center w-20 h-20 rounded-full bg-emerald-100 dark:bg-emerald-900/40">
                    <svg
                        className="w-10 h-10 text-emerald-600 dark:text-emerald-400"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2.5}
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                </div>

                <h1 className="text-3xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
                    Payment successful!
                </h1>

                <p className="mt-3 text-slate-500 dark:text-slate-400 text-base leading-relaxed max-w-sm mx-auto">
                    Your contract will be sent to your email shortly.
                </p>

                <div className="mt-8">
                    <Link
                        href="/admin"
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-8 py-3.5 text-sm transition-colors"
                    >
                        Go to Dashboard
                    </Link>
                </div>

            </div>
        </div>
    );
}
