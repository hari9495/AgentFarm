"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Calendar, X, ArrowRight, AlertCircle } from "lucide-react";

type Props = {
    fromValue: string;  // YYYY-MM-DD
    toValue:   string;  // YYYY-MM-DD
    minDate:   string;  // YYYY-MM-DD  (earliest allowed start, ~1 yr ago)
    maxDate:   string;  // YYYY-MM-DD  (latest allowed end = today)
};

const MIN_DAYS = 7;
const MAX_DAYS = 84; // 12 weeks / ~3 months

/** Format YYYY-MM-DD → "Jun 2, 2026" using local time (no UTC shift). */
function fmt(dateStr: string): string {
    const parts = dateStr.split("-");
    const y = parseInt(parts[0] ?? "2000", 10);
    const m = parseInt(parts[1] ?? "1",    10);
    const d = parseInt(parts[2] ?? "1",    10);
    return new Date(y, m - 1, d).toLocaleDateString("en-US", {
        month: "short", day: "numeric", year: "numeric",
    });
}

/** Difference in calendar days between two YYYY-MM-DD strings (to - from). */
function diffDays(fromStr: string, toStr: string): number {
    const parse = (s: string) => {
        const p = s.split("-");
        const y = parseInt(p[0] ?? "2000", 10);
        const m = parseInt(p[1] ?? "1",    10);
        const d = parseInt(p[2] ?? "1",    10);
        return new Date(y, m - 1, d).getTime();
    };
    return Math.round((parse(toStr) - parse(fromStr)) / 86_400_000);
}

/** Add n days to a YYYY-MM-DD string → YYYY-MM-DD (local time only). */
function addDaysStr(dateStr: string, n: number): string {
    const parts = dateStr.split("-");
    const y = parseInt(parts[0] ?? "2000", 10);
    const m = parseInt(parts[1] ?? "1",    10);
    const d = parseInt(parts[2] ?? "1",    10);
    const dt = new Date(y, m - 1, d + n);
    return [
        dt.getFullYear(),
        String(dt.getMonth() + 1).padStart(2, "0"),
        String(dt.getDate()).padStart(2, "0"),
    ].join("-");
}

export default function HeatmapDatePicker({ fromValue, toValue, minDate, maxDate }: Props) {
    const [open, setOpen]           = useState(false);
    const [pickedFrom, setFrom]     = useState(fromValue);
    const [pickedTo,   setTo]       = useState(toValue);
    const panelRef                  = useRef<HTMLDivElement>(null);
    const router                    = useRouter();

    // Sync when URL-driven values change (Prev / Next clicks)
    useEffect(() => { setFrom(fromValue); setTo(toValue); }, [fromValue, toValue]);

    // Close on outside click
    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            if (panelRef.current && !panelRef.current.contains(e.target as Node))
                setOpen(false);
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [open]);

    // Validation
    const days        = pickedFrom && pickedTo ? diffDays(pickedFrom, pickedTo) + 1 : 0;
    const tooShort    = pickedFrom && pickedTo && days < MIN_DAYS;
    const tooLong     = pickedFrom && pickedTo && days > MAX_DAYS;
    const orderError  = pickedFrom && pickedTo && pickedTo < pickedFrom;
    const hasError    = !!(tooShort || tooLong || orderError);
    const unchanged   = pickedFrom === fromValue && pickedTo === toValue;
    const canApply    = !hasError && !unchanged && !!pickedFrom && !!pickedTo;

    const errorMsg = orderError
        ? "End date must be after start date."
        : tooShort
        ? `Minimum range is ${MIN_DAYS} days.`
        : tooLong
        ? `Maximum range is ${MAX_DAYS} days (${MAX_DAYS / 7} weeks).`
        : "";

    const handleApply = () => {
        if (canApply) {
            router.push(`?from=${pickedFrom}&to=${pickedTo}`);
            setOpen(false);
        }
    };

    const handleCancel = () => {
        setFrom(fromValue);
        setTo(toValue);
        setOpen(false);
    };

    // When start date changes, auto-advance end date if needed to keep a valid range
    const handleFromChange = (val: string) => {
        setFrom(val);
        if (val && pickedTo && pickedTo < val) {
            setTo(addDaysStr(val, MIN_DAYS - 1));
        }
    };

    return (
        <div className="relative" ref={panelRef}>
            {/* Trigger */}
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

            {/* Popover */}
            {open && (
                <div className="absolute right-0 top-full mt-2 z-30 w-80 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl shadow-slate-200/60 dark:shadow-slate-900/60 p-4">

                    {/* Header */}
                    <div className="flex items-center justify-between mb-4">
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

                    {/* Date inputs — two-column grid */}
                    <div className="grid grid-cols-2 gap-3 mb-3">
                        {/* Start */}
                        <div>
                            <label className="block mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                                Start date
                            </label>
                            <input
                                type="date"
                                value={pickedFrom}
                                min={minDate}
                                max={pickedTo || maxDate}
                                onChange={(e) => handleFromChange(e.target.value)}
                                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-2 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-400 transition"
                            />
                        </div>
                        {/* End */}
                        <div>
                            <label className="block mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                                End date
                            </label>
                            <input
                                type="date"
                                value={pickedTo}
                                min={pickedFrom ? addDaysStr(pickedFrom, MIN_DAYS - 1) : minDate}
                                max={maxDate}
                                onChange={(e) => setTo(e.target.value)}
                                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-2 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-400 transition"
                            />
                        </div>
                    </div>

                    {/* Range preview */}
                    {pickedFrom && pickedTo && !hasError && (
                        <div className="mb-3 flex items-center gap-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/50 px-3 py-2.5">
                            <div className="flex-1 min-w-0">
                                <p className="text-[10px] text-slate-400 mb-0.5">{days}-day window · {Math.ceil(days / 7)} {Math.ceil(days / 7) === 1 ? "week" : "weeks"}</p>
                                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                                    <span className="truncate">{fmt(pickedFrom)}</span>
                                    <ArrowRight className="h-3 w-3 text-slate-400 shrink-0" />
                                    <span className="truncate">{fmt(pickedTo)}</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Validation error */}
                    {hasError && (
                        <div className="mb-3 flex items-start gap-2 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 px-3 py-2.5">
                            <AlertCircle className="h-3.5 w-3.5 text-rose-500 shrink-0 mt-0.5" />
                            <p className="text-[11px] text-rose-600 dark:text-rose-400">{errorMsg}</p>
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2">
                        <button
                            onClick={handleCancel}
                            className="flex-1 rounded-xl border border-slate-200 dark:border-slate-700 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleApply}
                            disabled={!canApply}
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
