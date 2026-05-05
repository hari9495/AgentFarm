"use client";

const metrics = [
    "✓  184 tasks shipped this week",
    "⬆  46 PRs merged",
    "⬇  Cycle time down 28%",
    "✓  $18,400 developer hours saved",
    "⬆  99.4% avg agent reliability",
    "✓  312 engineering hours reclaimed",
    "⬆  0 regressions in last 50 PRs",
    "✓  Full audit trail on every action",
];

const allMetrics = [...metrics, ...metrics];

export default function MetricsTicker() {
    return (
        <section className="bg-slate-900 dark:bg-slate-950 border-y border-slate-800 py-4 overflow-hidden">
            <div className="relative">
                <div className="absolute left-0 top-0 bottom-0 w-16 bg-gradient-to-r from-slate-900 dark:from-slate-950 to-transparent z-10 pointer-events-none" />
                <div className="absolute right-0 top-0 bottom-0 w-16 bg-gradient-to-l from-slate-900 dark:from-slate-950 to-transparent z-10 pointer-events-none" />
                <div className="flex animate-marquee w-max gap-10">
                    {allMetrics.map((m, i) => (
                        <span key={i} className="shrink-0 text-sm font-semibold text-slate-300 whitespace-nowrap">
                            {m}
                        </span>
                    ))}
                </div>
            </div>
        </section>
    );
}
