"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import ButtonLink from "@/components/shared/ButtonLink";
import QuickApproveModal, { type ApprovalItem } from "./QuickApproveModal";

type Risk = "low" | "medium" | "high";

type Approval = {
    id: string;
    title: string;
    agent: string;
    channel: string;
    reason: string;
    risk: Risk;
    createdAt: number;
};

const fromNow = (ts: number): string => {
    const mins = Math.max(1, Math.floor((Date.now() - ts) / 60_000));
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
};

const riskBadge: Record<Risk, string> = {
    low: "text-[color:var(--ok)] bg-[color-mix(in_srgb,var(--ok)_10%,transparent)] dark:text-[color:var(--ok)] dark:bg-[color-mix(in_srgb,var(--ok)_22%,transparent)]/40",
    medium: "text-[color:var(--warn)] bg-[color-mix(in_srgb,var(--warn)_10%,transparent)] dark:text-[color:var(--warn)] dark:bg-[color-mix(in_srgb,var(--warn)_22%,transparent)]/40",
    high: "text-[color:var(--danger)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] dark:text-[color:var(--danger)] dark:bg-[color-mix(in_srgb,var(--danger)_22%,transparent)]/40",
};

function Skeleton() {
    return (
        <div className="rounded-[3px] border border-[color:var(--line)] dark:border-[color:var(--line)]/80 bg-[var(--bg-deep)] dark:bg-[var(--card)]/50 p-4 animate-pulse space-y-2">
            <div className="h-3 w-16 rounded bg-[var(--line)] dark:bg-[var(--card)]" />
            <div className="h-4 w-3/4 rounded bg-[var(--line)] dark:bg-[var(--card)]" />
            <div className="h-3 w-1/2 rounded bg-[var(--line)] dark:bg-[var(--card)]" />
            <div className="h-8 rounded-[3px] bg-[var(--line)] dark:bg-[var(--card)] mt-2" />
        </div>
    );
}

export default function OverviewApprovalQueue() {
    const [items, setItems] = useState<Approval[]>([]);
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState<ApprovalItem | null>(null);
    const [flash, setFlash] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/approvals?status=pending&limit=3", {
                credentials: "include",
            });
            if (!res.ok) return;
            const body = (await res.json()) as { approvals: Approval[] };
            setItems(body.approvals ?? []);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { void load(); }, [load]);

    const openModal = (item: Approval) => {
        setSelected({
            id: item.id,
            title: item.title,
            risk: item.risk,
            agent: item.agent,
            reason: item.reason,
            channel: item.channel,
            age: fromNow(item.createdAt),
        });
    };

    const handleApproved = (id: string) => {
        setItems((prev) => prev.filter((a) => a.id !== id));
        setFlash("Approved — decision audit-logged.");
        setTimeout(() => setFlash(null), 2500);
    };

    return (
        <>
            {/* ── Queue card ───────────────────────────────────────── */}
            <div className="rounded-[4px] border border-[color:var(--line)] dark:border-[color:var(--line)] bg-[var(--card)] dark:bg-[var(--card)] overflow-hidden shadow-sm">
                {/* Header */}
                <div className="px-5 py-4 border-b border-[color:var(--line)] dark:border-[color:var(--line)] bg-[var(--bg-deep)]/50 dark:bg-[var(--card)]/30 flex items-center justify-between">
                    <h2 className="text-sm font-bold text-[color:var(--ink)] dark:text-[color:var(--ink)]">Approval Queue</h2>
                    {!loading && items.length > 0 && (
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[var(--danger)] text-white text-xs font-extrabold shadow-sm shadow-rose-500/30">
                            {items.length}
                        </span>
                    )}
                </div>

                <div className="p-4 space-y-3">
                    {/* Success flash */}
                    {flash && (
                        <div className="rounded-[3px] bg-[color-mix(in_srgb,var(--ok)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--ok)_22%,transparent)]/30 border border-[color:color-mix(in_srgb,var(--ok)_40%,transparent)] dark:border-[color:color-mix(in_srgb,var(--ok)_40%,transparent)]/50 px-4 py-2.5 text-xs font-semibold text-[color:var(--ok)] dark:text-[color:var(--ok)]">
                            ✓ {flash}
                        </div>
                    )}

                    {/* Loading skeletons */}
                    {loading && [1, 2, 3].map((k) => <Skeleton key={k} />)}

                    {/* Empty state */}
                    {!loading && items.length === 0 && !flash && (
                        <div className="py-8 text-center space-y-1">
                            <p className="text-sm font-semibold text-[color:var(--ink-soft)] dark:text-[color:var(--ink)]">Inbox clear</p>
                            <p className="text-xs text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)]">No pending approvals right now.</p>
                        </div>
                    )}

                    {/* Approval cards */}
                    {!loading && items.map((item) => (
                        <div
                            key={item.id}
                            className="rounded-[3px] border border-[color:var(--line)] dark:border-[color:var(--line)]/80 bg-[var(--bg-deep)] dark:bg-[var(--card)]/50 p-4 space-y-3 hover:border-[color:var(--line-strong)] dark:hover:border-[color:var(--line)] transition-colors"
                        >
                            <div className="flex items-center justify-between gap-2">
                                <span className={`text-[11px] font-bold rounded-full px-2.5 py-0.5 uppercase tracking-wide ${riskBadge[item.risk]}`}>
                                    {item.risk}
                                </span>
                                <span className="text-[11px] text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)]">
                                    {fromNow(item.createdAt)}
                                </span>
                            </div>
                            <p className="text-sm text-[color:var(--ink-soft)] dark:text-[color:var(--ink)] leading-snug font-medium">
                                {item.title}
                            </p>
                            <p className="text-[11px] text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)]">by {item.agent}</p>
                            <div className="flex gap-2 pt-0.5">
                                {/* Approve → opens Quick-Approve modal */}
                                <button
                                    onClick={() => openModal(item)}
                                    className="flex-1 text-xs font-bold rounded-[3px] bg-[var(--ok)] hover:bg-[var(--ok)] active:scale-[0.97] text-white py-2 transition-all shadow-sm shadow-emerald-500/20"
                                >
                                    Approve
                                </button>
                                {/* Review → full approvals page */}
                                <Link
                                    href="/dashboard/approvals"
                                    className="flex-1 text-xs font-bold rounded-[3px] border border-[color:var(--line-strong)] dark:border-[color:var(--line)] text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)] hover:bg-[var(--bg-deep)] dark:hover:bg-[var(--card)]/70 py-2 transition-all text-center"
                                >
                                    Review
                                </Link>
                            </div>
                        </div>
                    ))}

                    {/* Footer link */}
                    <ButtonLink
                        href="/dashboard/approvals"
                        size="sm"
                        variant="ghost"
                        className="w-full justify-center mt-1"
                    >
                        Open full inbox
                        <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
                    </ButtonLink>
                </div>
            </div>

            {/* ── Modal (portal-style, always mounted) ─────────────── */}
            <QuickApproveModal
                approval={selected}
                onClose={() => setSelected(null)}
                onApproved={handleApproved}
            />
        </>
    );
}
