import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ClipboardCheck, Shield, Timer } from "lucide-react";
import PremiumIcon from "@/components/shared/PremiumIcon";

export const metadata: Metadata = {
    title: "Agents - AgentFarm Dashboard",
    description: "Browse and manage deployed AI workers.",
};

const agents = [
    { slug: "ai-backend-developer", name: "AI Backend Developer", role: "Backend Engineering", status: "Active", tasks: 34, reliability: 99.2, tone: "sky", heatSeed: 7 },
    { slug: "ai-qa-engineer", name: "AI QA Engineer", role: "Quality Assurance", status: "Active", tasks: 52, reliability: 99.6, tone: "violet", heatSeed: 13 },
    { slug: "ai-devops-engineer", name: "AI DevOps Engineer", role: "DevOps & Infrastructure", status: "Active", tasks: 18, reliability: 98.9, tone: "amber", heatSeed: 5 },
    { slug: "ai-security-engineer", name: "AI Security Engineer", role: "Security & Compliance", status: "Needs review", tasks: 7, reliability: 99.7, tone: "rose", heatSeed: 3 },
];

function heatCell(seed: number, i: number): string {
    const v = ((seed * 17 + i * 31 + i * seed) % 10);
    if (v <= 1) return "bg-slate-100 dark:bg-slate-800";
    if (v <= 3) return "bg-emerald-100 dark:bg-emerald-900/30";
    if (v <= 6) return "bg-emerald-300 dark:bg-emerald-700/60";
    return "bg-emerald-500 dark:bg-emerald-500/80";
}

const toneClass: Record<string, string> = {
    sky: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
    violet: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
    amber: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    rose: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
};

export default function AgentsIndexPage() {
    return (
        <div className="site-shell min-h-screen">
            <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-5 md:px-8">
                <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">AI Workers</h1>
                <p className="text-xs text-slate-500 dark:text-slate-400">Inspect each worker's task history, quality, and approvals.</p>
            </div>

            <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 grid grid-cols-1 md:grid-cols-2 gap-4">
                {agents.map((agent) => (
                    <article key={agent.slug} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
                        <div className="flex items-center justify-between">
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${toneClass[agent.tone]}`}>
                                {agent.role}
                            </span>
                            <span className="text-xs text-slate-500 dark:text-slate-400">{agent.status}</span>
                        </div>
                        <h2 className="mt-3 text-base font-bold text-slate-900 dark:text-slate-100">{agent.name}</h2>

                        {/* D4: 7-day × 4-week task heatmap */}
                        <div className="mt-4">
                            <p className="text-[10px] text-slate-400 mb-1.5">Activity heatmap — last 4 weeks</p>
                            <div className="grid grid-cols-7 gap-0.5">
                                {Array.from({ length: 28 }, (_, i) => (
                                    <div
                                        key={i}
                                        className={`h-3 rounded-sm ${heatCell(agent.heatSeed, i)}`}
                                        title={`Day ${i + 1}`}
                                    />
                                ))}
                            </div>
                        </div>

                        <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                            <p className="rounded-lg bg-slate-50 dark:bg-slate-800 px-3 py-2 text-slate-600 dark:text-slate-300 inline-flex items-center gap-1.5">
                                <PremiumIcon icon={ClipboardCheck} tone="sky" containerClassName="w-6 h-6 rounded-lg bg-sky-100 dark:bg-sky-900/40 text-sky-600 dark:text-sky-400" iconClassName="w-3.5 h-3.5" /> {agent.tasks} tasks
                            </p>
                            <p className="rounded-lg bg-slate-50 dark:bg-slate-800 px-3 py-2 text-slate-600 dark:text-slate-300 inline-flex items-center gap-1.5">
                                <PremiumIcon icon={Shield} tone="emerald" containerClassName="w-6 h-6 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400" iconClassName="w-3.5 h-3.5" /> {agent.reliability}% reliability
                            </p>
                        </div>
                        <div className="mt-4 flex gap-2">
                            <Link href={`/dashboard/agents/${agent.slug}`} className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white dark:bg-slate-100 dark:text-slate-900">
                                View details <PremiumIcon icon={ArrowRight} tone="slate" containerClassName="w-6 h-6 rounded-lg bg-white/15 text-white border-white/30 dark:bg-slate-900/10 dark:text-slate-900 dark:border-slate-900/20" iconClassName="w-3.5 h-3.5" />
                            </Link>
                            <Link href={`/dashboard/agents/${agent.slug}/approvals`} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
                                <PremiumIcon icon={Timer} tone="slate" containerClassName="w-6 h-6 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400" iconClassName="w-3.5 h-3.5" /> Approvals
                            </Link>
                        </div>
                    </article>
                ))}
            </div>
        </div>
    );
}
