"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import {
    Code2, Layout, TestTube2, Server, Database, GitBranch,
    ShieldCheck, LineChart, BrainCircuit, MessageSquareCode,
    Smartphone, Layers, Package, Cloud, Activity, Gauge,
    FileCheck, BarChart3, FlaskConical, PieChart, Target,
    FileSpreadsheet, Users, LifeBuoy, Terminal, PenLine,
    Search, Mail, UserCheck, DollarSign, MessageCircle, Kanban,
    ClipboardList, X, Sparkles, Briefcase, Shield, ShoppingCart,
    Scale, Heart, Building2, BookOpen, Zap, User, Mic, Star,
    ChevronRight, FileText, Palette, GraduationCap,
    TrendingUp, Megaphone, Calendar,
    type LucideIcon,
} from "lucide-react";
import { marketplaceBots, colorMap, DEPARTMENTS, type Bot, type BotDepartment } from "@/lib/bots";
import { getBotAvatarUrl } from "@/lib/bot-avatar";
import { useCart } from "@/lib/cart-store";
import AddToCartButton from "@/components/shared/AddToCartButton";
import { useFunnelTracking } from "@/lib/use-funnel-tracking";
import { useCompactMotion } from "@/lib/useCompactMotion";

// â”€â”€â”€ Slug â†’ Icon (original 34 hand-crafted bots) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€â”€ Department â†’ Icon â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const DEPT_ICONS: Record<BotDepartment, LucideIcon> = {
    "Engineering": Code2,
    "DevOps & Infrastructure": Server,
    "Quality & Testing": TestTube2,
    "Security": ShieldCheck,
    "Data & Analytics": BarChart3,
    "Product": Target,
    "Design": Palette,
    "Documentation": FileText,
    "IT & Support": LifeBuoy,
    "Marketing": Mail,
    "HR & Talent": UserCheck,
    "Finance": DollarSign,
    "Customer Success": MessageCircle,
    "Operations": Layers,
    "Creative": Sparkles,
    "Business Operations": Briefcase,
    "Compliance & Security": Shield,
    "E-Commerce": ShoppingCart,
    "Legal": Scale,
    "Healthcare": Heart,
    "Real Estate": Building2,
    "Supply Chain": Package,
    "Education": BookOpen,
    "Automation": Zap,
    "Productivity": Gauge,
    "Personal": User,
    "Voice & Communication": Mic,
    "Sales": TrendingUp,
};

// â”€â”€â”€ Department colour tokens â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
type DeptMeta = { navActive: string; accent: string; iconColor: string; badge: string };

