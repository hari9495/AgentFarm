import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ClipboardCheck, Shield, Timer } from "lucide-react";

export const metadata: Metadata = {
    title: "Agents - AgentFarm Dashboard",
    description: "Browse and manage deployed AI workers.",
};

const agents = [
    { slug: "ai-backend-developer", name: "AI Backend Developer", role: "Backend Engineering", status: "Active", tasks: 34, reliability: 99.2, tone: "sky" },
    { slug: "ai-qa-engineer", name: "AI QA Engineer", role: "Quality Assurance", status: "Active", tasks: 52, reliability: 99.6, tone: "violet" },
    { slug: "ai-devops-engineer", name: "AI DevOps Engineer", role: "DevOps & Infrastructure", status: "Active", tasks: 18, reliability: 98.9, tone: "amber" },
    { slug: "ai-security-engineer", name: "AI Security Engineer", role: "Security & Compliance", status: "Needs review", tasks: 7, reliability: 99.7, tone: "rose" },
];

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
                        <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                            <p className="rounded-lg bg-slate-50 dark:bg-slate-800 px-3 py-2 text-slate-600 dark:text-slate-300 inline-flex items-center gap-1.5">
                                <ClipboardCheck className="w-3.5 h-3.5" /> {agent.tasks} tasks
                            </p>
                            <p className="rounded-lg bg-slate-50 dark:bg-slate-800 px-3 py-2 text-slate-600 dark:text-slate-300 inline-flex items-center gap-1.5">
                                <Shield className="w-3.5 h-3.5" /> {agent.reliability}% reliability
                            </p>
                        </div>
                        <div className="mt-4 flex gap-2">
                            <Link href={`/dashboard/agents/${agent.slug}`} className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white dark:bg-slate-100 dark:text-slate-900">
                                View details <ArrowRight className="w-3.5 h-3.5" />
                            </Link>
                            <Link href={`/dashboard/agents/${agent.slug}/approvals`} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
                                <Timer className="w-3.5 h-3.5" /> Approvals
                            </Link>
                        </div>
                    </article>
                ))}
            </div>
        </div>
    );
}
