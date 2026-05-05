"use client";
import { useState } from "react";
import {
    AlertTriangle,
    CheckCircle2,
    ClipboardList,
    Download,
    GitPullRequest,
    KeyRound,
    Settings2,
    Shield,
    UserCheck,
    UserPlus,
    Zap,
    type LucideIcon,
} from "lucide-react";
import PremiumIcon from "@/components/shared/PremiumIcon";

type EventType = "agent_action" | "approval" | "user_change" | "system";

const events: {
    id: string;
    ts: string;
    ago: string;
    type: EventType;
    actor: string;
    actorKind: "agent" | "human" | "system";
    action: string;
    description: string;
    meta?: string;
}[] = [
        {
            id: "evt-001",
            ts: "2026-04-22 10:42:17",
            ago: "8m ago",
            type: "agent_action",
            actor: "AI Backend Developer",
            actorKind: "agent",
            action: "PR opened",
            description: "Opened PR #482 — billing webhook retry logic with exponential back-off",
            meta: "github / main ← feat/billing-retry",
        },
        {
            id: "evt-002",
            ts: "2026-04-22 10:31:04",
            ago: "19m ago",
            type: "approval",
            actor: "Jane Doe",
            actorKind: "human",
            action: "Approved",
            description: "Approved production deploy of hotfix #479 — auth token timeout patch",
            meta: "risk: high · deploy:production",
        },
        {
            id: "evt-003",
            ts: "2026-04-22 09:57:41",
            ago: "53m ago",
            type: "agent_action",
            actor: "AI QA Engineer",
            actorKind: "agent",
            action: "Test run",
            description: "Ran full regression suite — 1,248 tests, 0 failures, posted report to Slack #qa",
            meta: "duration: 4m 12s · coverage: 94.2%",
        },
        {
            id: "evt-004",
            ts: "2026-04-22 09:44:00",
            ago: "1h ago",
            type: "user_change",
            actor: "Alex Rivera",
            actorKind: "human",
            action: "Role updated",
            description: "Changed Jordan Kim's role from Security Viewer → Security Engineer",
            meta: "admin/users",
        },
        {
            id: "evt-005",
            ts: "2026-04-22 09:31:28",
            ago: "1h ago",
            type: "agent_action",
            actor: "AI DevOps Engineer",
            actorKind: "agent",
            action: "Canary deploy",
            description: "Rolled out canary release v2.14.0 to staging (10% traffic split)",
            meta: "k8s / staging · rollout: canary-v2.14.0",
        },
        {
            id: "evt-006",
            ts: "2026-04-22 09:12:55",
            ago: "1h ago",
            type: "approval",
            actor: "Priya Nair",
            actorKind: "human",
            action: "Rejected",
            description: "Rejected schema migration PR #477 — missing rollback procedure",
            meta: "risk: high · reason: no rollback plan",
        },
        {
            id: "evt-007",
            ts: "2026-04-22 08:57:03",
            ago: "2h ago",
            type: "agent_action",
            actor: "AI Security Engineer",
            actorKind: "agent",
            action: "Vulnerability flag",
            description: "Flagged CVE-2024-7891 in lodash@4.17.20 — severity high, CVSS 8.1",
            meta: "pkg: lodash@4.17.20 · fix: upgrade to 4.17.21",
        },
        {
            id: "evt-008",
            ts: "2026-04-22 08:30:11",
            ago: "2h ago",
            type: "user_change",
            actor: "Sam Okafor",
            actorKind: "human",
            action: "Seat added",
            description: "Provisioned new seat for inbound engineer hire — invite sent to maya@acme.io",
            meta: "billing / seat 47 of 50",
        },
        {
            id: "evt-009",
            ts: "2026-04-22 08:12:00",
            ago: "2h ago",
            type: "system",
            actor: "System",
            actorKind: "system",
            action: "Token rotated",
            description: "API token for build worker auto-rotated on 90-day schedule",
            meta: "token: bw-prod-* · next rotation: 2026-07-22",
        },
        {
            id: "evt-010",
            ts: "2026-04-22 07:45:30",
            ago: "3h ago",
            type: "agent_action",
            actor: "AI Backend Developer",
            actorKind: "agent",
            action: "Commit pushed",
            description: "Pushed 3 commits to feat/billing-retry — rate limiter, retry config, unit tests",
            meta: "github / feat/billing-retry · +247 −18",
        },
        {
            id: "evt-011",
            ts: "2026-04-22 07:01:14",
            ago: "3h ago",
            type: "approval",
            actor: "Jane Doe",
            actorKind: "human",
            action: "Approved",
            description: "Approved AI DevOps Engineer request to rotate cloud IAM credentials",
            meta: "risk: medium · scope: cloud-iam-prod",
        },
        {
            id: "evt-012",
            ts: "2026-04-22 06:30:00",
            ago: "4h ago",
            type: "user_change",
            actor: "Alex Rivera",
            actorKind: "human",
            action: "Policy updated",
            description: "Updated approval gate rule: high-risk deploys now require 2 reviewers",
            meta: "policy: deploy-high-risk · version: v3",
        },
    ];

