"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Calendar, X, ArrowRight } from "lucide-react";

type Props = {
    /** Current window start date as YYYY-MM-DD */
    fromValue: string;
    /** Earliest allowed start date as YYYY-MM-DD (~1 year ago) */
    minDate: string;
    /** Latest allowed start date as YYYY-MM-DD (today - 27 days) */
    maxDate: string;
};

/** Format YYYY-MM-DD → "Jun 2, 2026" */
function fmt(dateStr: string): string {
    // Parse as local date to avoid UTC shift
    const [y, m, d] = dateStr.split("-").map(Number);
    return new Date(y, (m ?? 1) - 1, d).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
    });
}

/** Add n days to a YYYY-MM-DD string, return YYYY-MM-DD.
 *  Uses local-time getters only — never toISOString() — to avoid UTC shift in IST/UTC+ zones. */
function addDays(dateStr: string, n: number): string {
    const parts = dateStr.split("-");
    const y = parseInt(parts[0] ?? "2000", 10);
    const m = parseInt(parts[1] ?? "1",    10);
    const d = parseInt(parts[2] ?? "1",    10);
    const dt = new Date(y, m - 1, d + n);   // local midnight
    return [
        dt.getFullYear(),
        String(dt.getMonth() + 1).padStart(2, "0"),
        String(dt.getDate()).padStart(2, "0"),
    ].join("-");
}

export default function HeatmapDatePicker({ fromValue, minDate, maxDate }: Props) {
    const [open, setOpen]       = useState(false);
    const [picked, setPicked]   = useState(fromValue);
    const panelRef              = useRef<HTMLDivElement>(null);
    const router                = useRouter();

    // Sync when the URL-driven fromValue changes externally (Prev/Next clicks)
    useEffect(() => { setPicked(fromValue); }, [fromValue]);

    // Close on outside click
    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [open]);

    const endDate   = picked ? addDays(picked, 27) : "";
    const isChanged = picked !== fromValue;

    const handleApply = () => {
        if (picked) {
            router.push(`?from=${picked}`);
            setOpen(false);
        }
    };

    const handleCancel = () => {
        setPicked(fromValue);
        setOpen(false);
    };

    return (
        <div className="relative" ref={panelRef}>
            {/* Trigger button */}
            <button
                onClick={() => setOpen((v) => !v)}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors
                    ${open
                        ? "border-sky-400 bg-sky-50 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400"
                        : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                    }`}
            >
                <Calendar className="h-3.5 w-3.5" />
                Custom range
            </button>

            {/* Dropdown panel */}
            {open && (
                <div className="absolute right-0 top-full mt-2 z-30 w-72 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl shadow-slate-200/60 dark:shadow-slate-900/60 p-4">
                    {/* Panel header */}
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                            <div className="h-6 w-6 rounded-lg bg-sky-100 dark:bg-sky-900/40 flex items-center justify-center">
                                <Calendar className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
                            </div>
                            <p className="text-xs font-bold text-slate-800 dark:text-slate-200">Pick a date range</p>
                        </div>
                        <button
                            onClick={handleCancel}
                            className="h-6 w-6 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        >
                            <X className="h-3.5 w-3.5" />
                        </button>
                    </div>

                    {/* Start date input */}
                    <label className="block mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                        Start date
                    </label>
                    <input
                        type="date"
                        value={picked}
                        min={minDate}
                        max={maxDate}
                        onChange={(e) => setPicked(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-400 transition"
                    />

                    {/* Range preview */}
                    {picked && endDate && (
                        <div className="mt-3 flex items-center gap-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/50 px-3 py-2.5">
                            <div className="flex-1 min-w-0">
                                <p className="text-[10px] text-slate-400 mb-0.5">28-day window</p>
                                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                                    <span>{fmt(picked)}</span>
                                    <ArrowRight className="h-3 w-3 text-slate-400 shrink-0" />
                                    <span>{fmt(endDate)}</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Actions */}
                    <div className="mt-3 flex gap-2">
                        <button
                            onClick={handleCancel}
                            className="flex-1 rounded-xl border border-slate-200 dark:border-slate-700 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleApply}
                            disabled={!isChanged || !picked}
                            className="flex-1 rounded-xl bg-slate-900 dark:bg-slate-100 py-2 text-xs font-semibold text-white dark:text-slate-900 hover:bg-slate-700 dark:hover:bg-white/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            Apply
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
