"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import {
    Code2, BarChart3, Users, DollarSign, MessageCircle,
    Megaphone, ShieldCheck, Target, Briefcase, ArrowRight,
    Sparkles, ChevronRight,
} from "lucide-react";
import { marketplaceBots } from "@/lib/bots";
import { useCart } from "@/lib/cart-store";

type TeamSize = "1-5" | "6-20" | "21-50" | "50+";
type FocusArea = "engineering" | "marketing" | "finance" | "hr" | "customer-success" | "security" | "product" | "operations";

const FOCUS_AREAS: Array<{ value: FocusArea; label: string; icon: typeof Code2; dept: string }> = [
    { value: "engineering", label: "Engineering", icon: Code2, dept: "Engineering" },
    { value: "product", label: "Product & Design", icon: Target, dept: "Product" },
    { value: "marketing", label: "Marketing", icon: Megaphone, dept: "Marketing" },
    { value: "finance", label: "Finance", icon: DollarSign, dept: "Finance" },
    { value: "hr", label: "HR & Talent", icon: Users, dept: "HR & Talent" },
    { value: "customer-success", label: "Customer Success", icon: MessageCircle, dept: "Customer Success" },
    { value: "security", label: "Security", icon: ShieldCheck, dept: "Security" },
    { value: "operations", label: "Operations", icon: Briefcase, dept: "Operations" },
];

const SIZE_MULTIPLIER: Record<TeamSize, number> = {
    "1-5": 1,
    "6-20": 2,
    "21-50": 3,
    "50+": 4,
};