const typeConfig: Record<
    EventType,
    { label: string; icon: LucideIcon; bg: string; color: string; badge: string }
> = {
    agent_action: {
        label: "Agent Action",
        icon: Zap,
        bg: "bg-sky-100 dark:bg-sky-900/40",
        color: "text-sky-600 dark:text-sky-400",
        badge: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
    },
    approval: {
        label: "Approval",
        icon: CheckCircle2,
        bg: "bg-emerald-100 dark:bg-emerald-900/40",
        color: "text-emerald-600 dark:text-emerald-400",
        badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
    },
    user_change: {
        label: "User Change",
        icon: UserCheck,
        bg: "bg-violet-100 dark:bg-violet-900/40",
        color: "text-violet-600 dark:text-violet-400",
        badge: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
    },
    system: {
        label: "System",
        icon: Settings2,
        bg: "bg-slate-100 dark:bg-slate-800",
        color: "text-slate-600 dark:text-slate-400",
        badge: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
    },
};

const actionIcon: Record<string, LucideIcon> = {
    "PR opened": GitPullRequest,
    "Approved": CheckCircle2,
    "Rejected": AlertTriangle,
    "Test run": CheckCircle2,
    "Role updated": UserCheck,
    "Canary deploy": Zap,
    "Vulnerability flag": Shield,
    "Seat added": UserPlus,
    "Token rotated": KeyRound,
    "Commit pushed": GitPullRequest,
    "Policy updated": Settings2,
};

const TIME_RANGES = ["Last hour", "Today", "This week", "All"] as const;
type TimeRange = (typeof TIME_RANGES)[number];

const TYPE_TABS = ["All", "Agent Actions", "Approvals", "User Changes", "System"] as const;
type TypeTab = (typeof TYPE_TABS)[number];

