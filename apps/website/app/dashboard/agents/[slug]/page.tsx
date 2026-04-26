import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
    ArrowUpRight,
    CheckCircle2,
    Clock3,
    GitPullRequest,
    Shield,
    Timer,
    TrendingUp,
    AlertTriangle,
} from "lucide-react";
import ButtonLink from "@/components/shared/ButtonLink";
import RiskyActionTrigger from "@/components/dashboard/RiskyActionTrigger";

export const metadata: Metadata = {
    title: "Agent Detail - AgentFarm Dashboard",
};

const workers: Record<
    string,
    {
        name: string;
        initials: string;
        role: string;
        status: string;
        statusColor: string;
        tasks: number;
        prs: number;
        reliability: number;
        cycleTime: string;
        savings: string;
        acceptanceRate: number;
        reworkRate: number;
        escalationRate: number;
        accentBg: string;
        accentColor: string;
        history: { time: string; action: string; detail: string; risk: string; status: string }[];
    }
> = {
    "ai-backend-developer": {
        name: "AI Backend Developer",
        initials: "AB",
        role: "Backend Engineering",
        status: "Active",
        statusColor: "bg-emerald-500",
        tasks: 34,
        prs: 11,
        reliability: 99.2,
        cycleTime: "2h 14m",
        savings: "$5,400",
        acceptanceRate: 97,
        reworkRate: 3,
        escalationRate: 8,
        accentBg: "bg-sky-100 dark:bg-sky-900/40",
        accentColor: "text-sky-600 dark:text-sky-400",
        history: [
            { time: "10:42", action: "PR opened", detail: "PR #482 — billing webhook retry logic", risk: "low", status: "Open" },
            { time: "09:15", action: "Commit pushed", detail: "3 commits to feat/billing-retry", risk: "low", status: "Done" },
            { time: "08:30", action: "PR merged", detail: "PR #479 — auth token timeout fix", risk: "medium", status: "Merged" },
            { time: "07:45", action: "Test run", detail: "Unit tests for payment service", risk: "low", status: "Passed" },
            { time: "Yesterday", action: "PR opened", detail: "PR #477 — database index optimization", risk: "low", status: "Merged" },
            { time: "Yesterday", action: "Code review", detail: "Reviewed and approved PR #476", risk: "low", status: "Done" },
        ],
    },
    "ai-qa-engineer": {
        name: "AI QA Engineer",
        initials: "AQ",
        role: "Quality Assurance",
        status: "Active",
        statusColor: "bg-emerald-500",
        tasks: 52,
        prs: 0,
        reliability: 99.6,
        cycleTime: "1h 38m",
        savings: "$7,200",
        acceptanceRate: 99,
        reworkRate: 1,
        escalationRate: 4,
        accentBg: "bg-violet-100 dark:bg-violet-900/40",
        accentColor: "text-violet-600 dark:text-violet-400",
        history: [
            { time: "09:57", action: "Full regression", detail: "1,248 tests · 0 failures · coverage 94.2%", risk: "low", status: "Passed" },
            { time: "08:10", action: "Smoke test", detail: "Staging environment post-deploy check", risk: "low", status: "Passed" },
            { time: "07:30", action: "Test authored", detail: "12 new E2E tests for checkout flow", risk: "low", status: "Done" },
            { time: "Yesterday", action: "Bug report", detail: "Logged 2 regression issues in billing module", risk: "medium", status: "Open" },
            { time: "Yesterday", action: "Full regression", detail: "1,198 tests · 2 failures found", risk: "medium", status: "Flagged" },
        ],
    },
    "ai-devops-engineer": {
        name: "AI DevOps Engineer",
        initials: "AD",
        role: "DevOps & Infrastructure",
        status: "Active",
        statusColor: "bg-emerald-500",
        tasks: 18,
        prs: 7,
        reliability: 98.9,
        cycleTime: "3h 02m",
        savings: "$4,100",
        acceptanceRate: 94,
        reworkRate: 6,
        escalationRate: 14,
        accentBg: "bg-amber-100 dark:bg-amber-900/40",
        accentColor: "text-amber-600 dark:text-amber-400",
        history: [
            { time: "09:31", action: "Canary deploy", detail: "v2.14.0 to staging · 10% traffic", risk: "medium", status: "Running" },
            { time: "08:45", action: "Alert resolved", detail: "Memory spike on worker-03 mitigated", risk: "high", status: "Resolved" },
            { time: "07:00", action: "PR merged", detail: "Terraform: add Redis cluster to EU region", risk: "medium", status: "Merged" },
            { time: "Yesterday", action: "Infra change", detail: "Scaled down staging nodes 20% cost save", risk: "low", status: "Done" },
            { time: "Yesterday", action: "Deploy", detail: "v2.13.5 to production — full rollout", risk: "medium", status: "Done" },
        ],
    },
    "ai-security-engineer": {
        name: "AI Security Engineer",
        initials: "AS",
        role: "Security & Compliance",
        status: "Needs review",
        statusColor: "bg-amber-500",
        tasks: 7,
        prs: 2,
        reliability: 99.7,
        cycleTime: "4h 45m",
        savings: "$1,700",
        acceptanceRate: 100,
        reworkRate: 0,
        escalationRate: 29,
        accentBg: "bg-rose-100 dark:bg-rose-900/40",
        accentColor: "text-rose-600 dark:text-rose-400",
        history: [
            { time: "08:12", action: "Vuln flagged", detail: "CVE-2024-7891 lodash@4.17.20 · CVSS 8.1", risk: "high", status: "Flagged" },
            { time: "07:30", action: "Audit scan", detail: "SAST scan on payments service — 0 criticals", risk: "low", status: "Done" },
            { time: "Yesterday", action: "Policy check", detail: "IAM permissions audit — 3 over-privileged roles", risk: "high", status: "Escalated" },
            { time: "Yesterday", action: "Token rotate", detail: "Rotated build worker API token", risk: "medium", status: "Done" },
        ],
    },
};

