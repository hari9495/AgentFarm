import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, Tag } from "lucide-react";

export const metadata: Metadata = {
    title: "Changelog Entry - AgentFarm",
};

const entries = [
    {
        version: "v0-5",
        label: "v0.5",
        date: "March 2026",
        title: "32-role marketplace with department filters",
        summary:
            "Expanded the marketplace to 32 AI worker roles across 14 departments with better filters and role discovery.",
        highlights: [
            "Added department and availability filtering in marketplace",
            "Improved role cards with richer capability metadata",
            "Reduced time-to-hire for first worker with updated UX",
        ],
    },
    {
        version: "v0-4-2",
        label: "v0.4.2",
        date: "March 2026",
        title: "Analytics dashboard",
        summary:
            "Launched analytics dashboard with task volume trends, merge rates, and estimated monthly savings.",
        highlights: [
            "Per-agent performance table and trend graph",
            "Estimated savings model by workload type",
            "Quality and acceptance metrics in one view",
        ],
    },
    {
        version: "v0-4-1",
        label: "v0.4.1",
        date: "March 2026",
        title: "Bot config and task history persistence",
        summary:
            "Persisted bot configuration and task history across sessions with database-backed storage.",
        highlights: [
            "Config survives page refresh and restarts",
            "Task history includes output and run metadata",
            "Improved reliability for operational workflows",
        ],
    },
    {
        version: "v0-4",
        label: "v0.4",
        date: "March 2026",
        title: "Robot Marketplace launch",
        summary: "Introduced marketplace flow for browsing, hiring, and configuring AI workers.",
        highlights: [
            "Launch roles: Backend, Frontend, QA, DevOps",
            "Simplified hiring and deployment flow",
            "Integrated with dashboard and checkout",
        ],
    },
];

export function generateStaticParams() {
    return entries.map((e) => ({ version: e.version }));
}

export default async function ChangelogVersionPage({ params }: { params: Promise<{ version: string }> }) {
    const { version } = await params;
    const entry = entries.find((e) => e.version === version);
    if (!entry) notFound();

    return (
        <article className="site-shell min-h-screen">
            <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
                <Link href="/changelog" className="inline-flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-sky-600 dark:hover:text-sky-400">
                    <ArrowLeft className="w-4 h-4" /> Back to changelog
                </Link>

                <div className="mt-8 rounded-3xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/70 p-8">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 font-semibold">
                            <Tag className="w-3.5 h-3.5" /> {entry.label}
                        </span>
                        <span className="inline-flex items-center gap-1"><CalendarDays className="w-3.5 h-3.5" /> {entry.date}</span>
                    </div>

                    <h1 className="mt-3 text-3xl font-extrabold text-slate-900 dark:text-slate-100">{entry.title}</h1>
                    <p className="mt-4 text-slate-600 dark:text-slate-300 leading-relaxed">{entry.summary}</p>

                    <h2 className="mt-8 text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Highlights</h2>
                    <ul className="mt-3 space-y-2">
                        {entry.highlights.map((highlight) => (
                            <li key={highlight} className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-700 dark:text-slate-300">
                                {highlight}
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
        </article>
    );
}
