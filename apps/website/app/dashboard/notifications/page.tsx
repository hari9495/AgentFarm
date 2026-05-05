import type { Metadata } from "next";
import { Bell, CheckCircle2, CreditCard, Info, ShieldAlert, Zap } from "lucide-react";
import PremiumIcon from "@/components/shared/PremiumIcon";
import type { LucideIcon } from "lucide-react";

export const metadata: Metadata = {
    title: "Notifications - AgentFarm Dashboard",
    description: "System alerts, approval outcomes, and deployment events.",
};

type NotifLevel = "info" | "success" | "warning" | "critical";

type Notification = {
    id: string;
    title: string;
    body: string;
    level: NotifLevel;
    time: string;
    read: boolean;
    icon: LucideIcon;
};

const notifications: Notification[] = [
    {
        id: "n1",
        title: "Approval granted — deploy production hotfix",
        body: "AI Backend Developer's PR #482 was approved by Alex Rivera and is queued for merge.",
        level: "success",
        time: "2m ago",
        read: false,
        icon: CheckCircle2,
    },
    {
        id: "n2",
        title: "High-risk action pending review",
        body: "AI DevOps Engineer has requested approval to rotate cloud tokens in production.",
        level: "critical",
        time: "14m ago",
        read: false,
        icon: ShieldAlert,
    },
    {
        id: "n3",
        title: "Deployment to staging succeeded",
        body: "Canary release of auth service v2.3.1 completed with 0 failures across 3 instances.",
        level: "success",
        time: "1h ago",
        read: false,
        icon: Zap,
    },
    {
        id: "n4",
        title: "Seat limit approaching",
        body: "You are using 46 of 50 seats on the Pro+ plan. Consider upgrading before onboarding new workers.",
        level: "warning",
        time: "3h ago",
        read: true,
        icon: CreditCard,
    },
    {
        id: "n5",
        title: "New skill available: workspace_semantic_search",
        body: "A new code intelligence skill is available for assignment to your AI Backend Developer.",
        level: "info",
        time: "5h ago",
        read: true,
        icon: Info,
    },
    {
        id: "n6",
        title: "MFA reminder",
        body: "2 invited members have not enabled MFA. Remind them from the Security panel.",
        level: "warning",
        time: "1d ago",
        read: true,
        icon: ShieldAlert,
    },
    {
        id: "n7",
        title: "Monthly spend report ready",
        body: "Your April 2026 spend report is available for download in Admin › Billing.",
        level: "info",
        time: "2d ago",
        read: true,
        icon: CreditCard,
    },
];

const levelStyle: Record<NotifLevel, { container: string; dot: string }> = {
    critical: {
        container: "border-l-4 border-l-rose-500 bg-rose-50 dark:bg-rose-950/20",
        dot: "bg-rose-500",
    },
    warning: {
        container: "border-l-4 border-l-amber-500 bg-amber-50 dark:bg-amber-950/20",
        dot: "bg-amber-500",
    },
    success: {
        container: "border-l-4 border-l-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/10",
        dot: "bg-emerald-500",
    },
    info: {
        container: "border-l-4 border-l-sky-400 bg-white dark:bg-slate-900",
        dot: "bg-sky-400",
    },
};

const levelIconTone: Record<NotifLevel, "rose" | "amber" | "emerald" | "sky"> = {
    critical: "rose",
    warning: "amber",
    success: "emerald",
    info: "sky",
};

const unread = notifications.filter((n) => !n.read).length;

export default function DashboardNotificationsPage() {
    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
            {/* Header */}
            <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-5 md:px-8">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <PremiumIcon icon={Bell} tone="sky" containerClassName="h-9 w-9 rounded-xl bg-sky-100 dark:bg-sky-900/40 text-sky-600 dark:text-sky-400" iconClassName="w-5 h-5" />
                            {unread > 0 && (
                                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center">
                                    {unread}
                                </span>
                            )}
                        </div>
                        <div>
                            <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">Notifications</h1>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                                {unread} unread · {notifications.length} total
                            </p>
                        </div>
                    </div>
                    <button className="text-xs font-semibold text-sky-600 dark:text-sky-400 hover:underline">
                        Mark all read
                    </button>
                </div>
            </div>

            <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-3">
                {notifications.map((notif) => {
                    const style = levelStyle[notif.level];
                    const tone = levelIconTone[notif.level];
                    return (
                        <div
                            key={notif.id}
                            className={`rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden ${style.container} transition-opacity ${notif.read ? "opacity-70" : ""}`}
                        >
                            <div className="flex items-start gap-3 px-5 py-4">
                                <PremiumIcon icon={notif.icon} tone={tone} containerClassName="w-8 h-8 rounded-xl shrink-0 mt-0.5" iconClassName="w-4 h-4" />
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{notif.title}</p>
                                        {!notif.read && (
                                            <span className={`w-2 h-2 rounded-full shrink-0 ${style.dot}`} />
                                        )}
                                    </div>
                                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">{notif.body}</p>
                                    <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-2 font-mono">{notif.time}</p>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