function downloadCsv(data: typeof events) {
    const header = "id,timestamp,ago,type,actor,action,description,meta";
    const rows = data.map((e) =>
        [e.id, e.ts, e.ago, e.type, `"${e.actor}"`, `"${e.action}"`, `"${e.description}"`, `"${e.meta ?? ""}"`].join(",")
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "audit-log.csv";
    a.click();
    URL.revokeObjectURL(url);
}

export default function AuditPage() {
    const [typeTab, setTypeTab] = useState<TypeTab>("All");
    const [timeRange, setTimeRange] = useState<TimeRange>("All");

    const filteredEvents = events.filter((evt) => {
        const typeMatch =
            typeTab === "All" ||
            (typeTab === "Agent Actions" && evt.type === "agent_action") ||
            (typeTab === "Approvals" && evt.type === "approval") ||
            (typeTab === "User Changes" && evt.type === "user_change") ||
            (typeTab === "System" && evt.type === "system");
        const agoNum = parseInt(evt.ago);
        const timeMatch =
            timeRange === "All" ||
            (timeRange === "Last hour" && evt.ago.includes("m ") && agoNum < 60) ||
            (timeRange === "Today" && (evt.ago.includes("m ") || evt.ago.includes("h "))) ||
            (timeRange === "This week" && !evt.ago.includes("d ") || evt.ago.includes("h ") || evt.ago.includes("m "));
        return typeMatch && timeMatch;
    });

    return (
        <div className="site-shell min-h-screen">
            {/* Header */}
            <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-5 md:px-8">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <PremiumIcon icon={ClipboardList} tone="violet" containerClassName="h-9 w-9 rounded-xl bg-violet-100 dark:bg-violet-900/40 shrink-0 text-violet-600 dark:text-violet-400" iconClassName="w-5 h-5" />
                        <div>
                            <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">Audit Log</h1>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                                Every agent action, user change, and approval decision — last 24 hours
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            Live
                        </span>
                        <span className="text-xs text-slate-400 dark:text-slate-500">{filteredEvents.length} events</span>
                        <button
                            onClick={() => downloadCsv(filteredEvents)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                        >
                            <Download className="w-3.5 h-3.5" /> Export CSV
                        </button>
                    </div>
                </div>

                {/* Time range filters */}
                <div className="flex gap-1.5 mt-3 flex-wrap">
                    {TIME_RANGES.map((tr) => (
                        <button
                            key={tr}
                            onClick={() => setTimeRange(tr)}
                            className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors border ${timeRange === tr
                                ? "bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 border-slate-900 dark:border-slate-100"
                                : "border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-slate-400 dark:hover:border-slate-500"
                                }`}
                        >
                            {tr}
                        </button>
                    ))}
                </div>

                {/* Filter tabs */}
                <div className="flex gap-1 mt-4 flex-wrap">
                    {TYPE_TABS.map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setTypeTab(tab)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${typeTab === tab
                                ? "bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900"
                                : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                                }`}
                        >
                            {tab}
                        </button>
                    ))}
                </div>
            </div>

            {/* Event feed */}
            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="relative">
                    {/* Vertical timeline line */}
                    <div className="absolute left-5 top-0 bottom-0 w-px bg-slate-200 dark:bg-slate-800" />

                    <div className="space-y-1">
                        {filteredEvents.map((evt) => {
                            const cfg = typeConfig[evt.type];
                            const TypeIcon = cfg.icon;
                            const ActionIcon = actionIcon[evt.action] ?? Zap;
                            return (
                                <div
                                    key={evt.id}
                                    className="relative flex gap-4 pl-14 pr-4 py-4 rounded-xl hover:bg-white dark:hover:bg-slate-900/60 transition-colors group"
                                >
                                    {/* Timeline dot + icon */}
                                    <div className="absolute left-2 top-3.5">
                                        <PremiumIcon
                                            icon={TypeIcon}
                                            tone="sky"
                                            containerClassName={`h-6 w-6 rounded-full ${cfg.bg} ${cfg.color} ring-2 ring-slate-50 dark:ring-slate-950 shrink-0`}
                                            iconClassName="w-3.5 h-3.5"
                                        />
                                    </div>

                                    <div className="flex-1 min-w-0">
                                        <div className="flex flex-wrap items-center gap-2 mb-1">
                                            {/* Actor */}
                                            {evt.actorKind === "agent" ? (
                                                <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-700 dark:text-slate-300">
                                                    <span className="h-4 w-4 rounded-full bg-sky-100 dark:bg-sky-900/40 flex items-center justify-center text-[8px] font-bold text-sky-700 dark:text-sky-300">
                                                        {evt.actor.split(" ").map((w) => w[0]).join("").slice(0, 2)}
                                                    </span>
                                                    {evt.actor}
                                                </span>
                                            ) : evt.actorKind === "human" ? (
                                                <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-700 dark:text-slate-300">
                                                    <span className="h-4 w-4 rounded-full bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center text-[8px] font-bold text-violet-700 dark:text-violet-300">
                                                        {evt.actor.split(" ").map((w) => w[0]).join("").slice(0, 2)}
                                                    </span>
                                                    {evt.actor}
                                                </span>
                                            ) : (
                                                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                                                    {evt.actor}
                                                </span>
                                            )}

                                            {/* Action badge */}
                                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${cfg.badge}`}>
                                                <PremiumIcon icon={ActionIcon} tone="slate" containerClassName="w-4 h-4 rounded-sm bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400" iconClassName="w-2 h-2" />
                                                {evt.action}
                                            </span>

                                            {/* Type badge */}
                                            <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500">
                                                {cfg.label}
                                            </span>
                                        </div>

                                        {/* Description */}
                                        <p className="text-sm text-slate-700 dark:text-slate-300 leading-snug">
                                            {evt.description}
                                        </p>

                                        {/* Meta + timestamp */}
                                        <div className="flex flex-wrap items-center gap-3 mt-1.5">
                                            {evt.meta && (
                                                <span className="text-[11px] font-mono text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                                                    {evt.meta}
                                                </span>
                                            )}
                                            <span className="text-[11px] text-slate-400 dark:text-slate-500">
                                                {evt.ts} · {evt.ago}
                                            </span>
                                            <span className="text-[10px] font-mono text-slate-300 dark:text-slate-600">
                                                {evt.id}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Load more */}
                <div className="mt-6 text-center">
                    <button className="px-5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-900 transition-colors">
                        Load earlier events
                    </button>
                </div>
            </div>
        </div>
    );
}