const riskBadge: Record<string, string> = {
    low: "text-emerald-700 bg-emerald-100 dark:text-emerald-300 dark:bg-emerald-900/40",
    medium: "text-amber-700 bg-amber-100 dark:text-amber-300 dark:bg-amber-900/40",
    high: "text-rose-700 bg-rose-100 dark:text-rose-300 dark:bg-rose-900/40",
};

const statusBadge: Record<string, string> = {
    Open: "text-sky-700 bg-sky-100 dark:text-sky-300 dark:bg-sky-900/40",
    Done: "text-emerald-700 bg-emerald-100 dark:text-emerald-300 dark:bg-emerald-900/40",
    Merged: "text-violet-700 bg-violet-100 dark:text-violet-300 dark:bg-violet-900/40",
    Passed: "text-emerald-700 bg-emerald-100 dark:text-emerald-300 dark:bg-emerald-900/40",
    Flagged: "text-rose-700 bg-rose-100 dark:text-rose-300 dark:bg-rose-900/40",
    Running: "text-amber-700 bg-amber-100 dark:text-amber-300 dark:bg-amber-900/40",
    Resolved: "text-slate-600 bg-slate-100 dark:text-slate-400 dark:bg-slate-800",
    Escalated: "text-rose-700 bg-rose-100 dark:text-rose-300 dark:bg-rose-900/40",
};

export function generateStaticParams() {
    return Object.keys(workers).map((slug) => ({ slug }));
}