export default function TeamBuilderWizard() {
    const [step, setStep] = useState<1 | 2 | 3>(1);
    const [teamSize, setTeamSize] = useState<TeamSize | null>(null);
    const [focusAreas, setFocusAreas] = useState<Set<FocusArea>>(new Set());
    const { addBot, hasBot } = useCart();

    const toggleFocus = (v: FocusArea) => {
        setFocusAreas((prev) => {
            const next = new Set(prev);
            if (next.has(v)) next.delete(v);
            else next.add(v);
            return next;
        });
    };

    // Recommend: 1-2 available bots per selected dept, scaled by team size
    const recommendations = (() => {
        if (!teamSize || focusAreas.size === 0) return [];
        const count = Math.min(SIZE_MULTIPLIER[teamSize], 2);
        const picks: typeof marketplaceBots = [];
        for (const fa of focusAreas) {
            const area = FOCUS_AREAS.find((a) => a.value === fa);
            if (!area) continue;
            const deptBots = marketplaceBots
                .filter((b) => b.department === area.dept && b.available)
                .slice(0, count);
            picks.push(...deptBots);
        }
        return picks.slice(0, 6);
    })();

    const addAll = () => {
        recommendations.forEach((bot) => {
            if (!hasBot(bot.slug)) {
                addBot({ slug: bot.slug, name: bot.name, price: bot.price, priceMonthly: bot.priceMonthly, color: bot.color });
            }
        });
    };

    return (
        <section className="py-16 bg-gradient-to-b from-slate-50 to-white dark:from-slate-900 dark:to-slate-950 border-y border-slate-100 dark:border-slate-800">
            <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
                {/* Header */}
                <div className="text-center mb-10">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-violet-600 bg-violet-50 dark:bg-violet-900/30 px-3 py-1.5 rounded-full border border-violet-100 dark:border-violet-800 mb-4">
                        <Sparkles className="w-3.5 h-3.5" /> Not sure where to start?
                    </span>
                    <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-slate-100 mt-2">
                        Build your AI team in 3 steps
                    </h2>
                    <p className="mt-3 text-slate-500 dark:text-slate-400 text-sm">
                        Tell us a little about your team and we will recommend the right agents.
                    </p>
                </div>

                {/* Progress */}
                <div className="flex items-center justify-center gap-2 mb-8">
                    {([1, 2, 3] as const).map((s) => (
                        <div key={s} className="flex items-center gap-2">
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${step >= s
                                    ? "bg-blue-600 text-white"
                                    : "bg-slate-200 dark:bg-slate-700 text-slate-400"
                                }`}>
                                {s}
                            </div>
                            {s < 3 && <div className={`w-8 h-0.5 transition-colors ${step > s ? "bg-blue-600" : "bg-slate-200 dark:bg-slate-700"}`} />}
                        </div>
                    ))}
                </div>

                {/* Steps */}
                <AnimatePresence mode="wait">
                    {step === 1 && (
                        <motion.div
                            key="step1"
                            initial={{ opacity: 0, x: 30 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -30 }}
                            transition={{ duration: 0.25 }}
                        >
                            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-4">
                                How large is your team?
                            </p>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                {(["1-5", "6-20", "21-50", "50+"] as TeamSize[]).map((size) => (
                                    <button
                                        key={size}
                                        onClick={() => { setTeamSize(size); setStep(2); }}
                                        className={`rounded-xl border px-4 py-5 text-center transition-all cursor-pointer ${teamSize === size
                                                ? "border-blue-600 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 ring-2 ring-blue-600"
                                                : "border-slate-200 dark:border-slate-700 hover:border-blue-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                                            }`}
                                    >
                                        <p className="text-xl font-extrabold text-slate-900 dark:text-slate-100">{size}</p>
                                        <p className="text-xs text-slate-400 mt-1">people</p>
                                    </button>
                                ))}
                            </div>
                        </motion.div>
                    )}

                    {step === 2 && (
                        <motion.div
                            key="step2"
                            initial={{ opacity: 0, x: 30 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -30 }}
                            transition={{ duration: 0.25 }}
                        >
                            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-4">
                                Which areas need the most help? <span className="font-normal text-slate-400">(pick any)</span>
                            </p>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                                {FOCUS_AREAS.map(({ value, label, icon: Icon }) => {
                                    const active = focusAreas.has(value);
                                    return (
                                        <button
                                            key={value}
                                            onClick={() => toggleFocus(value)}
                                            className={`flex flex-col items-center gap-2 rounded-xl border px-3 py-4 text-center transition-all cursor-pointer ${active
                                                    ? "border-blue-600 bg-blue-50 dark:bg-blue-950/40 ring-2 ring-blue-600"
                                                    : "border-slate-200 dark:border-slate-700 hover:border-blue-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                                                }`}
                                        >
                                            <Icon className={`w-5 h-5 ${active ? "text-blue-600" : "text-slate-400"}`} />
                                            <span className={`text-xs font-medium ${active ? "text-blue-700 dark:text-blue-300" : "text-slate-600 dark:text-slate-400"}`}>
                                                {label}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                            <div className="flex items-center justify-between">
                                <button onClick={() => setStep(1)} className="text-sm text-slate-400 hover:text-slate-600 cursor-pointer">
                                    Back
                                </button>
                                <button
                                    onClick={() => setStep(3)}
                                    disabled={focusAreas.size === 0}
                                    className="flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed px-5 py-2.5 text-sm font-semibold text-white transition-colors cursor-pointer"
                                >
                                    See recommendations <ArrowRight className="w-4 h-4" />
                                </button>
                            </div>
                        </motion.div>
                    )}

                    {step === 3 && (
                        <motion.div
                            key="step3"
                            initial={{ opacity: 0, x: 30 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -30 }}
                            transition={{ duration: 0.25 }}
                        >
                            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-4">
                                Your recommended starter team
                            </p>
                            {recommendations.length === 0 ? (
                                <div className="text-center py-10">
                                    <p className="text-slate-500 text-sm mb-4">No agents are live yet for those areas — they are coming soon.</p>
                                    <Link href="/marketplace" className="text-blue-600 text-sm hover:underline">
                                        Browse the full marketplace
                                    </Link>
                                </div>
                            ) : (
                                <>
                                    <div className="grid sm:grid-cols-2 gap-3 mb-6">
                                        {recommendations.map((bot) => (
                                            <div
                                                key={bot.slug}
                                                className="flex items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3"
                                            >
                                                <img
                                                    src={`https://api.dicebear.com/7.x/bottts/svg?seed=${bot.slug}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc&radius=12`}
                                                    alt={bot.name}
                                                    className="w-10 h-10 rounded-xl bg-slate-100 shrink-0"
                                                    loading="lazy"
                                                />
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{bot.name}</p>
                                                    <p className="text-xs text-slate-400">{bot.price}</p>
                                                </div>
                                                <Link
                                                    href={`/marketplace/${bot.slug}`}
                                                    className="shrink-0 text-slate-400 hover:text-blue-600 transition-colors"
                                                >
                                                    <ChevronRight className="w-4 h-4" />
                                                </Link>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="flex flex-col sm:flex-row items-center gap-3">
                                        <button
                                            onClick={addAll}
                                            className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white transition-colors cursor-pointer"
                                        >
                                            Add all to my team
                                        </button>
                                        <Link
                                            href="/marketplace"
                                            className="text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-200"
                                        >
                                            Explore all {marketplaceBots.length} agents
                                        </Link>
                                    </div>
                                </>
                            )}
                            <button onClick={() => { setStep(1); setTeamSize(null); setFocusAreas(new Set()); }} className="mt-4 text-xs text-slate-400 hover:text-slate-600 cursor-pointer">
                                Start over
                            </button>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </section>
    );
}
