"use client";

import { useEffect, useState, Suspense, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { LayoutDashboard, Star, HeartHandshake } from "lucide-react";

type CsatInfo = { issueId: string; issueTitle: string; responded: boolean; rating: number | null };

const RATING_LABEL = ["", "Very poor", "Poor", "OK", "Good", "Excellent"];

function CsatForm() {
    const searchParams = useSearchParams();
    const token = searchParams.get("token") ?? "";

    const [info, setInfo] = useState<CsatInfo | null>(null);
    const [loadErr, setLoadErr] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [rating, setRating] = useState(0);
    const [comment, setComment] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [submitErr, setSubmitErr] = useState<string | null>(null);
    const [submitted, setSubmitted] = useState(false);

    useEffect(() => {
        if (!token) { setLoadErr("Missing survey token."); setLoading(false); return; }
        fetch(`/api/portal/csat/${encodeURIComponent(token)}`)
            .then(async (r) => {
                if (!r.ok) { setLoadErr("This survey link is invalid or has expired."); return; }
                const data = (await r.json()) as CsatInfo;
                setInfo(data);
                if (data.responded) setSubmitted(true);
            })
            .catch(() => setLoadErr("Unable to load the survey."))
            .finally(() => setLoading(false));
    }, [token]);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (rating === 0) return;
        setSubmitErr(null);
        setSubmitting(true);
        try {
            const res = await fetch("/api/portal/csat/respond", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token, rating, comment: comment.trim() || undefined }),
            });
            if (res.ok) { setSubmitted(true); return; }
            const b = (await res.json().catch(() => ({}))) as { error?: string };
            if (b.error === "already_responded") { setSubmitted(true); return; }
            setSubmitErr("Failed to submit. Please try again.");
        } catch {
            setSubmitErr("Unable to connect. Please try again.");
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) return <p className="text-center text-sm text-[color:var(--ink-muted)]">Loading…</p>;

    if (loadErr) {
        return (
            <div className="text-center space-y-3">
                <p className="text-sm text-[color:var(--danger)] dark:text-[color:var(--danger)]">{loadErr}</p>
                <Link href="/portal/support/history" className="text-sm text-[color:var(--accent)] hover:underline">← Back to history</Link>
            </div>
        );
    }

    if (submitted) {
        return (
            <div className="text-center space-y-3">
                <HeartHandshake className="h-10 w-10 text-[color:var(--warn)] mx-auto" />
                <h2 className="text-base font-bold text-[color:var(--ink)] dark:text-[color:var(--ink)]">Thank you for your feedback!</h2>
                <p className="text-sm text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)]">
                    {info?.rating != null ? `You rated this ${info.rating}/5.` : "Your feedback helps us improve."}
                </p>
                <Link href="/portal/support/history" className="inline-block text-sm font-semibold text-[color:var(--accent)] hover:underline">
                    ← View your tickets
                </Link>
            </div>
        );
    }

    return (
        <>
            {info && (
                <p className="text-center text-sm text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)] mb-6">
                    Ticket: <strong className="text-[color:var(--ink)] dark:text-[color:var(--ink)]">{info.issueTitle}</strong>
                </p>
            )}

            <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5">
                <div>
                    <p className="text-sm font-semibold text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)] mb-3 text-center">
                        How would you rate your support experience?
                    </p>
                    <div className="flex gap-2 justify-center">
                        {[1, 2, 3, 4, 5].map((n) => (
                            <button
                                key={n}
                                type="button"
                                onClick={() => setRating(n)}
                                title={`${n} star${n > 1 ? "s" : ""}`}
                                className={`h-12 w-12 rounded-full border-2 flex items-center justify-center transition-colors ${
                                    rating >= n
                                        ? "border-[color:color-mix(in_srgb,var(--warn)_40%,transparent)] bg-[color-mix(in_srgb,var(--warn)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--warn)_22%,transparent)]/30"
                                        : "border-[color:var(--line)] dark:border-[color:var(--line)] bg-[var(--card)] dark:bg-[var(--card)]"
                                }`}
                            >
                                <Star className={`h-5 w-5 ${rating >= n ? "fill-amber-400 text-[color:var(--warn)]" : "text-[color:var(--ink-muted)] dark:text-[color:var(--ink-soft)]"}`} />
                            </button>
                        ))}
                    </div>
                    {rating > 0 && (
                        <p className="text-center text-xs text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)] mt-2">{RATING_LABEL[rating]}</p>
                    )}
                </div>

                <div>
                    <label htmlFor="csat-comment" className="block text-xs font-medium text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)] mb-1.5">
                        Comments <span className="font-normal text-[color:var(--ink-muted)]">(optional)</span>
                    </label>
                    <textarea
                        id="csat-comment"
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        rows={3}
                        placeholder="What went well? What could be improved?"
                        className="w-full px-3 py-2 rounded-[3px] border border-[color:var(--line)] dark:border-[color:var(--line)] bg-[var(--bg-deep)] dark:bg-[var(--card)] text-sm text-[color:var(--ink)] dark:text-[color:var(--ink)] placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--accent)_40%,transparent)] focus:border-[color:color-mix(in_srgb,var(--accent)_40%,transparent)] transition resize-y"
                    />
                </div>

                {submitErr && <p className="text-sm text-[color:var(--danger)] dark:text-[color:var(--danger)]">{submitErr}</p>}

                <button
                    type="submit"
                    disabled={submitting || rating === 0}
                    className="w-full py-2.5 px-4 rounded-[3px] bg-[var(--accent)] hover:bg-[var(--accent)] disabled:bg-[var(--line)] disabled:text-[color:var(--ink-muted)] dark:disabled:bg-[var(--card)] text-white text-sm font-semibold shadow-sm transition-colors"
                >
                    {submitting ? "Submitting…" : "Submit feedback"}
                </button>
            </form>
        </>
    );
}

export default function CsatPage() {
    return (
        <Suspense fallback={null}>
            <div className="min-h-screen bg-[var(--bg-deep)] dark:bg-[var(--bg)] flex flex-col items-center justify-center px-4 py-10">
                <div className="w-full max-w-md">
                    <div className="flex flex-col items-center mb-8 gap-3">
                        <div className="h-12 w-12 rounded-[4px] bg-[var(--accent)] flex items-center justify-center shadow-lg shadow-blue-500/20">
                            <LayoutDashboard className="h-6 w-6 text-white" />
                        </div>
                        <div className="text-center">
                            <h1 className="text-2xl font-bold text-[color:var(--ink)] dark:text-[color:var(--ink)]">Support feedback</h1>
                            <p className="mt-1 text-sm text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)]">Your feedback helps us improve.</p>
                        </div>
                    </div>
                    <div className="bg-[var(--card)] dark:bg-[var(--card)] rounded-[4px] shadow-xl shadow-slate-900/5 border border-[color:var(--line)] dark:border-[color:var(--line)] p-8">
                        <CsatForm />
                    </div>
                </div>
            </div>
        </Suspense>
    );
}
