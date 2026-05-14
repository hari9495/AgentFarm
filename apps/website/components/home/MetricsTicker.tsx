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
        <section className="bg-[var(--canvas)] border-y border-[var(--hairline)] py-4 overflow-hidden">
            <div className="relative">
                <div className="absolute left-0 top-0 bottom-0 w-16 bg-gradient-to-r from-[var(--canvas)] to-transparent z-10 pointer-events-none" />
                <div className="absolute right-0 top-0 bottom-0 w-16 bg-gradient-to-l from-[var(--canvas)] to-transparent z-10 pointer-events-none" />
                <div className="flex animate-marquee w-max gap-10">
                    {allMetrics.map((m, i) => (
                        <span key={i} className="shrink-0 text-sm font-semibold text-[var(--mute)] whitespace-nowrap">
                            {m}
                        </span>
                    ))}
                </div>
            </div>
        </section>
    );
}