export default async function AgentDetailPage({
    params,
}: {
    params: Promise<{ slug: string }>;
}) {
    const { slug } = await params;
    const worker = workers[slug];
    if (!worker) notFound();

    const kpis = [
        { label: "Tasks (7d)", value: String(worker.tasks), icon: CheckCircle2, iconBg: "bg-sky-100 dark:bg-sky-900/40", iconColor: "text-sky-600 dark:text-sky-400" },
        { label: "PRs merged", value: String(worker.prs), icon: GitPullRequest, iconBg: "bg-violet-100 dark:bg-violet-900/40", iconColor: "text-violet-600 dark:text-violet-400" },
        { label: "Reliability", value: `${worker.reliability}%`, icon: Shield, iconBg: "bg-emerald-100 dark:bg-emerald-900/40", iconColor: "text-emerald-600 dark:text-emerald-400" },
        { label: "Avg cycle time", value: worker.cycleTime, icon: Timer, iconBg: "bg-amber-100 dark:bg-amber-900/40", iconColor: "text-amber-600 dark:text-amber-400" },
        { label: "Estimated savings", value: worker.savings, icon: TrendingUp, iconBg: "bg-rose-100 dark:bg-rose-900/40", iconColor: "text-rose-600 dark:text-rose-400" },
    ];

    return (
        <div className="site-shell min-h-screen">
            {/* Header */}
            <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-5 md:px-8">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <div className={`h-12 w-12 rounded-2xl ${worker.accentBg} flex items-center justify-center text-base font-bold ${worker.accentColor}`}>
                            {worker.initials}
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">{worker.name}</h1>
                                <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
                                    <span className={`h-1.5 w-1.5 rounded-full ${worker.statusColor}`} />
                                    {worker.status}
                                </span>
                            </div>
                            <p className="text-sm text-slate-500 dark:text-slate-400">{worker.role}</p>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <ButtonLink href={`/dashboard/agents/${slug}/approvals`} variant="outline" size="sm">Approvals</ButtonLink>
                        <ButtonLink href="/dashboard/settings" variant="outline" size="sm">Configure</ButtonLink>
                        <ButtonLink href="/dashboard" variant="ghost" size="sm">← All agents</ButtonLink>
                    </div>
                </div>
            </div>

            <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
                {/* KPI cards */}
                <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-4">
                    {kpis.map(({ label, value, icon: Icon, iconBg, iconColor }) => (
                        <div key={label} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4">
                            <div className={`h-8 w-8 rounded-xl ${iconBg} flex items-center justify-center mb-3`}>
                                <Icon className={`w-4 h-4 ${iconColor}`} />
                            </div>
                            <p className="text-2xl font-extrabold text-slate-900 dark:text-slate-100">{value}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{label}</p>
                        </div>
                    ))}
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                    {/* Task history */}
                    <div className="xl:col-span-2 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
                        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">Task History</h2>
                            <span className="text-xs text-slate-400">{worker.history.length} recent</span>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm min-w-[480px]">
                                <thead>
                                    <tr className="bg-slate-50 dark:bg-slate-800/50 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                        <th className="text-left px-5 py-3">Time</th>
                                        <th className="text-left px-5 py-3">Action</th>
                                        <th className="text-left px-5 py-3">Detail</th>
                                        <th className="text-left px-5 py-3">Risk</th>
                                        <th className="text-left px-5 py-3">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                                    {worker.history.map((row, i) => (
                                        <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                                            <td className="px-5 py-3 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">{row.time}</td>
                                            <td className="px-5 py-3 font-medium text-slate-800 dark:text-slate-200 whitespace-nowrap">{row.action}</td>
                                            <td className="px-5 py-3 text-slate-600 dark:text-slate-300 max-w-[200px] truncate">{row.detail}</td>
                                            <td className="px-5 py-3">
                                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${riskBadge[row.risk]}`}>
                                                    {row.risk}
                                                </span>
                                            </td>
                                            <td className="px-5 py-3">
                                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${statusBadge[row.status] ?? ""}`}>
                                                    {row.status}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Output quality */}
                    <div className="space-y-4">
                        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
                            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-4">Output Quality</h2>
                            <div className="space-y-4">
                                {[
                                    { label: "First-pass acceptance", value: worker.acceptanceRate, color: "bg-emerald-500" },
                                    { label: "Rework rate", value: worker.reworkRate, color: "bg-amber-500" },
                                    { label: "Escalation rate", value: worker.escalationRate, color: "bg-rose-400" },
                                ].map(({ label, value, color }) => (
                                    <div key={label}>
                                        <div className="flex justify-between mb-1.5">
                                            <span className="text-xs text-slate-600 dark:text-slate-400">{label}</span>
                                            <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">{value}%</span>
                                        </div>
                                        <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800">
                                            <div
                                                className={`h-1.5 rounded-full ${color}`}
                                                style={{ width: `${value}%` }}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="bg-gradient-to-br from-emerald-50 to-sky-50 dark:from-emerald-950/20 dark:to-sky-950/20 rounded-2xl border border-emerald-200 dark:border-emerald-900/40 p-5">
                            <div className="flex items-center gap-2 mb-2">
                                <ArrowUpRight className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                                <span className="text-sm font-bold text-slate-900 dark:text-slate-100">This week</span>
                            </div>
                            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                                On track. {worker.tasks} tasks completed with {worker.reliability}% reliability. Estimated team time saved: <strong>{worker.savings}</strong>.
                            </p>
                            <div className="mt-3">
                                <ButtonLink href="/admin/audit" variant="ghost" size="sm" className="!px-0 !py-0 !h-auto text-xs">
                                    View audit log →
                                </ButtonLink>
                            </div>
                        </div>

                        <RiskyActionTrigger agentSlug={slug} agentName={worker.name} />

                        {worker.escalationRate > 20 && (
                            <div className="bg-amber-50 dark:bg-amber-950/20 rounded-2xl border border-amber-200 dark:border-amber-900/40 p-4 flex gap-3">
                                <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                                <p className="text-xs text-amber-800 dark:text-amber-300">
                                    Escalation rate above threshold. Review approval gate settings.
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
