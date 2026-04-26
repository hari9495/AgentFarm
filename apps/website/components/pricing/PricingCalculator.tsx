"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
    Code2,
    Layout,
    TestTube2,
    Server,
    Database,
    GitBranch,
    ShieldCheck,
    LineChart,
    BrainCircuit,
    MessageSquareCode,
    CheckCircle2,
    ArrowRight,
    type LucideIcon,
} from "lucide-react";
import { marketplaceBots, colorMap, type Bot } from "@/lib/bots";

const ICON_MAP: Record<string, LucideIcon> = {
    "ai-backend-developer": Code2,
    "ai-frontend-developer": Layout,
    "ai-qa-engineer": TestTube2,
    "ai-devops-engineer": Server,
    "ai-database-administrator": Database,
    "ai-security-engineer": ShieldCheck,
    "ai-data-engineer": LineChart,
    "ai-ml-engineer": BrainCircuit,
    "ai-technical-writer": MessageSquareCode,
    "ai-code-reviewer": GitBranch,
};

const TEAM_SIZES = [
    { label: "Solo / 1-2 devs", multiplier: 1 },
    { label: "Small team (3-10)", multiplier: 1 },
    { label: "Mid-size (11-50)", multiplier: 1 },
    { label: "Large (50+)", multiplier: 1 },
];

type PlanName = "Starter" | "Pro" | "Enterprise";

function getPlan(botCount: number, totalMonthly: number): PlanName {
    if (botCount >= 6 || totalMonthly >= 500) return "Enterprise";
    if (botCount >= 2 || totalMonthly >= 100) return "Pro";
    return "Starter";
}

const PLAN_DETAILS: Record<
    PlanName,
    { color: string; bg: string; description: string; executions: string }
> = {
    Starter: {
        color: "text-blue-700 dark:text-blue-300",
        bg: "bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800",
        description: "Best for small teams getting started with 1 AI worker.",
        executions: "500 task executions / month",
    },
    Pro: {
        color: "text-purple-700 dark:text-purple-300",
        bg: "bg-purple-50 dark:bg-purple-950/40 border-purple-200 dark:border-purple-800",
        description: "For teams scaling with multiple AI workers in parallel.",
        executions: "5,000 task executions / month",
    },
    Enterprise: {
        color: "text-slate-700 dark:text-slate-200",
        bg: "bg-slate-100 dark:bg-slate-800/60 border-slate-300 dark:border-slate-600",
        description: "Unlimited scale with custom SLAs and dedicated support.",
        executions: "Unlimited executions",
    },
};

function BotToggle({
    bot,
    selected,
    onToggle,
}: {
    bot: Bot;
    selected: boolean;
    onToggle: () => void;
}) {
    const Icon = ICON_MAP[bot.slug] ?? Code2;
    const c = colorMap[bot.color];

    return (
        <button
            type="button"
            onClick={onToggle}
            disabled={!bot.available}
            className={`relative flex items-start gap-3 p-4 rounded-2xl border text-left transition-all cursor-pointer w-full ${!bot.available
                ? "opacity-40 cursor-not-allowed border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40"
                : selected
                    ? `border-blue-500 ring-1 ring-blue-400 bg-blue-50 dark:bg-blue-950 dark:border-blue-600`
                    : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-600 hover:shadow-sm"
                }`}
        >
            {/* Checkmark */}
            {selected && (
                <span className="absolute top-2.5 right-2.5 w-4 h-4 bg-blue-600 rounded-full flex items-center justify-center">
                    <CheckCircle2 className="w-3 h-3 text-white" />
                </span>
            )}

            <div
                className={`w-9 h-9 rounded-xl ${c.bg} flex items-center justify-center shrink-0`}
            >
                <Icon className={`w-4.5 h-4.5 ${c.icon}`} />
            </div>

            <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 leading-snug">
                    {bot.name.replace("AI ", "")}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                    {bot.available ? bot.price : "Coming soon"}
                </p>
            </div>
        </button>
    );
}

