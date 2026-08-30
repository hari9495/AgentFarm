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
            <div className="bg-[var(--card)] dark:bg-[var(--card)] rounded-[4px] border border-[color:var(--line)] dark:border-[color:var(--line)] p-5 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-semibold text-[color:var(--ink)] dark:text-[color:var(--ink)]">
                        {allDone ? "All steps complete" : `${doneCount} of ${steps.length} complete`}
                    </span>
                    <span className="text-sm font-bold text-[color:var(--accent)] dark:text-[color:var(--accent)]">{pct}%</span>
                </div>
                <div className="h-2 bg-[var(--bg-deep)] dark:bg-[var(--card)] rounded-full overflow-hidden">
                    <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                            width: `${pct}%`,
                            background: allDone
                                ? "linear-gradient(90deg,#059669,#10b981)"
                                : "linear-gradient(90deg,#1d4ed8,#3b82f6)",
                        }}
                    />
                </div>
                {allDone && (
                    <p className="mt-3 text-sm text-[color:var(--ok)] dark:text-[color:var(--ok)] font-medium">
                        🎉 All set! Your agents are fully configured and running.
                    </p>
                )}
            </div>

            {/* Steps */}
            <div className="bg-[var(--card)] dark:bg-[var(--card)] rounded-[4px] border border-[color:var(--line)] dark:border-[color:var(--line)] overflow-hidden shadow-sm divide-y divide-[color:var(--line)] dark:divide-[color:var(--line)]">
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
                                    <CheckCircle2 className="h-5 w-5 text-[color:var(--ok)]" />
                                ) : (
                                    <Circle className="h-5 w-5 text-[color:var(--ink-muted)] dark:text-[color:var(--ink-soft)]" />
                                )}
                            </div>

                            {/* Content */}
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-0.5">
                                    <Icon className={`h-3.5 w-3.5 shrink-0 ${step.done ? "text-[color:var(--ink-muted)]" : "text-[color:var(--accent)] dark:text-[color:var(--accent)]"}`} />
                                    <span className={`text-sm font-semibold ${step.done ? "line-through text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)]" : "text-[color:var(--ink)] dark:text-[color:var(--ink)]"}`}>
                                        {step.title}
                                    </span>
                                </div>
                                <p className="text-xs text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)] leading-relaxed">
                                    {step.description}
                                </p>
                            </div>

                            {/* CTA */}
                            {!step.done && (
                                <Link
                                    href={step.href}
                                    className="flex items-center gap-1 shrink-0 text-xs font-semibold text-[color:var(--accent)] dark:text-[color:var(--accent)] hover:text-[color:var(--accent)] dark:hover:text-[color:var(--accent)] transition-colors mt-0.5"
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
                <p className="text-xs font-semibold text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)] uppercase tracking-wide mb-2 px-1">
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
                            className="flex items-center gap-3 bg-[var(--card)] dark:bg-[var(--card)] rounded-[3px] border border-[color:var(--line)] dark:border-[color:var(--line)] px-4 py-3 hover:bg-[var(--bg-deep)] dark:hover:bg-[var(--card)]/70 transition-colors shadow-sm"
                        >
                            <div className="h-8 w-8 rounded-[3px] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--accent)_22%,transparent)]/40 flex items-center justify-center shrink-0">
                                <Icon className="h-4 w-4 text-[color:var(--accent)] dark:text-[color:var(--accent)]" />
                            </div>
                            <div>
                                <div className="text-sm font-medium text-[color:var(--ink)] dark:text-[color:var(--ink)]">{label}</div>
                                <div className="text-xs text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)]">{desc}</div>
                            </div>
                        </Link>
                    ))}
                </div>
            </div>
        </div>
    );
}
