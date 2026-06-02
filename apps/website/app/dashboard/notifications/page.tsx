import type { Metadata } from "next";
import { Bell, CheckCircle2, ChevronRight, CreditCard, Info, ShieldAlert, Zap } from "lucide-react";
import PremiumIcon from "@/components/shared/PremiumIcon";
import type { LucideIcon } from "lucide-react";

export const metadata: Metadata = {
    title: "Notifications - AgentFarms Dashboard",
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
        <div className="min-h-screen bg-slate-50">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-6 space-y-6">

                {/* Dark hero */}
                <section className="relative overflow-hidden rounded-2xl bg-slate-950">
                    <div className="absolute inset-0 pointer-events-none">
                        <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_80%_at_0%_0%,rgba(14,165,233,0.18)_0%,transparent_60%)]" />
                        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_70%_at_100%_100%,rgba(16,185,129,0.12)_0%,transparent_60%)]" />
                        <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: "radial-gradient(circle, rgba(255,255,255,1) 1px, transparent 1px)", backgroundSize: "24px 24px" }} />
                    </div>
                    <div className="relative px-6 sm:px-8 py-6 sm:py-8">
                        <div className="flex items-center gap-2 mb-4">
                            <div className="flex items-center gap-2 rounded-xl bg-sky-500/10 border border-sky-500/20 px-3 py-1.5 text-xs font-bold uppercase tracking-widest text-sky-400">
                                <Bell className="w-3.5 h-3.5" />
                                Notifications
                            </div>
                            <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
                            <span className="text-xs text-slate-500">{unread} unread</span>
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-5">
                            <div>
                                <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight leading-tight">Notifications</h1>
                                <p className="mt-2 text-slate-400 text-base max-w-lg">System alerts, approval outcomes, and deployment events.</p>
                            </div>
                            <button className="text-xs font-semibold text-sky-400 border border-sky-500/30 hover:border-sky-400/60 bg-sky-500/10 hover:bg-sky-500/20 rounded-lg px-4 py-2 transition-colors shrink-0">
                                Mark all read
                            </button>
                        </div>
                    </div>
                </section>

                <div className="space-y-3">
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
        </div>
    );
}