export default function PricingCalculator() {
    const defaultSelectedSlug = marketplaceBots.find((b) => b.available)?.slug ?? marketplaceBots[0]?.slug ?? "";
    const [selected, setSelected] = useState<Set<string>>(
        new Set(defaultSelectedSlug ? [defaultSelectedSlug] : [])
    );
    const [teamSize, setTeamSize] = useState(0);

    function toggle(slug: string) {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(slug)) {
                next.delete(slug);
            } else {
                next.add(slug);
            }
            return next;
        });
    }

    const selectedBots = useMemo(
        () => marketplaceBots.filter((b) => selected.has(b.slug)),
        [selected]
    );

    const totalMonthly = useMemo(
        () => selectedBots.reduce((sum, b) => sum + b.priceMonthly, 0),
        [selectedBots]
    );

    const recommendedPlan = getPlan(selectedBots.length, totalMonthly);
    const planInfo = PLAN_DETAILS[recommendedPlan];

    return (
        <section className="py-24 bg-white dark:bg-slate-950 border-b border-slate-100 dark:border-slate-800">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                {/* Header */}
                <div className="text-center mb-12">
                    <span className="text-xs font-semibold uppercase tracking-wider text-blue-600">
                        Pricing Calculator
                    </span>
                    <h2 className="mt-3 text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-slate-100">
                        Build your team, see exact costs
                    </h2>
                    <p className="mt-4 text-lg text-slate-500 dark:text-slate-400 max-w-xl mx-auto">
                        Select the AI workers you need and instantly see your monthly total.
                    </p>
                </div>

                <div className="grid lg:grid-cols-3 gap-10 items-start">
                    {/* Bot selector */}
                    <div className="lg:col-span-2">
                        <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4">
                            Choose your AI workers{" "}
                            <span className="font-normal text-slate-400">
                                (select all that apply)
                            </span>
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {marketplaceBots.map((bot) => (
                                <BotToggle
                                    key={bot.slug}
                                    bot={bot}
                                    selected={selected.has(bot.slug)}
                                    onToggle={() => toggle(bot.slug)}
                                />
                            ))}
                        </div>

                        {/* Team size */}
                        <div className="mt-8">
                            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
                                Team size
                            </p>
                            <div className="flex flex-wrap gap-2">
                                {TEAM_SIZES.map((t, i) => (
                                    <button
                                        key={i}
                                        type="button"
                                        onClick={() => setTeamSize(i)}
                                        className={`px-4 py-2 rounded-full text-sm font-medium transition-colors cursor-pointer ${teamSize === i
                                            ? "bg-blue-600 text-white"
                                            : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
                                            }`}
                                    >
                                        {t.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Summary panel */}
                    <div className="lg:sticky lg:top-24 space-y-4">
                        {/* Price breakdown */}
                        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-6">
                            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-4">
                                Cost breakdown
                            </p>

                            {selectedBots.length === 0 ? (
                                <p className="text-sm text-slate-400 text-center py-4">
                                    Select at least one bot
                                </p>
                            ) : (
                                <>
                                    <ul className="space-y-2 mb-4">
                                        {selectedBots.map((b) => {
                                            const c = colorMap[b.color];
                                            const Icon = ICON_MAP[b.slug] ?? Code2;
                                            return (
                                                <li
                                                    key={b.slug}
                                                    className="flex items-center justify-between gap-3 text-sm"
                                                >
                                                    <div className="flex items-center gap-2">
                                                        <div
                                                            className={`w-6 h-6 rounded-lg ${c.bg} flex items-center justify-center`}
                                                        >
                                                            <Icon className={`w-3 h-3 ${c.icon}`} />
                                                        </div>
                                                        <span className="text-slate-700 dark:text-slate-300">
                                                            {b.name.replace("AI ", "")}
                                                        </span>
                                                    </div>
                                                    <span className="font-medium text-slate-900 dark:text-slate-100 shrink-0">
                                                        {b.price}
                                                    </span>
                                                </li>
                                            );
                                        })}
                                    </ul>

                                    <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-baseline justify-between">
                                        <span className="text-sm text-slate-500 dark:text-slate-400">
                                            Monthly total
                                        </span>
                                        <div className="text-right">
                                            <span className="text-3xl font-extrabold text-slate-900 dark:text-slate-100">
                                                ${totalMonthly}
                                            </span>
                                            <span className="text-sm text-slate-400">/mo</span>
                                        </div>
                                    </div>
                                    <p className="text-xs text-slate-400 mt-1 text-right">
                                        14-day free trial - no credit card needed
                                    </p>
                                </>
                            )}
                        </div>

                        {/* Recommended plan */}
                        {selectedBots.length > 0 && (
                            <div
                                className={`border rounded-2xl p-5 ${planInfo.bg}`}
                            >
                                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                                    Recommended plan
                                </p>
                                <p className={`text-xl font-extrabold ${planInfo.color} mb-1`}>
                                    {recommendedPlan}
                                </p>
                                <p className="text-xs text-slate-600 dark:text-slate-400 mb-2">
                                    {planInfo.description}
                                </p>
                                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                                    Includes {planInfo.executions}
                                </p>
                            </div>
                        )}

                        {/* CTA */}
                        <Link
                            href="/checkout"
                            className="flex items-center justify-center gap-2 w-full px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-2xl transition-colors"
                        >
                            Build this team
                            <ArrowRight className="w-4 h-4" />
                        </Link>
                        <p className="text-xs text-center text-slate-400">
                            Free trial - no credit card required
                        </p>
                    </div>
                </div>
            </div>
        </section>
    );
}

