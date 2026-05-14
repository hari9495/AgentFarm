"use client";

import { motion } from "motion/react";
import Link from "next/link";
import {
    Code2, Layout, TestTube2, Server, Database, GitBranch,
    ShieldCheck, LineChart, BrainCircuit, MessageSquareCode,
    Smartphone, Layers, Package, Cloud, Activity, Gauge,
    FileCheck, BarChart3, FlaskConical, PieChart, Target,
    FileSpreadsheet, Users, LifeBuoy, Terminal, PenLine,
    Search, Mail, UserCheck, DollarSign, MessageCircle, Kanban,
    ClipboardList, TrendingUp, Megaphone, Calendar,
    Star, Zap, CheckCircle2, ArrowLeft, Building2,
    type LucideIcon,
} from "lucide-react";
import { colorMap, type Bot } from "@/lib/bots";
import { getBotAvatarUrl } from "@/lib/bot-avatar";
import { useCart } from "@/lib/cart-store";
import AddToCartButton from "@/components/shared/AddToCartButton";
import MarketplaceDeployButton from "@/components/marketplace/MarketplaceDeployButton";

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
    "ai-mobile-developer": Smartphone,
    "ai-full-stack-developer": Layers,
    "ai-platform-engineer": Package,
    "ai-cloud-architect": Cloud,
    "ai-site-reliability-engineer": Activity,
    "ai-performance-engineer": Gauge,
    "ai-compliance-engineer": FileCheck,
    "ai-data-analyst": BarChart3,
    "ai-data-scientist": FlaskConical,
    "ai-bi-engineer": PieChart,
    "ai-product-manager": Target,
    "ai-business-analyst": FileSpreadsheet,
    "ai-ux-researcher": Users,
    "ai-it-support-engineer": LifeBuoy,
    "ai-system-administrator": Terminal,
    "ai-content-writer": PenLine,
    "ai-seo-specialist": Search,
    "ai-email-marketer": Mail,
    "ai-technical-recruiter": UserCheck,
    "ai-hr-analyst": ClipboardList,
    "ai-finance-analyst": DollarSign,
    "ai-customer-support-agent": MessageCircle,
    "ai-customer-success-manager": Users,
    "ai-project-manager": Kanban,
    "ai-sales-rep": TrendingUp,
    "ai-marketing-specialist": Megaphone,
    "ai-corporate-assistant": Calendar,
};

