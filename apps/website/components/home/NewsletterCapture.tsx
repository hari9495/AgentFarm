"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";

export default function NewsletterCapture() {
    const [email, setEmail] = useState("");
    const [submitted, setSubmitted] = useState(false);

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (email.trim()) setSubmitted(true);
    }

    return (
        <section className="bg-slate-50 dark:bg-slate-900 border-y border-slate-200 dark:border-slate-800 py-16">
            <div className="max-w-2xl mx-auto px-4 sm:px-6 text-center">
                <p className="text-xs font-semibold uppercase tracking-widest text-sky-600 dark:text-sky-400 mb-3">
                    Stay in the loop
                </p>
                <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-slate-100 leading-tight">
                    Get AgentFarm product updates
                </h2>
                <p className="mt-3 text-slate-600 dark:text-slate-400 max-w-md mx-auto">
                    New AI worker roles, integration launches, and performance guides — delivered monthly.
                </p>
                {submitted ? (
                    <div className="mt-8 inline-flex items-center gap-2 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/50 px-6 py-4 text-emerald-700 dark:text-emerald-300 font-semibold">
                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                        You&apos;re on the list! We&apos;ll be in touch.
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="mt-8 flex flex-col sm:flex-row gap-2 max-w-md mx-auto">
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            placeholder="you@company.com"
                            className="flex-1 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-sky-500"
                        />
                        <button
                            type="submit"
                            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-semibold text-sm px-5 py-2.5 transition-colors"
                        >
                            Subscribe <ArrowRight className="w-4 h-4" />
                        </button>
                    </form>
                )}
                <p className="mt-3 text-xs text-slate-400">No spam. Unsubscribe anytime.</p>
            </div>
        </section>
    );
}
