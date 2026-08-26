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

    if (loading) return <p className="text-center text-sm text-slate-400">Loading…</p>;

    if (loadErr) {
        return (
            <div className="text-center space-y-3">
                <p className="text-sm text-rose-600 dark:text-rose-400">{loadErr}</p>
                <Link href="/portal/support/history" className="text-sm text-blue-600 hover:underline">← Back to history</Link>
            </div>
        );
    }

    if (submitted) {
        return (
            <div className="text-center space-y-3">
                <HeartHandshake className="h-10 w-10 text-amber-500 mx-auto" />
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Thank you for your feedback!</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                    {info?.rating != null ? `You rated this ${info.rating}/5.` : "Your feedback helps us improve."}
                </p>
                <Link href="/portal/support/history" className="inline-block text-sm font-semibold text-blue-600 hover:underline">
                    ← View your tickets
                </Link>
            </div>
        );
    }

    return (
        <>
            {info && (
                <p className="text-center text-sm text-slate-500 dark:text-slate-400 mb-6">
                    Ticket: <strong className="text-slate-900 dark:text-slate-100">{info.issueTitle}</strong>
                </p>
            )}

            <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5">
                <div>
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3 text-center">
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
                                        ? "border-amber-400 bg-amber-50 dark:bg-amber-950/30"
                                        : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                                }`}
                            >
                                <Star className={`h-5 w-5 ${rating >= n ? "fill-amber-400 text-amber-400" : "text-slate-300 dark:text-slate-600"}`} />
                            </button>
                        ))}
                    </div>
                    {rating > 0 && (
                        <p className="text-center text-xs text-slate-400 dark:text-slate-500 mt-2">{RATING_LABEL[rating]}</p>
                    )}
                </div>

                <div>
                    <label htmlFor="csat-comment" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                        Comments <span className="font-normal text-slate-400">(optional)</span>
                    </label>
                    <textarea
                        id="csat-comment"
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        rows={3}
                        placeholder="What went well? What could be improved?"
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition resize-y"
                    />
                </div>

                {submitErr && <p className="text-sm text-rose-600 dark:text-rose-400">{submitErr}</p>}

                <button
                    type="submit"
                    disabled={submitting || rating === 0}
                    className="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 dark:disabled:bg-slate-800 text-white text-sm font-semibold shadow-sm transition-colors"
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
            <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center px-4 py-10">
                <div className="w-full max-w-md">
                    <div className="flex flex-col items-center mb-8 gap-3">
                        <div className="h-12 w-12 rounded-2xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
                            <LayoutDashboard className="h-6 w-6 text-white" />
                        </div>
                        <div className="text-center">
                            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Support feedback</h1>
                            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Your feedback helps us improve.</p>
                        </div>
                    </div>
                    <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl shadow-slate-900/5 border border-slate-200 dark:border-slate-800 p-8">
                        <CsatForm />
                    </div>
                </div>
            </div>
        </Suspense>
    );
}