const DEPT_META: Record<BotDepartment, DeptMeta> = {
    "Engineering": { navActive: "bg-blue-600 text-white", accent: "bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800", iconColor: "text-blue-600 dark:text-blue-400", badge: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" },
    "DevOps & Infrastructure": { navActive: "bg-orange-600 text-white", accent: "bg-orange-50 dark:bg-orange-950/40 border-orange-200 dark:border-orange-800", iconColor: "text-orange-600 dark:text-orange-400", badge: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300" },
    "Quality & Testing": { navActive: "bg-green-600 text-white", accent: "bg-green-50 dark:bg-green-950/40 border-green-200 dark:border-green-800", iconColor: "text-green-600 dark:text-green-400", badge: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" },
    "Security": { navActive: "bg-red-600 text-white", accent: "bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800", iconColor: "text-red-600 dark:text-red-400", badge: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300" },
    "Data & Analytics": { navActive: "bg-indigo-600 text-white", accent: "bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-800", iconColor: "text-indigo-600 dark:text-indigo-400", badge: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300" },
    "Product": { navActive: "bg-teal-600 text-white", accent: "bg-teal-50 dark:bg-teal-950/40 border-teal-200 dark:border-teal-800", iconColor: "text-teal-600 dark:text-teal-400", badge: "bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300" },
    "Design": { navActive: "bg-pink-600 text-white", accent: "bg-pink-50 dark:bg-pink-950/40 border-pink-200 dark:border-pink-800", iconColor: "text-pink-600 dark:text-pink-400", badge: "bg-pink-100 text-pink-700 dark:bg-pink-900 dark:text-pink-300" },
    "Documentation": { navActive: "bg-cyan-600 text-white", accent: "bg-cyan-50 dark:bg-cyan-950/40 border-cyan-200 dark:border-cyan-800", iconColor: "text-cyan-600 dark:text-cyan-400", badge: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-300" },
    "IT & Support": { navActive: "bg-slate-600 text-white", accent: "bg-slate-50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-700", iconColor: "text-slate-600 dark:text-slate-400", badge: "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300" },
    "Marketing": { navActive: "bg-purple-600 text-white", accent: "bg-purple-50 dark:bg-purple-950/40 border-purple-200 dark:border-purple-800", iconColor: "text-purple-600 dark:text-purple-400", badge: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300" },
    "HR & Talent": { navActive: "bg-sky-600 text-white", accent: "bg-sky-50 dark:bg-sky-950/40 border-sky-200 dark:border-sky-800", iconColor: "text-sky-600 dark:text-sky-400", badge: "bg-sky-100 text-sky-700 dark:bg-sky-900 dark:text-sky-300" },
    "Finance": { navActive: "bg-emerald-600 text-white", accent: "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800", iconColor: "text-emerald-600 dark:text-emerald-400", badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300" },
    "Customer Success": { navActive: "bg-orange-500 text-white", accent: "bg-orange-50 dark:bg-orange-950/40 border-orange-200 dark:border-orange-800", iconColor: "text-orange-500 dark:text-orange-400", badge: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300" },
    "Operations": { navActive: "bg-slate-700 text-white", accent: "bg-slate-100 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700", iconColor: "text-slate-600 dark:text-slate-400", badge: "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300" },
    "Creative": { navActive: "bg-violet-600 text-white", accent: "bg-violet-50 dark:bg-violet-950/40 border-violet-200 dark:border-violet-800", iconColor: "text-violet-600 dark:text-violet-400", badge: "bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-300" },
    "Business Operations": { navActive: "bg-amber-600 text-white", accent: "bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800", iconColor: "text-amber-600 dark:text-amber-400", badge: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300" },
    "Compliance & Security": { navActive: "bg-red-700 text-white", accent: "bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800", iconColor: "text-red-700 dark:text-red-400", badge: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300" },
    "E-Commerce": { navActive: "bg-sky-500 text-white", accent: "bg-sky-50 dark:bg-sky-950/40 border-sky-200 dark:border-sky-800", iconColor: "text-sky-500 dark:text-sky-400", badge: "bg-sky-100 text-sky-700 dark:bg-sky-900 dark:text-sky-300" },
    "Legal": { navActive: "bg-stone-600 text-white", accent: "bg-stone-50 dark:bg-stone-900/40 border-stone-200 dark:border-stone-700", iconColor: "text-stone-600 dark:text-stone-400", badge: "bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300" },
    "Healthcare": { navActive: "bg-rose-600 text-white", accent: "bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800", iconColor: "text-rose-600 dark:text-rose-400", badge: "bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-300" },
    "Real Estate": { navActive: "bg-green-700 text-white", accent: "bg-green-50 dark:bg-green-950/40 border-green-200 dark:border-green-800", iconColor: "text-green-700 dark:text-green-400", badge: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" },
    "Supply Chain": { navActive: "bg-amber-500 text-white", accent: "bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800", iconColor: "text-amber-600 dark:text-amber-400", badge: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300" },
    "Education": { navActive: "bg-indigo-500 text-white", accent: "bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-800", iconColor: "text-indigo-500 dark:text-indigo-400", badge: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300" },
    "Automation": { navActive: "bg-cyan-500 text-white", accent: "bg-cyan-50 dark:bg-cyan-950/40 border-cyan-200 dark:border-cyan-800", iconColor: "text-cyan-600 dark:text-cyan-400", badge: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-300" },
    "Productivity": { navActive: "bg-teal-500 text-white", accent: "bg-teal-50 dark:bg-teal-950/40 border-teal-200 dark:border-teal-800", iconColor: "text-teal-600 dark:text-teal-400", badge: "bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300" },
    "Personal": { navActive: "bg-pink-500 text-white", accent: "bg-pink-50 dark:bg-pink-950/40 border-pink-200 dark:border-pink-800", iconColor: "text-pink-600 dark:text-pink-400", badge: "bg-pink-100 text-pink-700 dark:bg-pink-900 dark:text-pink-300" },
    "Voice & Communication": { navActive: "bg-violet-500 text-white", accent: "bg-violet-50 dark:bg-violet-950/40 border-violet-200 dark:border-violet-800", iconColor: "text-violet-600 dark:text-violet-400", badge: "bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-300" }, "Sales": { navActive: "bg-yellow-600 text-white", accent: "bg-yellow-50 dark:bg-yellow-950/40 border-yellow-200 dark:border-yellow-800", iconColor: "text-yellow-600 dark:text-yellow-400", badge: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300" },
};

const PLAN_FILTERS: { value: Bot["plan"] | "all"; label: string }[] = [
    { value: "all", label: "All plans" },
    { value: "Starter+", label: "Starter+" },
    { value: "Pro+", label: "Pro+" },
    { value: "Enterprise", label: "Enterprise" },
];

// ── Static social proof per slug ──
const SOCIAL_PROOF: Record<string, { teams: number; rating: number }> = {
    "ai-backend-developer": { teams: 214, rating: 4.9 },
    "ai-frontend-developer": { teams: 198, rating: 4.8 },
    "ai-qa-engineer": { teams: 176, rating: 4.9 },
    "ai-devops-engineer": { teams: 143, rating: 4.8 },
    "ai-database-administrator": { teams: 112, rating: 4.7 },
    "ai-security-engineer": { teams: 98, rating: 4.9 },
    "ai-data-engineer": { teams: 130, rating: 4.8 },
    "ai-ml-engineer": { teams: 89, rating: 4.7 },
    "ai-technical-writer": { teams: 156, rating: 4.8 },
    "ai-code-reviewer": { teams: 201, rating: 4.9 },
    "ai-mobile-developer": { teams: 87, rating: 4.7 },
    "ai-full-stack-developer": { teams: 245, rating: 4.9 },
    "ai-platform-engineer": { teams: 74, rating: 4.7 },
    "ai-cloud-architect": { teams: 91, rating: 4.8 },
    "ai-site-reliability-engineer": { teams: 103, rating: 4.8 },
    "ai-performance-engineer": { teams: 67, rating: 4.7 },
    "ai-compliance-engineer": { teams: 58, rating: 4.8 },
    "ai-data-analyst": { teams: 122, rating: 4.8 },
    "ai-data-scientist": { teams: 95, rating: 4.7 },
    "ai-bi-engineer": { teams: 83, rating: 4.7 },
    "ai-product-manager": { teams: 167, rating: 4.8 },
    "ai-business-analyst": { teams: 119, rating: 4.7 },
    "ai-ux-researcher": { teams: 72, rating: 4.7 },
    "ai-it-support-engineer": { teams: 134, rating: 4.8 },
    "ai-system-administrator": { teams: 89, rating: 4.7 },
    "ai-content-writer": { teams: 188, rating: 4.9 },
    "ai-seo-specialist": { teams: 143, rating: 4.8 },
    "ai-email-marketer": { teams: 126, rating: 4.8 },
    "ai-technical-recruiter": { teams: 97, rating: 4.7 },
    "ai-hr-analyst": { teams: 82, rating: 4.7 },
    "ai-finance-analyst": { teams: 91, rating: 4.8 },
    "ai-customer-support-agent": { teams: 219, rating: 4.9 },
    "ai-customer-success-manager": { teams: 145, rating: 4.8 },
    "ai-project-manager": { teams: 178, rating: 4.8 },
    "ai-sales-rep": { teams: 162, rating: 4.8 },
    "ai-marketing-specialist": { teams: 137, rating: 4.8 },
    "ai-corporate-assistant": { teams: 201, rating: 4.9 },
};

type SortOption = "recommended" | "price-low" | "price-high" | "name";

const SORT_OPTIONS: Array<{ value: SortOption; label: string }> = [
    { value: "recommended", label: "Recommended" },
    { value: "price-low", label: "Price: low to high" },
    { value: "price-high", label: "Price: high to low" },
    { value: "name", label: "Name: A to Z" },
];

// â”€â”€â”€ BotCard â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function BotCard({ bot, index }: { bot: Bot; index: number }) {
    const compactMotion = useCompactMotion();
    const [peekOpen, setPeekOpen] = useState(false);
    const { hasBot } = useCart();
    const { track } = useFunnelTracking();
    const inCart = hasBot(bot.slug);
    const c = colorMap[bot.color] ?? colorMap["blue"];
    const Icon = ICON_MAP[bot.slug] ?? DEPT_ICONS[bot.department] ?? Code2;
    const avatarUrl = getBotAvatarUrl(bot.slug);
    const meta = DEPT_META[bot.department];
    const proof = bot.available ? (SOCIAL_PROOF[bot.slug] ?? null) : null;
    const hoverLift = compactMotion ? -3 : -6;
    const hoverScale = compactMotion ? 1.005 : 1.01;
    const setupTime = bot.available ? "5-10 min setup" : "Going live soon";
    const topIntegration = bot.integrations[0] ?? "GitHub";
    const nextOutcome = bot.useCases[1] ?? bot.useCases[0] ?? "Reliable task delivery";

    function togglePeek() {
        const nextOpen = !peekOpen;
        setPeekOpen(nextOpen);
        track({ type: "bot_peek_toggle", slug: bot.slug, name: bot.name, open: nextOpen });
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: Math.min(index * 0.04, 0.6) }}
            whileHover={{ y: hoverLift, scale: hoverScale }}
            onHoverStart={() => {
                if (!compactMotion) setPeekOpen(true);
            }}
            onHoverEnd={() => {
                if (!compactMotion) setPeekOpen(false);
            }}
            className={`relative border rounded-2xl p-5 flex flex-col transition-all bg-white dark:bg-slate-900 group ${bot.available
                ? inCart
                    ? "border-blue-400 dark:border-blue-600 shadow-md ring-1 ring-blue-400 dark:ring-blue-600"
                    : "border-slate-200 dark:border-slate-700 hover:shadow-xl hover:-translate-y-1 hover:border-blue-200 dark:hover:border-blue-800"
                : "border-slate-100 dark:border-slate-800 opacity-60"
                }`}
        >
            <div className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-br from-sky-50/70 via-transparent to-emerald-50/50 dark:from-sky-900/10 dark:to-emerald-900/10" />
            {/* Avatar + dept badge */}
            <div className="flex items-start justify-between mb-3">
                <div className="relative">
                    <img
                        src={avatarUrl}
                        alt={bot.name}
                        className={`w-14 h-14 rounded-2xl ${c.bg} object-cover`}
                        loading="lazy"
                    />
                    {bot.available && (
                        <span className="absolute -bottom-1 -right-1 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-white dark:border-slate-900" />
                    )}
                </div>
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${meta.badge}`}>
                    {bot.department}
                </span>
            </div>

            {/* Name + status */}
            <div className="flex items-start justify-between gap-2 mb-1">
                <Link
                    href={`/marketplace/${bot.slug}`}
                    className="font-semibold text-slate-900 dark:text-slate-100 text-sm leading-snug hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                >
                    {bot.name}
                </Link>
                {!bot.available && (
                    <span className="text-xs bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400 px-2 py-0.5 rounded-full shrink-0">
                        Soon
                    </span>
                )}
                {bot.available && inCart && (
                    <span className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full shrink-0 font-medium">
                        Added
                    </span>
                )}
            </div>

            <p className={`text-xs font-medium mb-3 ${c.icon}`}>{bot.tagline}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed flex-1">
                {bot.description}
            </p>

            {bot.useCases[0] && (
                <p className="mt-3 text-[11px] text-slate-400 dark:text-slate-500 font-medium">
                    First win: {bot.useCases[0]}
                </p>
            )}

            <button
                type="button"
                onClick={togglePeek}
                className="mt-2 inline-flex w-fit items-center gap-1 text-xs font-semibold text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 transition-colors"
            >
                <Sparkles className="w-3 h-3" />
                {peekOpen ? "Hide quick peek" : "Quick peek"}
            </button>

            <AnimatePresence initial={false}>
                {peekOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 6 }}
                        transition={{ duration: 0.2 }}
                        className="mt-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/90 dark:bg-slate-800/80 p-3 space-y-2"
                    >
                        <p className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">What to expect in week one</p>
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                            <Calendar className="w-3.5 h-3.5 text-blue-500" />
                            {setupTime}
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                            <Zap className="w-3.5 h-3.5 text-emerald-500" />
                            Integrates with {topIntegration}
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">Likely next win: {nextOutcome}</p>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Social proof chips */}
            {proof && (
                <div className="mt-3 flex items-center gap-2 flex-wrap">
                    <span className="flex items-center gap-1 text-xs text-amber-500 font-medium">
                        <Star className="w-3 h-3 fill-amber-400 stroke-amber-400" />
                        {proof.rating.toFixed(1)}
                    </span>
                    <span className="text-xs text-slate-400">{proof.teams}+ teams</span>
                    <span className="flex items-center gap-0.5 text-xs text-blue-600 dark:text-blue-400 font-medium">
                        <Zap className="w-3 h-3" /> Fast deploy
                    </span>
                </div>
            )}

            {bot.available && !inCart && (
                <Link
                    href="/checkout"
                    onClick={() => track({ type: "bot_quick_start_click", slug: bot.slug, name: bot.name })}
                    className="mt-2 inline-flex items-center text-xs font-semibold text-blue-600 hover:text-blue-700 dark:hover:text-blue-400"
                >
                    Quick start this agent
                </Link>
            )}

            {/* Skills */}
            <div className="mt-4 flex flex-wrap gap-1.5">
                {bot.skills.slice(0, 4).map((s) => (
                    <span key={s} className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-2 py-0.5 rounded-md">
                        {s}
                    </span>
                ))}
            </div>

            {/* Price + CTA */}
            <div className="mt-5 flex items-center justify-between gap-3">
                <div>
                    <p className="text-base font-bold text-slate-900 dark:text-slate-100">{bot.price}</p>
                    <p className="text-xs text-slate-400">{bot.plan}</p>
                </div>
                <div className="shrink-0">
                    <AddToCartButton bot={bot} />
                </div>
            </div>
        </motion.div>
    );
}

// â”€â”€â”€ DeptSection (used in "All domains" view) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function DeptSection({
    dept,
    deptBots,
    onViewAll,
}: {
    dept: BotDepartment;
    deptBots: Bot[];
    onViewAll: (d: BotDepartment) => void;
}) {
    if (deptBots.length === 0) return null;

    const meta = DEPT_META[dept];
    const DeptIcon = DEPT_ICONS[dept];
    const preview = deptBots.slice(0, 4);

    return (
        <motion.section
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className={`rounded-2xl border ${meta.accent} p-6 mb-8`}
        >
            {/* Section header */}
            <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-white/70 dark:bg-slate-900/70 border border-white/50 dark:border-slate-700">
                        <DeptIcon className={`w-5 h-5 ${meta.iconColor}`} />
                    </div>
                    <div>
                        <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">{dept}</h2>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{deptBots.length} AI agent{deptBots.length !== 1 ? "s" : ""}</p>
                    </div>
                </div>
                <button
                    onClick={() => onViewAll(dept)}
                    className={`flex items-center gap-1.5 text-sm font-semibold ${meta.iconColor} hover:opacity-75 transition-opacity cursor-pointer`}
                >
                    See all {deptBots.length} <ChevronRight className="w-4 h-4" />
                </button>
            </div>

            {/* Preview grid (max 4) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {preview.map((bot, i) => (
                    <BotCard key={bot.slug} bot={bot} index={i} />
                ))}
            </div>

            {deptBots.length > 4 && (
                <div className="mt-4 text-center">
                    <button
                        onClick={() => onViewAll(dept)}
                        className={`text-xs font-medium ${meta.iconColor} hover:opacity-75 transition-opacity cursor-pointer`}
                    >
                        + {deptBots.length - 4} more agents {"->"}
                    </button>
                </div>
            )}
        </motion.section>
    );
}

// â”€â”€â”€ MarketplaceGrid (main export) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export default function MarketplaceGrid() {
    const [dept, setDept] = useState<BotDepartment | "all">("all");
    const [plan, setPlan] = useState<Bot["plan"] | "all">("all");
    const [onlyAvailable, setOnlyAvailable] = useState(true);
    const [sortBy, setSortBy] = useState<SortOption>("recommended");
    const [search, setSearch] = useState("");
    const { items, count, total, openSidebar } = useCart();
    const { track } = useFunnelTracking();
    const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Departments that actually have bots
    const activeDepts = useMemo(
        () => DEPARTMENTS.filter((d) => marketplaceBots.some((b) => b.department === d)),
        []
    );

    const isFiltering =
        dept !== "all" ||
        plan !== "all" ||
        !onlyAvailable ||
        sortBy !== "recommended" ||
        search !== "";

    // Bots matching plan/availability/search (dept-agnostic) â€” used for "All" view sections
    const filteredAll = useMemo(() => {
        const filtered = marketplaceBots.filter((b) => {
            if (plan !== "all" && b.plan !== plan) return false;
            if (onlyAvailable && !b.available) return false;
            if (search) {
                const q = search.toLowerCase();
                if (
                    !b.name.toLowerCase().includes(q) &&
                    !b.tagline.toLowerCase().includes(q) &&
                    !b.department.toLowerCase().includes(q) &&
                    !b.skills.some((s) => s.toLowerCase().includes(q))
                ) return false;
            }
            return true;
        });

        return filtered.sort((left, right) => {
            if (sortBy === "name") {
                return left.name.localeCompare(right.name);
            }

            if (sortBy === "price-low") {
                return left.priceMonthly - right.priceMonthly;
            }

            if (sortBy === "price-high") {
                return right.priceMonthly - left.priceMonthly;
            }

            if (left.available !== right.available) {
                return left.available ? -1 : 1;
            }

            return left.priceMonthly - right.priceMonthly;
        });
    }, [plan, onlyAvailable, search, sortBy]);

    // Bots for a single selected dept view
    const filteredDept = useMemo(() => {
        if (dept === "all") return [];
        return filteredAll.filter((b) => b.department === dept);
    }, [dept, filteredAll]);

    function clearFilters() {
        setDept("all");
        setPlan("all");
        setOnlyAvailable(true);
        setSortBy("recommended");
        setSearch("");
    }

    // Track filter changes
    useEffect(() => {
        track({ type: "filter_change", dept, plan, sort: sortBy, available: onlyAvailable });
    }, [dept, plan, sortBy, onlyAvailable]); // eslint-disable-line react-hooks/exhaustive-deps

    // Track search queries (debounced 600ms, only when query is non-empty)
    useEffect(() => {
        if (!search) return;
        if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
        searchDebounceRef.current = setTimeout(() => {
            const resultCount = dept === "all" ? filteredAll.length : filteredDept.length;
            track({ type: "search_query", query: search, results: resultCount });
        }, 600);
        return () => {
            if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
        };
    }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

    const currentDeptMeta = dept !== "all" ? DEPT_META[dept] : null;
    const CurrentDeptIcon = dept !== "all" ? DEPT_ICONS[dept] : null;

    return (
        <div className="bg-white dark:bg-slate-950">

            {/* â”€â”€ Hero â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
            <section className="relative py-24 border-b border-slate-100 dark:border-slate-800 overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-blue-50 via-slate-50 to-purple-50 dark:from-slate-950 dark:via-slate-900 dark:to-blue-950 pointer-events-none" />
                <div className="absolute top-0 right-0 w-[600px] h-[400px] bg-gradient-radial from-blue-100/40 to-transparent dark:from-blue-900/20 blur-3xl pointer-events-none" />

                <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-blue-600 bg-blue-50 dark:bg-blue-900/40 px-3 py-1.5 rounded-full border border-blue-100 dark:border-blue-800 mb-4">
                            <Sparkles className="w-3.5 h-3.5" />
                            Robot Marketplace
                        </span>
                        <h1 className="mt-3 text-4xl sm:text-6xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
                            Hire your{" "}
                            <span className="bg-gradient-to-r from-blue-600 via-violet-600 to-blue-600 bg-clip-text text-transparent">
                                AI workforce
                            </span>
                        </h1>
                        <p className="mt-5 text-xl text-slate-500 dark:text-slate-400 max-w-2xl leading-relaxed">
                            {marketplaceBots.length} new AI agents across {activeDepts.length} domains, ready to deploy in minutes.
                        </p>
                    </motion.div>

                    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.2 }} className="mt-8 flex flex-wrap items-center gap-6">
                        <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                            <span className="text-sm text-slate-500 dark:text-slate-400 font-medium">
                                {marketplaceBots.filter((b) => b.available).length} live now, {marketplaceBots.length - marketplaceBots.filter((b) => b.available).length} coming soon
                            </span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-slate-400 dark:text-slate-500">
                            <span className="font-bold text-slate-700 dark:text-slate-300">14 days</span> free trial
                        </div>
                        <div className="flex items-center gap-2 text-sm text-slate-400 dark:text-slate-500">
                            <span className="font-bold text-slate-700 dark:text-slate-300">30s</span> deploy time
                        </div>
                        {count > 0 && (
                            <button
                                onClick={() => { track({ type: "view_team_click", count }); openSidebar(); }}
                                className="flex items-center gap-2 text-sm font-semibold text-blue-600 hover:text-blue-700 dark:hover:text-blue-400 transition-colors cursor-pointer ml-auto"
                            >
                                View team ({count} bot{count !== 1 ? "s" : ""}) {"->"}
                            </button>
                        )}
                    </motion.div>

                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, delay: 0.4 }} className="mt-6 flex items-center gap-2">
                        <div className="flex -space-x-2">
                            {marketplaceBots.filter((b) => b.available).slice(0, 8).map((b) => (
                                <img key={b.slug} src={getBotAvatarUrl(b.slug, 64)} alt={b.name} className="w-8 h-8 rounded-full border-2 border-white dark:border-slate-900 bg-blue-50 object-cover" loading="lazy" />
                            ))}
                        </div>
                        <span className="text-xs text-slate-400 dark:text-slate-500 ml-1">+{Math.max(0, marketplaceBots.filter((b) => b.available).length - 8)} more available</span>
                    </motion.div>
                </div>
            </section>

            {/* â”€â”€ Browse section â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
            <section className="py-10">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

                    {/* Search bar */}
                    <div className="relative mb-6">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                        <input
                            type="search"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search agents by role, skill or domain..."
                            className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                        />
                        {search && (
                            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer">
                                <X className="w-4 h-4" />
                            </button>
                        )}
                    </div>

                    {/* Domain navigation pills */}
                    <div className="mb-5">
                        <div className="flex items-center justify-between mb-3">
                            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">Browse by Domain</p>
                            {isFiltering && (
                                <button onClick={clearFilters} className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors cursor-pointer">
                                    <X className="w-3.5 h-3.5" /> Clear filters
                                </button>
                            )}
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <button
                                onClick={() => setDept("all")}
                                className={`px-3.5 py-2 rounded-full text-sm font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${dept === "all"
                                    ? "bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900"
                                    : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
                                    }`}
                            >
                                All <span className="opacity-60">({marketplaceBots.length})</span>
                            </button>
                            {activeDepts.map((d) => {
                                const DIcon = DEPT_ICONS[d];
                                const dCount = marketplaceBots.filter((b) => b.department === d).length;
                                const meta = DEPT_META[d];
                                return (
                                    <button
                                        key={d}
                                        onClick={() => setDept(d)}
                                        className={`px-3.5 py-2 rounded-full text-sm font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${dept === d
                                            ? meta.navActive
                                            : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
                                            }`}
                                    >
                                        <DIcon className="w-3.5 h-3.5" />
                                        {d} <span className="opacity-60">({dCount})</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Plan + availability filters */}
                    <div className="flex flex-wrap items-center gap-3 mb-8 pb-4 border-b border-slate-100 dark:border-slate-800">
                        <div className="flex flex-wrap gap-1.5">
                            {PLAN_FILTERS.map((f) => (
                                <button
                                    key={f.value}
                                    onClick={() => setPlan(f.value)}
                                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${plan === f.value
                                        ? "bg-blue-600 text-white"
                                        : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
                                        }`}
                                >
                                    {f.label}
                                </button>
                            ))}
                        </div>
                        <button
                            onClick={() => setOnlyAvailable(!onlyAvailable)}
                            className={`flex items-center gap-2 px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${onlyAvailable
                                ? "bg-green-600 text-white"
                                : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
                                }`}
                        >
                            <span className={`w-1.5 h-1.5 rounded-full ${onlyAvailable ? "bg-white" : "bg-green-500"}`} />
                            Available now
                        </button>
                        <label className="ml-auto flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                            Sort
                            <select
                                value={sortBy}
                                onChange={(event) => setSortBy(event.target.value as SortOption)}
                                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-xs"
                            >
                                {SORT_OPTIONS.map((option) => (
                                    <option key={option.value} value={option.value}>
                                        {option.label}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <span className="text-xs text-slate-400 dark:text-slate-500">
                            {dept === "all" ? filteredAll.length : filteredDept.length} / {marketplaceBots.length} agents
                        </span>
                    </div>

                    {/* â”€â”€ Content: All domains â€” grouped sections â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
                    {dept === "all" && (
                        <div>
                            {activeDepts.map((d) => {
                                const deptBots = filteredAll.filter((b) => b.department === d);
                                return (
                                    <DeptSection
                                        key={d}
                                        dept={d}
                                        deptBots={deptBots}
                                        onViewAll={(d) => setDept(d)}
                                    />
                                );
                            })}
                            {filteredAll.length === 0 && (
                                <div className="text-center py-20">
                                    <p className="text-slate-500 dark:text-slate-400 text-base mb-2">No agents match your current filters.</p>
                                    <p className="text-sm text-slate-400 dark:text-slate-500 mb-4">Try expanding your search or include coming-soon agents.</p>
                                    <div className="flex items-center justify-center gap-3">
                                        <button
                                            onClick={() => setOnlyAvailable(false)}
                                            className="text-sm text-blue-600 hover:underline cursor-pointer"
                                        >
                                            Show coming soon agents
                                        </button>
                                        <button onClick={clearFilters} className="text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer">
                                            Reset filters
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* â”€â”€ Content: Single domain â€” full grid â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
                    {dept !== "all" && currentDeptMeta && CurrentDeptIcon && (
                        <div>
                            {/* Domain header */}
                            <div className={`flex items-center gap-4 p-5 rounded-2xl border mb-8 ${currentDeptMeta.accent}`}>
                                <div className="w-12 h-12 rounded-xl bg-white/70 dark:bg-slate-900/70 flex items-center justify-center border border-white/50 dark:border-slate-700 shrink-0">
                                    <CurrentDeptIcon className={`w-6 h-6 ${currentDeptMeta.iconColor}`} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">{dept}</h2>
                                    <p className="text-sm text-slate-500 dark:text-slate-400">
                                        {filteredDept.length} agent{filteredDept.length !== 1 ? "s" : ""} · click any card to learn more
                                    </p>
                                </div>
                                <button
                                    onClick={() => setDept("all")}
                                    className="shrink-0 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 transition-colors cursor-pointer flex items-center gap-1 font-medium"
                                >
                                    {"<-"} All domains
                                </button>
                            </div>

                            {/* Full bot grid */}
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                                {filteredDept.map((bot, i) => (
                                    <BotCard key={bot.slug} bot={bot} index={i} />
                                ))}
                            </div>

                            {filteredDept.length === 0 && (
                                <div className="text-center py-20">
                                    <p className="text-slate-500 dark:text-slate-400 text-base mb-2">No agents match this domain and filter combination.</p>
                                    <div className="flex items-center justify-center gap-3">
                                        <button onClick={() => setDept("all")} className="text-sm text-blue-600 hover:underline cursor-pointer">
                                            Browse all domains
                                        </button>
                                        <button onClick={clearFilters} className="text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer">
                                            Reset filters
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                </div>
            </section>

            {/* ── Sticky conversion bar ── */}
            <AnimatePresence>
                {count > 0 && (
                    <motion.div
                        key="sticky-bar"
                        initial={{ y: 100, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: 100, opacity: 0 }}
                        transition={{ type: "spring", damping: 22, stiffness: 300 }}
                        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-full max-w-2xl px-4"
                    >
                        <div className="bg-slate-900 dark:bg-slate-50 text-white dark:text-slate-900 rounded-2xl shadow-2xl border border-slate-700 dark:border-slate-200 flex items-center gap-4 px-5 py-3.5">
                            {/* Agent avatars */}
                            <div className="flex -space-x-2 shrink-0">
                                {items.slice(0, 5).map((item) => (
                                    <img
                                        key={item.slug}
                                        src={getBotAvatarUrl(item.slug, 64)}
                                        alt={item.name}
                                        className="w-8 h-8 rounded-full border-2 border-slate-800 dark:border-white bg-slate-700 dark:bg-slate-200 object-cover"
                                        loading="lazy"
                                    />
                                ))}
                                {items.length > 5 && (
                                    <span className="w-8 h-8 rounded-full border-2 border-slate-800 dark:border-white bg-slate-700 dark:bg-slate-100 flex items-center justify-center text-xs font-bold">
                                        +{items.length - 5}
                                    </span>
                                )}
                            </div>

                            {/* Summary */}
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold leading-tight">
                                    {count} agent{count !== 1 ? "s" : ""} selected
                                </p>
                                <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                                    ~${total.toLocaleString()}/mo estimate
                                </p>
                            </div>

                            {/* Primary CTA */}
                            <Link
                                href="/checkout"
                                onClick={() => track({ type: "checkout_started", count, total })}
                                className="shrink-0 bg-blue-600 hover:bg-blue-500 text-white px-5 py-2 rounded-xl text-sm font-semibold transition-colors"
                            >
                                Build my team
                            </Link>

                            {/* Expand sidebar */}
                            <button
                                onClick={() => { track({ type: "view_team_click", count }); openSidebar(); }}
                                aria-label="View team details"
                                className="shrink-0 text-slate-400 dark:text-slate-500 hover:text-slate-200 dark:hover:text-slate-700 transition-colors cursor-pointer"
                            >
                                <ChevronRight className="w-5 h-5" />
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}


