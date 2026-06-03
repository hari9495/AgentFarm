"use client";

import Link from "next/link";
import { CheckCircle2, Circle, ChevronRight, Bot, Plug, Zap, CalendarDays, Package } from "lucide-react";

type Props = {
    hasActiveAgent: boolean;
    hasAnyAgent: boolean;
    totalTasks: number;
    hasConnector: boolean;
    hasSchedule: boolean;
};

type Step = {
    id: string;
    title: string;
    description: string;
    icon: React.ComponentType<{ className?: string }>;
    done: boolean;
    href: string;
    cta: string;
};

export default function OnboardingChecklist({
    hasActiveAgent,
    hasAnyAgent,
    totalTasks,
    hasConnector,
    hasSchedule,
}: Props) {
    const steps: Step[] = [
        {
            id: "account",
            title: "Account created",
            description: "You're logged in and ready to go.",
            icon: CheckCircle2,
            done: true,
            href: "/portal/profile",
            cta: "View profile",
        },
        {
            id: "agent",
            title: "Agent is active",
            description: "Your workspace needs at least one running agent to execute tasks.",
            icon: Bot,
            done: hasActiveAgent,
            href: "/portal/agents",
            cta: hasAnyAgent ? "View agents" : "See agents",
        },
        {
            id: "connector",
            title: "Connect an integration",
            description: "Link Slack, GitHub, Jira, or another tool so agents can take action.",
            icon: Plug,
            done: hasConnector,
            href: "/portal/connectors",
            cta: "Set up integrations",
        },
        {
            id: "task",
            title: "First task completed",
            description: `${totalTasks > 0 ? `${totalTasks} task${totalTasks > 1 ? "s" : ""} completed.` : "Agents haven't run any tasks yet."} Ask your operator to dispatch a task.`,
            icon: Zap,
            done: totalTasks > 0,
            href: "/portal/usage",
            cta: "View usage",
        },
        {
            id: "schedule",
            title: "Schedule a recurring task",
            description: "Automate repetitive work — run tasks on a schedule without manual triggers.",
            icon: CalendarDays,
            done: hasSchedule,
            href: "/portal/usage",
            cta: "Ask your operator",
        },
    ];

    const doneCount = steps.filter((s) => s.done).length;
    const pct = Math.round((doneCount / steps.length) * 100);
    const allDone = doneCount === steps.length;

    return (
        <div className="space-y-4">
            {/* Progress header */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {allDone ? "All steps complete" : `${doneCount} of ${steps.length} complete`}
                    </span>
                    <span className="text-sm font-bold text-sky-600 dark:text-sky-400">{pct}%</span>
                </div>
                <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                            width: `${pct}%`,
                            background: allDone
                                ? "linear-gradient(90deg,#059669,#10b981)"
                                : "linear-gradient(90deg,#0284c7,#38bdf8)",
                        }}
                    />
                </div>
                {allDone && (
                    <p className="mt-3 text-sm text-emerald-600 dark:text-emerald-400 font-medium">
                        🎉 All set! Your agents are fully configured and running.
                    </p>
                )}
            </div>

            {/* Steps */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm divide-y divide-slate-100 dark:divide-slate-800">
                {steps.map((step) => {
                    const Icon = step.icon;
                    return (
                        <div
                            key={step.id}
                            className={`flex items-start gap-4 px-5 py-4 ${step.done ? "opacity-70" : ""}`}
                        >
                            {/* Status icon */}
                            <div className="mt-0.5 shrink-0">
                                {step.done ? (
                                    <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                                ) : (
                                    <Circle className="h-5 w-5 text-slate-300 dark:text-slate-600" />
                                )}
                            </div>

                            {/* Content */}
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-0.5">
                                    <Icon className={`h-3.5 w-3.5 shrink-0 ${step.done ? "text-slate-400" : "text-sky-600 dark:text-sky-400"}`} />
                                    <span className={`text-sm font-semibold ${step.done ? "line-through text-slate-400 dark:text-slate-500" : "text-slate-900 dark:text-slate-100"}`}>
                                        {step.title}
                                    </span>
                                </div>
                                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                                    {step.description}
                                </p>
                            </div>

                            {/* CTA */}
                            {!step.done && (
                                <Link
                                    href={step.href}
                                    className="flex items-center gap-1 shrink-0 text-xs font-semibold text-sky-600 dark:text-sky-400 hover:text-sky-700 dark:hover:text-sky-300 transition-colors mt-0.5"
                                >
                                    {step.cta}
                                    <ChevronRight className="h-3 w-3" />
                                </Link>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Quick links */}
            <div>
                <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-2 px-1">
                    Explore
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {[
                        { href: "/portal/agents",     label: "Your agents",   icon: Bot,         desc: "View and monitor agents" },
                        { href: "/portal/connectors", label: "Integrations",  icon: Plug,        desc: "Connect tools and services" },
                        { href: "/portal/usage",      label: "Usage & costs", icon: Package,     desc: "Track tasks and spending" },
                    ].map(({ href, label, icon: Icon, desc }) => (
                        <Link
                            key={href}
                            href={href}
                            className="flex items-center gap-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/70 transition-colors shadow-sm"
                        >
                            <div className="h-8 w-8 rounded-lg bg-sky-50 dark:bg-sky-950/40 flex items-center justify-center shrink-0">
                                <Icon className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                            </div>
                            <div>
                                <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{label}</div>
                                <div className="text-xs text-slate-400 dark:text-slate-500">{desc}</div>
                            </div>
                        </Link>
                    ))}
                </div>
            </div>
        </div>
    );
}