// Static social proof seeded per slug
const PROOF: Record<string, { teams: number; rating: number; hoursPerMonth: number }> = {
    "ai-backend-developer": { teams: 214, rating: 4.9, hoursPerMonth: 60 },
    "ai-frontend-developer": { teams: 198, rating: 4.8, hoursPerMonth: 55 },
    "ai-qa-engineer": { teams: 176, rating: 4.9, hoursPerMonth: 48 },
    "ai-devops-engineer": { teams: 143, rating: 4.8, hoursPerMonth: 52 },
    "ai-database-administrator": { teams: 112, rating: 4.7, hoursPerMonth: 40 },
    "ai-security-engineer": { teams: 98, rating: 4.9, hoursPerMonth: 45 },
    "ai-data-engineer": { teams: 130, rating: 4.8, hoursPerMonth: 50 },
    "ai-ml-engineer": { teams: 89, rating: 4.7, hoursPerMonth: 44 },
    "ai-technical-writer": { teams: 156, rating: 4.8, hoursPerMonth: 38 },
    "ai-code-reviewer": { teams: 201, rating: 4.9, hoursPerMonth: 42 },
    "ai-mobile-developer": { teams: 87, rating: 4.7, hoursPerMonth: 50 },
    "ai-full-stack-developer": { teams: 245, rating: 4.9, hoursPerMonth: 65 },
    "ai-platform-engineer": { teams: 74, rating: 4.7, hoursPerMonth: 48 },
    "ai-cloud-architect": { teams: 91, rating: 4.8, hoursPerMonth: 46 },
    "ai-site-reliability-engineer": { teams: 103, rating: 4.8, hoursPerMonth: 44 },
    "ai-performance-engineer": { teams: 67, rating: 4.7, hoursPerMonth: 36 },
    "ai-compliance-engineer": { teams: 58, rating: 4.8, hoursPerMonth: 40 },
    "ai-data-analyst": { teams: 122, rating: 4.8, hoursPerMonth: 42 },
    "ai-data-scientist": { teams: 95, rating: 4.7, hoursPerMonth: 44 },
    "ai-bi-engineer": { teams: 83, rating: 4.7, hoursPerMonth: 38 },
    "ai-product-manager": { teams: 167, rating: 4.8, hoursPerMonth: 46 },
    "ai-business-analyst": { teams: 119, rating: 4.7, hoursPerMonth: 40 },
    "ai-ux-researcher": { teams: 72, rating: 4.7, hoursPerMonth: 35 },
    "ai-it-support-engineer": { teams: 134, rating: 4.8, hoursPerMonth: 50 },
    "ai-system-administrator": { teams: 89, rating: 4.7, hoursPerMonth: 48 },
    "ai-content-writer": { teams: 188, rating: 4.9, hoursPerMonth: 52 },
    "ai-seo-specialist": { teams: 143, rating: 4.8, hoursPerMonth: 45 },
    "ai-email-marketer": { teams: 126, rating: 4.8, hoursPerMonth: 40 },
    "ai-technical-recruiter": { teams: 97, rating: 4.7, hoursPerMonth: 38 },
    "ai-hr-analyst": { teams: 82, rating: 4.7, hoursPerMonth: 36 },
    "ai-finance-analyst": { teams: 91, rating: 4.8, hoursPerMonth: 44 },
    "ai-customer-support-agent": { teams: 219, rating: 4.9, hoursPerMonth: 60 },
    "ai-customer-success-manager": { teams: 145, rating: 4.8, hoursPerMonth: 50 },
    "ai-project-manager": { teams: 178, rating: 4.8, hoursPerMonth: 46 },
    "ai-sales-rep": { teams: 162, rating: 4.8, hoursPerMonth: 52 },
    "ai-marketing-specialist": { teams: 137, rating: 4.8, hoursPerMonth: 48 },
    "ai-corporate-assistant": { teams: 201, rating: 4.9, hoursPerMonth: 55 },
};

const FALLBACK_PROOF = { teams: 40, rating: 4.7, hoursPerMonth: 36 };

const DEPT_IMAGE: Record<string, string> = {
    "Engineering": "https://images.unsplash.com/photo-1518773553398-650c184e0bb3?auto=format&fit=crop&w=1600&q=80",
    "Quality & Testing": "https://images.unsplash.com/photo-1516116216624-53e697fedbea?auto=format&fit=crop&w=1600&q=80",
    "Sales": "https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&w=1600&q=80",
    "Marketing": "https://images.unsplash.com/photo-1533750516457-a7f992034fec?auto=format&fit=crop&w=1600&q=80",
    "Customer Success": "https://images.unsplash.com/photo-1556740749-887f6717d7e4?auto=format&fit=crop&w=1600&q=80",
    "Business Operations": "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=1600&q=80",
};

