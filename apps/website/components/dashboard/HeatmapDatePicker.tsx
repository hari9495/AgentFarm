"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Calendar, X, ArrowRight, AlertCircle } from "lucide-react";

type Props = {
    fromValue: string;  // YYYY-MM-DD
    toValue:   string;  // YYYY-MM-DD
    minDate:   string;  // YYYY-MM-DD
    maxDate:   string;  // YYYY-MM-DD (today)
};

const MIN_DAYS = 7;
const MAX_DAYS = 84;

function fmt(dateStr: string): string {
    const p = dateStr.split("-");
    return new Date(+p[0]!, +p[1]! - 1, +p[2]!).toLocaleDateString("en-US", {
        month: "short", day: "numeric", year: "numeric",
    });
}

function diffDays(a: string, b: string): number {
    const ms = (s: string) => { const p = s.split("-"); return new Date(+p[0]!, +p[1]! - 1, +p[2]!).getTime(); };
    return Math.round((ms(b) - ms(a)) / 86_400_000);
}

function addDaysStr(dateStr: string, n: number): string {
    const p = dateStr.split("-");
    const d = new Date(+p[0]!, +p[1]! - 1, +p[2]! + n);
    return [d.getFullYear(), String(d.getMonth()+1).padStart(2,"0"), String(d.getDate()).padStart(2,"0")].join("-");
}

