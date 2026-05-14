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
        <section className="bg-[var(--surface)] border-y border-[var(--hairline)] py-16">
            <div className="max-w-2xl mx-auto px-4 sm:px-6 text-center">
                <span className="chip chip-accent">Stay in the loop</span>
                <h2 className="mt-4 text-2xl sm:text-3xl font-semibold tracking-[-0.03em] text-[var(--ink)] leading-tight">
                    Get AgentFarm product updates
                </h2>
                <p className="mt-3 text-[var(--mute)] max-w-md mx-auto">
                    New AI worker roles, integration launches, and performance guides — delivered monthly.
                </p>
                {submitted ? (
                    <div className="mt-8 inline-flex items-center gap-2 rounded-2xl bg-[var(--surface-card)] border border-[var(--hairline)] px-6 py-4 text-[var(--accent-green)] font-semibold">
                        <span className="w-2 h-2 rounded-full bg-[var(--accent-green)]" />
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
                            className="flex-1 rounded-xl border border-[var(--hairline)] bg-[var(--surface-card)] px-4 py-2.5 text-sm text-[var(--ink)] placeholder:text-[var(--ash)] outline-none focus:ring-2 focus:ring-[var(--accent-blue)]/40"
                        />
                        <button
                            type="submit"
                            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[var(--accent-blue)] hover:bg-[#8dd7ff] text-[#07080a] font-semibold text-sm px-5 py-2.5 transition-colors"
                        >
                            Subscribe <ArrowRight className="w-4 h-4" />
                        </button>
                    </form>
                )}
                <p className="mt-3 text-xs text-[var(--ash)]">No spam. Unsubscribe anytime.</p>
            </div>
        </section>
    );
}
