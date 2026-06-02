"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, LoaderCircle, X } from "lucide-react";

type Risk = "low" | "medium" | "high";

export type ApprovalItem = {
    id: string;
    title: string;
    risk: Risk;
    agent: string;
    reason: string;
    channel: string;
    age: string;
};

type Props = {
    approval: ApprovalItem | null;
    onClose: () => void;
    onApproved: (id: string) => void;
};

const riskStyles: Record<Risk, { badge: string; border: string; iconColor: string }> = {
    low: {
        badge: "text-emerald-700 bg-emerald-100 dark:text-emerald-300 dark:bg-emerald-900/40",
        border: "border-emerald-200 dark:border-emerald-800/60",
        iconColor: "text-emerald-500",
    },
    medium: {
        badge: "text-amber-700 bg-amber-100 dark:text-amber-300 dark:bg-amber-900/40",
        border: "border-amber-200 dark:border-amber-800/60",
        iconColor: "text-amber-500",
    },
    high: {
        badge: "text-rose-700 bg-rose-100 dark:text-rose-300 dark:bg-rose-900/40",
        border: "border-rose-200 dark:border-rose-800/60",
        iconColor: "text-rose-500",
    },
};

export default function QuickApproveModal({ approval, onClose, onApproved }: Props) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const dialogRef = useRef<HTMLDialogElement>(null);

    // Open / close the <dialog> element when `approval` changes
    useEffect(() => {
        const dialog = dialogRef.current;
        if (!dialog) return;
        if (approval) {
            setError(null);
            if (!dialog.open) dialog.showModal();
        } else {
            if (dialog.open) dialog.close();
        }
    }, [approval]);

    // Sync native dialog "close" (Escape key / programmatic) back to parent
    useEffect(() => {
        const dialog = dialogRef.current;
        if (!dialog) return;
        const handleClose = () => { setError(null); onClose(); };
        dialog.addEventListener("close", handleClose);
        return () => dialog.removeEventListener("close", handleClose);
    }, [onClose]);

    const handleApprove = async () => {
        if (!approval) return;
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/approvals/${approval.id}`, {
                method: "PATCH",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "approve" }),
            });
            if (!res.ok) {
                const body = (await res.json().catch(() => null)) as { error?: string } | null;
                throw new Error(body?.error ?? "Could not approve this request.");
            }
            onApproved(approval.id);
            dialogRef.current?.close();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Something went wrong.");
        } finally {
            setLoading(false);
        }
    };

    const styles = approval ? riskStyles[approval.risk] : riskStyles.low;

    return (
        // Always mounted so the ref is stable; content conditionally rendered inside
        <dialog
            ref={dialogRef}
            className="m-auto w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-0 shadow-[0_32px_64px_-12px_rgba(0,0,0,0.25)]"
            onClick={(e) => { if (e.target === dialogRef.current) dialogRef.current?.close(); }}
        >
            {approval && (
                <>
                    {/* ── Header ─────────────────────────────────────── */}
                    <div className={`px-6 py-4 border-b ${styles.border} flex items-start justify-between gap-3`}>
                        <div className="flex items-start gap-3 min-w-0">
                            <AlertTriangle className={`w-5 h-5 shrink-0 mt-0.5 ${styles.iconColor}`} />
                            <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className={`text-[11px] font-bold uppercase tracking-wide rounded-full px-2.5 py-0.5 ${styles.badge}`}>
                                        {approval.risk} risk
                                    </span>
                                    <span className="text-[11px] text-slate-400 dark:text-slate-500">{approval.age}</span>
                                </div>
                                <p className="mt-1.5 text-sm font-bold text-slate-900 dark:text-slate-100 leading-snug">
                                    {approval.title}
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={() => dialogRef.current?.close()}
                            aria-label="Close"
                            className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    {/* ── Body ───────────────────────────────────────── */}
                    <div className="px-6 py-5 space-y-4">
                        {/* Reason / context block */}
                        <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 px-4 py-3 space-y-1.5">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                                What the agent wants to do
                            </p>
                            <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                                {approval.reason}
                            </p>
                        </div>

                        {/* Agent + Channel meta */}
                        <div className="grid grid-cols-2 gap-3">
                            <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 px-4 py-3">
                                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">
                                    Agent
                                </p>
                                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{approval.agent}</p>
                            </div>
                            <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 px-4 py-3">
                                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">
                                    Channel
                                </p>
                                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{approval.channel}</p>
                            </div>
                        </div>

                        {/* Extra caution banner for HIGH risk */}
                        {approval.risk === "high" && (
                            <div className="rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/50 px-4 py-3 flex gap-2.5">
                                <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                                <p className="text-xs text-rose-700 dark:text-rose-300 leading-relaxed">
                                    This is a <strong>high-risk action</strong>. Review the context above carefully.
                                    This decision is audit-logged and cannot be undone.
                                </p>
                            </div>
                        )}

                        {/* Error */}
                        {error && (
                            <p className="rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/50 px-4 py-3 text-xs font-medium text-rose-700 dark:text-rose-300">
                                {error}
                            </p>
                        )}
                    </div>

                    {/* ── Footer ─────────────────────────────────────── */}
                    <div className="px-6 pb-5 flex gap-3">
                        <button
                            onClick={() => dialogRef.current?.close()}
                            disabled={loading}
                            className="flex-1 rounded-xl border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 text-sm font-semibold py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800 active:scale-[0.97] [transition:background-color_180ms_cubic-bezier(0.22,1,0.36,1),transform_120ms_cubic-bezier(0.22,1,0.36,1)] disabled:opacity-50"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={() => void handleApprove()}
                            disabled={loading}
                            className="flex-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.97] text-white text-sm font-bold py-2.5 [transition:background-color_180ms_cubic-bezier(0.22,1,0.36,1),transform_120ms_cubic-bezier(0.22,1,0.36,1)] shadow-sm shadow-emerald-500/20 disabled:opacity-60 inline-flex items-center justify-center gap-2"
                        >
                            {loading ? (
                                <>
                                    <LoaderCircle className="w-4 h-4 animate-spin" />
                                    Approving…
                                </>
                            ) : (
                                <>
                                    <CheckCircle2 className="w-4 h-4" />
                                    Confirm Approve
                                </>
                            )}
                        </button>
                    </div>
                </>
            )}
        </dialog>
    );
}