export default function HeatmapDatePicker({ fromValue, toValue, minDate, maxDate }: Props) {
    const [open, setOpen]       = useState(false);
    const [pickedFrom, setFrom] = useState(fromValue);
    const [pickedTo,   setTo]   = useState(toValue);
    const panelRef              = useRef<HTMLDivElement>(null);
    const router                = useRouter();

    useEffect(() => { setFrom(fromValue); setTo(toValue); }, [fromValue, toValue]);

    useEffect(() => {
        if (!open) return;
        const h = (e: MouseEvent) => {
            if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener("mousedown", h);
        return () => document.removeEventListener("mousedown", h);
    }, [open]);

    const days       = pickedFrom && pickedTo ? diffDays(pickedFrom, pickedTo) + 1 : 0;
    const weeks      = days > 0 ? Math.ceil(days / 7) : 0;
    const orderError = !!(pickedFrom && pickedTo && pickedTo < pickedFrom);
    const tooShort   = !orderError && days > 0 && days < MIN_DAYS;
    const tooLong    = !orderError && days > MAX_DAYS;
    const hasError   = orderError || tooShort || tooLong;
    const canApply   = !hasError && !(pickedFrom === fromValue && pickedTo === toValue) && !!pickedFrom && !!pickedTo;

    const errorMsg = orderError ? "End date must be after start date."
        : tooShort ? `Minimum ${MIN_DAYS} days.`
        : tooLong  ? `Maximum ${MAX_DAYS} days.`
        : "";

    const handleApply  = () => { if (canApply) { router.push(`?from=${pickedFrom}&to=${pickedTo}`); setOpen(false); } };
    const handleCancel = () => { setFrom(fromValue); setTo(toValue); setOpen(false); };
    const handleFromChange = (val: string) => {
        setFrom(val);
        if (val && pickedTo && pickedTo < val) setTo(addDaysStr(val, MIN_DAYS - 1));
    };

    return (
        <div className="relative" ref={panelRef}>

            {/* Trigger */}
            <button
                onClick={() => setOpen(v => !v)}
                className={`inline-flex items-center gap-1.5 rounded-[3px] border px-3 py-1.5 text-xs font-medium transition-colors
                    ${open
                        ? "border-[color:color-mix(in_srgb,var(--accent)_40%,transparent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--accent)_22%,transparent)]/30 text-[color:var(--accent)] dark:text-[color:var(--accent)]"
                        : "border-[color:var(--line)] dark:border-[color:var(--line)] text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)] hover:bg-[var(--bg-deep)] dark:hover:bg-[var(--card)]"
                    }`}
            >
                <Calendar className="h-3.5 w-3.5" />
                Custom range
            </button>

            {/* Popover — wider so side-by-side inputs never truncate */}
            {open && (
                <div className="absolute right-0 top-full mt-2 z-30 w-[22rem] rounded-[4px] border border-[color:var(--line)] dark:border-[color:var(--line)] bg-[var(--card)] dark:bg-[var(--card)] shadow-xl shadow-slate-200/60 dark:shadow-slate-900/60 p-4">

                    {/* Header */}
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                            <div className="h-6 w-6 rounded-[3px] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--accent)_22%,transparent)]/40 flex items-center justify-center shrink-0">
                                <Calendar className="h-3.5 w-3.5 text-[color:var(--accent)] dark:text-[color:var(--accent)]" />
                            </div>
                            <p className="text-xs font-bold text-[color:var(--ink)] dark:text-[color:var(--ink)]">Pick a date range</p>
                        </div>
                        <button onClick={handleCancel} className="h-6 w-6 rounded-[3px] flex items-center justify-center text-[color:var(--ink-muted)] hover:text-[color:var(--ink-soft)] hover:bg-[var(--bg-deep)] dark:hover:bg-[var(--card)] transition-colors">
                            <X className="h-3.5 w-3.5" />
                        </button>
                    </div>

                    {/* Side-by-side date inputs — flex so each gets equal width */}
                    <div className="flex items-end gap-2 mb-3">
                        <div className="flex-1 min-w-0">
                            <label className="block mb-1 text-[9px] font-bold uppercase tracking-widest text-[color:var(--ink-muted)]">From</label>
                            <input
                                type="date"
                                value={pickedFrom}
                                min={minDate}
                                max={pickedTo || maxDate}
                                onChange={e => handleFromChange(e.target.value)}
                                className="w-full rounded-[3px] border border-[color:var(--line)] dark:border-[color:var(--line)] bg-[var(--bg-deep)] dark:bg-[var(--card)] px-2.5 py-2 text-xs font-medium text-[color:var(--ink)] dark:text-[color:var(--ink)] focus:outline-none focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--accent)_40%,transparent)] transition"
                            />
                        </div>
                        <div className="shrink-0 pb-2.5">
                            <ArrowRight className="h-3.5 w-3.5 text-[color:var(--ink-muted)]" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <label className="block mb-1 text-[9px] font-bold uppercase tracking-widest text-[color:var(--ink-muted)]">To</label>
                            <input
                                type="date"
                                value={pickedTo}
                                min={pickedFrom ? addDaysStr(pickedFrom, MIN_DAYS - 1) : minDate}
                                max={maxDate}
                                onChange={e => setTo(e.target.value)}
                                className="w-full rounded-[3px] border border-[color:var(--line)] dark:border-[color:var(--line)] bg-[var(--bg-deep)] dark:bg-[var(--card)] px-2.5 py-2 text-xs font-medium text-[color:var(--ink)] dark:text-[color:var(--ink)] focus:outline-none focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--accent)_40%,transparent)] transition"
                            />
                        </div>
                    </div>

                    {/* Live summary — single compact row */}
                    {pickedFrom && pickedTo && !hasError && days > 0 && (
                        <div className="flex items-center gap-2 mb-3 px-0.5">
                            <span className="inline-flex items-center rounded-full bg-[color-mix(in_srgb,var(--ok)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--ok)_22%,transparent)]/50 text-[color:var(--ok)] dark:text-[color:var(--ok)] px-2 py-0.5 text-[11px] font-bold shrink-0">
                                {days}d
                            </span>
                            <span className="inline-flex items-center rounded-full bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--accent)_22%,transparent)]/50 text-[color:var(--accent)] dark:text-[color:var(--accent)] px-2 py-0.5 text-[11px] font-bold shrink-0">
                                {weeks}w
                            </span>
                            <span className="text-[11px] text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)] truncate">
                                {fmt(pickedFrom)} → {fmt(pickedTo)}
                            </span>
                        </div>
                    )}

                    {/* Validation error */}
                    {hasError && (
                        <div className="flex items-center gap-1.5 mb-3 px-0.5">
                            <AlertCircle className="h-3.5 w-3.5 text-[color:var(--danger)] shrink-0" />
                            <p className="text-[11px] text-[color:var(--danger)] dark:text-[color:var(--danger)]">{errorMsg}</p>
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2">
                        <button onClick={handleCancel} className="flex-1 rounded-[3px] border border-[color:var(--line)] dark:border-[color:var(--line)] py-2 text-xs font-semibold text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)] hover:bg-[var(--bg-deep)] dark:hover:bg-[var(--card)] transition-colors">
                            Cancel
                        </button>
                        <button onClick={handleApply} disabled={!canApply} className="flex-1 rounded-[3px] bg-[var(--accent)] dark:bg-[var(--bg-deep)] py-2 text-xs font-semibold text-white dark:text-[color:var(--ink)] hover:bg-[var(--accent)] dark:hover:bg-[var(--card)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                            Apply
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
