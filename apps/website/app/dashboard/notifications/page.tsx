import type { Metadata } from "next";
import { Bell, CheckCircle2, ChevronRight, Cpu, Info, Rocket, ShieldAlert } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import PremiumIcon from "@/components/shared/PremiumIcon";
import MarkAllReadButton from "@/components/dashboard/MarkAllReadButton";

export const metadata: Metadata = {
    title: "Notifications - AgentFarms Dashboard",
    description: "System alerts, approval outcomes, and deployment events.",
};

type NotificationLevel = "critical" | "warning" | "success" | "info";

type DerivedNotification = {
    id: string;
    title: string;
    body: string;
    level: NotificationLevel;
    category: "approval" | "agent" | "deployment";
    read: boolean;
    createdAt: number;
};

const levelStyle: Record<NotificationLevel, { container: string; dot: string }> = {
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
        container: "border-l-4 border-l-blue-400 bg-white dark:bg-slate-900",
        dot: "bg-blue-400",
    },
};

const levelIconTone: Record<NotificationLevel, "rose" | "amber" | "emerald" | "sky"> = {
    critical: "rose",
    warning: "amber",
    success: "emerald",
    info: "sky",
};

const categoryIcon: Record<DerivedNotification["category"], LucideIcon> = {
    approval: ShieldAlert,
    agent: Cpu,
    deployment: Rocket,
};

const levelFallbackIcon: Record<NotificationLevel, LucideIcon> = {
    critical: ShieldAlert,
    warning: Info,
    success: CheckCircle2,
    info: Info,
};

function iconForNotification(notif: DerivedNotification): LucideIcon {
    if (notif.category === "approval" && notif.level === "success") return CheckCircle2;
    return categoryIcon[notif.category] ?? levelFallbackIcon[notif.level];
}

function formatRelativeTime(ts: number): string {
    if (!ts) return "Just now";
    const diff = Date.now() - ts;
    if (diff < 60_000) return "Just now";
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    if (diff < 86_400_000 * 7) return `${Math.floor(diff / 86_400_000)}d ago`;
    return new Date(ts).toLocaleDateString();
}

export default async function DashboardNotificationsPage() {
    // Notifications are populated as agents take actions.
    // Empty until agents are deployed and running.
    const notifications: DerivedNotification[] = [];
    const unread = 0;

    return (
        <div className="min-h-screen bg-slate-50">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-6 space-y-6">

                {/* Dark hero */}
                <section className="relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-blue-50 via-white to-white">
                    <div className="absolute inset-0 pointer-events-none">
                        <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_80%_at_0%_0%,rgba(37,99,235,0.10)_0%,transparent_60%)]" />
                        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_70%_at_100%_100%,rgba(16,185,129,0.07)_0%,transparent_60%)]" />
                        <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: "radial-gradient(circle, rgba(37,99,235,1) 1px, transparent 1px)", backgroundSize: "24px 24px" }} />
                    </div>
                    <div className="relative px-6 sm:px-8 py-6 sm:py-8">
                        <div className="flex items-center gap-2 mb-4">
                            <div className="flex items-center gap-2 rounded-xl bg-blue-50 border border-blue-200 px-3 py-1.5 text-xs font-bold uppercase tracking-widest text-blue-700">
                                <Bell className="w-3.5 h-3.5" />
                                Notifications
                            </div>
                            <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
                            <span className="text-xs text-slate-500">{unread} unread</span>
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-5">
                            <div>
                                <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight leading-tight">Notifications</h1>
                                <p className="mt-2 text-slate-600 text-base max-w-lg">System alerts, approval outcomes, and deployment events.</p>
                            </div>
                            <MarkAllReadButton disabled={unread === 0} />
                        </div>
                    </div>
                </section>

                {notifications.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-6 py-14 text-center">
                        <div className="mx-auto w-12 h-12 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-4">
                            <Bell className="w-5 h-5 text-slate-400" />
                        </div>
                        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">You&apos;re all caught up</p>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                            New approval requests, agent status changes, and deployment events will show up here as they happen.
                        </p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {notifications.map((notif) => {
                            const style = levelStyle[notif.level];
                            const tone = levelIconTone[notif.level];
                            const Icon = iconForNotification(notif);
                            return (
                                <div
                                    key={notif.id}
                                    className={`rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden ${style.container} transition-opacity ${notif.read ? "opacity-70" : ""}`}
                                >
                                    <div className="flex items-start gap-3 px-5 py-4">
                                        <PremiumIcon icon={Icon} tone={tone} containerClassName="w-8 h-8 rounded-xl shrink-0 mt-0.5" iconClassName="w-4 h-4" />
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{notif.title}</p>
                                                {!notif.read && (
                                                    <span className={`w-2 h-2 rounded-full shrink-0 ${style.dot}`} />
                                                )}
                                            </div>
                                            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">{notif.body}</p>
                                            <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-2 font-mono">{formatRelativeTime(notif.createdAt)}</p>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

            </div>
        </div>
    );
}