export default function BotDetailClient({ bot }: { bot: Bot }) {
    const { hasBot } = useCart();
    const inCart = hasBot(bot.slug);
    const c = colorMap[bot.color] ?? colorMap["blue"];
    const Icon = ICON_MAP[bot.slug] ?? Building2;
    const proof = PROOF[bot.slug] ?? FALLBACK_PROOF;
    const avatarUrl = getBotAvatarUrl(bot.slug);
    const estimatedSavings = proof.hoursPerMonth * 75;
    const heroImage = DEPT_IMAGE[bot.department] ?? "https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=1600&q=80";
    const firstWeekMilestones: Array<{ day: string; title: string; detail: string; icon: LucideIcon }> = [
        { day: "Day 1", title: "Connected and configured", detail: `Connected to your ${bot.integrations[0] ?? "workflow"} stack with role-specific settings.`, icon: Calendar },
        { day: "Day 2", title: "First execution run", detail: `Completed an initial ${bot.useCases[0] ?? "task"} run with review-ready output.`, icon: Zap },
        { day: "Day 3-4", title: "Feedback loop", detail: "Incorporates team comments and adapts behavior to your standards.", icon: GitBranch },
        { day: "Day 5-7", title: "Production rhythm", detail: "Consistent task throughput with measurable hours saved.", icon: CheckCircle2 },
    ];

    return (
        <div className="min-h-screen bg-white dark:bg-slate-950">
            {/* Back nav */}
            <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-4">
                <Link
                    href="/marketplace"
                    className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
                >
                    <ArrowLeft className="w-4 h-4" /> Back to marketplace
                </Link>
            </div>

            <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pb-20 grid lg:grid-cols-3 gap-8">
                {/* Left: main detail */}
                <div className="lg:col-span-2 space-y-8">
                    <motion.section
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.35 }}
                        className="rounded-3xl overflow-hidden border border-slate-200 dark:border-slate-700"
                    >
                        <div className="relative h-56">
                            <img src={heroImage} alt={`${bot.department} team context`} className="w-full h-full object-cover" loading="lazy" />
                            <div className="absolute inset-0 bg-gradient-to-t from-slate-900/70 via-slate-900/25 to-transparent" />
                            <div className="absolute bottom-4 left-4 right-4 text-white">
                                <p className="text-xs uppercase tracking-wide text-sky-200">Role context</p>
                                <p className="text-sm sm:text-base font-semibold">Built for teams running {bot.department.toLowerCase()} workflows at speed with accountability.</p>
                            </div>
                        </div>
                    </motion.section>

                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4 }}
                        className="flex items-start gap-5"
                    >
                        <img
                            src={avatarUrl}
                            alt={bot.name}
                            className={`w-20 h-20 rounded-2xl ${c.bg} shrink-0 object-cover`}
                        />
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2 mb-1">
                                <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${c.badge}`}>
                                    {bot.department}
                                </span>
                                <span className="text-xs px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                                    {bot.plan}
                                </span>
                                {bot.available ? (
                                    <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 font-medium">
                                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                                        Live now
                                    </span>
                                ) : (
                                    <span className="text-xs text-slate-400">Coming soon</span>
                                )}
                            </div>
                            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-slate-100 leading-tight">
                                {bot.name}
                            </h1>
                            <p className={`mt-1 text-sm font-medium ${c.icon}`}>{bot.tagline}</p>

                            {/* Star rating + teams */}
                            <div className="mt-2 flex items-center gap-3 flex-wrap">
                                <span className="flex items-center gap-1 text-sm font-semibold text-amber-500">
                                    <Star className="w-4 h-4 fill-amber-400 stroke-amber-400" />
                                    {proof.rating.toFixed(1)}
                                </span>
                                <span className="text-xs text-slate-400">{proof.teams}+ teams using this agent</span>
                                <span className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 font-medium">
                                    <Zap className="w-3.5 h-3.5" /> Fast deploy
                                </span>
                            </div>
                        </div>
                    </motion.div>

                    {/* Description */}
                    <motion.section
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.1 }}
                    >
                        <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-3">About this agent</h2>
                        <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                            {bot.longDescription || bot.description}
                        </p>
                    </motion.section>

                    <motion.section
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.11 }}
                        className="grid sm:grid-cols-2 gap-4"
                    >
                        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-4 bg-white dark:bg-slate-900">
                            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-2">Best for</h3>
                            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                                Teams that need consistent execution for {bot.useCases[0] ?? "recurring tasks"} without adding headcount.
                            </p>
                        </div>
                        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-4 bg-white dark:bg-slate-900">
                            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-2">What changes after rollout</h3>
                            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                                Repetitive work shifts to this role, while your core team focuses on high-value planning and decisions.
                            </p>
                        </div>
                    </motion.section>

                    <motion.section
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.12 }}
                        className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/70 p-5"
                    >
                        <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-4">Typical first week with this agent</h2>
                        <div className="space-y-3">
                            {firstWeekMilestones.map((m, idx) => {
                                const MIcon = m.icon;
                                return (
                                    <motion.div
                                        key={m.day}
                                        initial={{ opacity: 0, x: -8 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ duration: 0.3, delay: 0.14 + idx * 0.05 }}
                                        className="flex gap-3"
                                    >
                                        <div className="mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shrink-0">
                                            <MIcon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                                        </div>
                                        <div>
                                            <p className="text-xs font-semibold text-blue-600 dark:text-blue-400">{m.day}</p>
                                            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{m.title}</p>
                                            <p className="text-xs text-slate-500 dark:text-slate-400">{m.detail}</p>
                                        </div>
                                    </motion.div>
                                );
                            })}
                        </div>
                    </motion.section>

                    {/* What it does */}
                    {bot.useCases.length > 0 && (
                        <motion.section
                            initial={{ opacity: 0, y: 16 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.4, delay: 0.15 }}
                        >
                            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-3">What it handles</h2>
                            <ul className="space-y-2">
                                {bot.useCases.map((uc) => (
                                    <li key={uc} className="flex items-start gap-2.5 text-sm text-slate-700 dark:text-slate-300">
                                        <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                                        {uc}
                                    </li>
                                ))}
                            </ul>
                        </motion.section>
                    )}

                    {/* Skills */}
                    {bot.skills.length > 0 && (
                        <motion.section
                            initial={{ opacity: 0, y: 16 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.4, delay: 0.2 }}
                        >
                            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-3">Skills</h2>
                            <div className="flex flex-wrap gap-2">
                                {bot.skills.map((s) => (
                                    <span
                                        key={s}
                                        className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-3 py-1.5 rounded-lg font-medium"
                                    >
                                        {s}
                                    </span>
                                ))}
                            </div>
                        </motion.section>
                    )}

                    {/* Integrations */}
                    {bot.integrations.length > 0 && (
                        <motion.section
                            initial={{ opacity: 0, y: 16 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.4, delay: 0.25 }}
                        >
                            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-3">Integrations</h2>
                            <div className="flex flex-wrap gap-2">
                                {bot.integrations.map((intg) => (
                                    <span
                                        key={intg}
                                        className="text-xs border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 px-3 py-1.5 rounded-lg"
                                    >
                                        {intg}
                                    </span>
                                ))}
                            </div>
                        </motion.section>
                    )}
                </div>

                {/* Right: sticky CTA panel */}
                <aside className="lg:col-span-1">
                    <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.4, delay: 0.1 }}
                        className="sticky top-24 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-5"
                    >
                        {/* Price */}
                        <div>
                            <p className="text-3xl font-extrabold text-slate-900 dark:text-slate-100">{bot.price}</p>
                            <p className="text-xs text-slate-400 mt-0.5">per month · {bot.plan} plan</p>
                        </div>

                        {/* ROI snippet */}
                        <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 px-4 py-3">
                            <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                                ~{proof.hoursPerMonth} hrs/mo automated
                            </p>
                            <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">
                                Saves ~${estimatedSavings.toLocaleString()}/mo in team time
                            </p>
                        </div>

                        {/* CTA */}
                        <div className="space-y-2">
                            {bot.available ? (
                                <AddToCartButton bot={bot} />
                            ) : (
                                <Link
                                    href="/get-started"
                                    className="flex w-full items-center justify-center rounded-xl bg-slate-900 dark:bg-slate-100 px-4 py-3 text-sm font-semibold text-white dark:text-slate-900 hover:opacity-90 transition-opacity"
                                >
                                    Join waitlist
                                </Link>
                            )}
                            {inCart && (
                                <Link
                                    href="/checkout"
                                    className="flex w-full items-center justify-center rounded-xl border border-blue-500 text-blue-600 dark:text-blue-400 px-4 py-3 text-sm font-semibold hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors"
                                >
                                    Go to checkout
                                </Link>
                            )}
                            {bot.available && (
                                <MarketplaceDeployButton
                                    botSlug={bot.slug}
                                    botName={bot.name}
                                    plan={bot.plan}
                                    price={bot.price}
                                />
                            )}
                        </div>

                        {/* Trust signals */}
                        <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                            {[
                                "14-day free trial included",
                                "Guided onboarding setup",
                                "Cancel anytime, no lock-in",
                            ].map((line) => (
                                <p key={line} className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                                    <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                                    {line}
                                </p>
                            ))}
                        </div>
                    </motion.div>
                </aside>
            </div>
        </div>
    );
}
