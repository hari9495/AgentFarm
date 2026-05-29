"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
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
    TrendingUp, Megaphone, Calendar, ArrowRight, CheckCircle2,
    type LucideIcon,
} from "lucide-react";
import { marketplaceBots, DEPARTMENTS, type Bot, type BotDepartment } from "@/lib/bots";
import { getBotAvatarUrl } from "@/lib/bot-avatar";
import { useCart } from "@/lib/cart-store";
import AddToCartButton from "@/components/shared/AddToCartButton";
import { useFunnelTracking } from "@/lib/use-funnel-tracking";
import { useCompactMotion } from "@/lib/useCompactMotion";

const DEDICATED_DETAIL_PAGES: Record<string, string> = {
    "ai-backend-developer": "/marketplace/developer",
};

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

const DEPT_ICONS: Record<BotDepartment, LucideIcon> = {
    "Engineering": Code2, "DevOps & Infrastructure": Server, "Quality & Testing": TestTube2,
    "Security": ShieldCheck, "Data & Analytics": BarChart3, "Product": Target, "Design": Palette,
    "Documentation": FileText, "IT & Support": LifeBuoy, "Marketing": Mail, "HR & Talent": UserCheck,
    "Finance": DollarSign, "Customer Success": MessageCircle, "Operations": Layers, "Creative": Sparkles,
    "Business Operations": Briefcase, "Compliance & Security": Shield, "E-Commerce": ShoppingCart,
    "Legal": Scale, "Healthcare": Heart, "Real Estate": Building2, "Supply Chain": Package,
    "Education": BookOpen, "Automation": Zap, "Productivity": Gauge, "Personal": User,
    "Voice & Communication": Mic, "Sales": TrendingUp,
};

// Single-accent department colours (blue only — Apple single-accent)
const DEPT_COLOR: Record<BotDepartment, string> = {} as Record<BotDepartment, string>;
DEPARTMENTS.forEach((d) => { DEPT_COLOR[d] = "#0066cc"; });

const PLAN_FILTERS: { value: Bot["plan"] | "all"; label: string }[] = [
    { value: "all", label: "All plans" },
    { value: "Starter+", label: "Starter+" },
    { value: "Pro+", label: "Pro+" },
    { value: "Enterprise", label: "Enterprise" },
];

type SortOption = "recommended" | "price-low" | "price-high" | "name";
const SORT_OPTIONS: Array<{ value: SortOption; label: string }> = [
    { value: "recommended", label: "Recommended" },
    { value: "price-low", label: "Price: low → high" },
    { value: "price-high", label: "Price: high → low" },
    { value: "name", label: "Name: A → Z" },
];

const SOCIAL_PROOF: Record<string, { teams: number; rating: number }> = {
    "ai-backend-developer": { teams: 214, rating: 4.9 },
    "ai-qa-engineer": { teams: 176, rating: 4.9 },
    "ai-technical-writer": { teams: 156, rating: 4.8 },
    "ai-full-stack-developer": { teams: 245, rating: 4.9 },
    "ai-content-writer": { teams: 188, rating: 4.9 },
    "ai-sales-rep": { teams: 162, rating: 4.8 },
    "ai-marketing-specialist": { teams: 137, rating: 4.8 },
    "ai-customer-support-agent": { teams: 219, rating: 4.9 },
    "ai-corporate-assistant": { teams: 201, rating: 4.9 },
    "ai-project-manager": { teams: 178, rating: 4.8 },
    "ai-business-analyst": { teams: 119, rating: 4.7 },
    "ai-technical-recruiter": { teams: 97, rating: 4.7 },
};

// ─── BotCard ──────────────────────────────────────────────────────────────────
function BotCard({ bot, index }: { bot: Bot; index: number }) {
    const compactMotion = useCompactMotion();
    const [peekOpen, setPeekOpen] = useState(false);
    const { hasBot } = useCart();
    const { track } = useFunnelTracking();
    const inCart = hasBot(bot.slug);
    const Icon = ICON_MAP[bot.slug] ?? DEPT_ICONS[bot.department] ?? Code2;
    const avatarUrl = getBotAvatarUrl(bot.slug);
    const proof = bot.available ? (SOCIAL_PROOF[bot.slug] ?? null) : null;
    const setupTime = bot.available ? "5–10 min setup" : "Coming soon";
    const topIntegration = bot.integrations[0] ?? "GitHub";
    const nextOutcome = bot.useCases[1] ?? bot.useCases[0] ?? "Reliable task delivery";
    const detailHref = DEDICATED_DETAIL_PAGES[bot.slug] ?? `/marketplace/${bot.slug}`;

    function togglePeek() {
        const next = !peekOpen;
        setPeekOpen(next);
        track({ type: "bot_peek_toggle", slug: bot.slug, name: bot.name, open: next });
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: Math.min(index * 0.04, 0.5) }}
            whileHover={compactMotion ? undefined : { y: -4 }}
            className="flex flex-col rounded-[18px] bg-white transition-shadow"
            style={{
                border: inCart ? "2px solid #0066cc" : "1px solid #d2d2d7",
                boxShadow: inCart ? "0 0 0 1px rgba(0,102,204,0.15)" : "none",
                opacity: bot.available ? 1 : 0.6,
            }}
        >
            {/* Header */}
            <div className="p-5 pb-3">
                <div className="flex items-start justify-between mb-3">
                    <div className="relative">
                        <img
                            src={avatarUrl}
                            alt={bot.name}
                            className="w-12 h-12 rounded-[12px] object-cover"
                            style={{ background: "rgba(0,102,204,0.08)" }}
                            loading="lazy"
                        />
                        {bot.available && (
                            <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-[#34c759]" style={{ border: "2px solid white" }} />
                        )}
                    </div>
                    <div className="flex items-center gap-1.5">
                        {inCart && (
                            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: "rgba(0,102,204,0.08)", color: "#0066cc" }}>
                                Added
                            </span>
                        )}
                        {!bot.available && (
                            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: "#f5f5f7", color: "#aeaeb2" }}>
                                Soon
                            </span>
                        )}
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: "rgba(0,102,204,0.06)", color: "#0066cc" }}>
                            {bot.department}
                        </span>
                    </div>
                </div>

                {/* Name + tagline */}
                <Link
                    href={detailHref}
                    className="font-semibold text-[15px] text-[#1d1d1f] hover:text-[#0066cc] transition-colors block leading-snug"
                    style={{ letterSpacing: "-0.015em" }}
                    onClick={() => track({ type: "bot_quick_start_click", slug: bot.slug, name: bot.name })}
                >
                    {bot.name}
                </Link>
                <p className="mt-0.5 text-[12px] font-medium" style={{ color: "#0066cc" }}>{bot.tagline}</p>

                {/* Description */}
                <p className="mt-2 text-[13px] text-[#6e6e73]" style={{ lineHeight: 1.5 }}>
                    {bot.description}
                </p>

                {/* First use case */}
                {bot.useCases[0] && (
                    <p className="mt-2.5 text-[12px] text-[#aeaeb2]">
                        First win: {bot.useCases[0]}
                    </p>
                )}
            </div>

            {/* Quick peek toggle */}
            <div className="px-5">
                <button
                    type="button"
                    onClick={togglePeek}
                    className="inline-flex items-center gap-1 text-[12px] font-medium text-[#6e6e73] hover:text-[#0066cc] transition-colors cursor-pointer"
                >
                    <Sparkles className="w-3 h-3" />
                    {peekOpen ? "Hide peek" : "Quick peek"}
                </button>

                <AnimatePresence initial={false}>
                    {peekOpen && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden"
                        >
                            <div className="mt-2 mb-1 rounded-[11px] p-3 space-y-2" style={{ background: "#f5f5f7" }}>
                                <p className="text-[11px] font-semibold text-[#1d1d1f]">What to expect in week one</p>
                                <div className="flex items-center gap-1.5 text-[11px] text-[#6e6e73]">
                                    <Calendar className="w-3.5 h-3.5 text-[#0066cc]" />
                                    {setupTime}
                                </div>
                                <div className="flex items-center gap-1.5 text-[11px] text-[#6e6e73]">
                                    <CheckCircle2 className="w-3.5 h-3.5 text-[#34c759]" />
                                    Integrates with {topIntegration}
                                </div>
                                <p className="text-[11px] text-[#6e6e73]">Next win: {nextOutcome}</p>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Social proof */}
            {proof && (
                <div className="px-5 mt-2.5 flex items-center gap-3">
                    <span className="flex items-center gap-1 text-[12px] font-medium" style={{ color: "#ff9f0a" }}>
                        <Star className="w-3 h-3 fill-[#ff9f0a] stroke-[#ff9f0a]" />
                        {proof.rating.toFixed(1)}
                    </span>
                    <span className="text-[12px] text-[#aeaeb2]">{proof.teams}+ teams</span>
                    <span className="flex items-center gap-0.5 text-[12px] font-medium text-[#0066cc]">
                        <Zap className="w-3 h-3" /> Fast deploy
                    </span>
                </div>
            )}

            {/* Skills */}
            <div className="px-5 mt-3 flex flex-wrap gap-1.5">
                {bot.skills.slice(0, 4).map((s) => (
                    <span key={s} className="text-[11px] px-2 py-0.5 rounded" style={{ background: "#f5f5f7", color: "#6e6e73" }}>
                        {s}
                    </span>
                ))}
            </div>

            {/* Price + CTA */}
            <div className="mt-auto px-5 py-4 flex items-center justify-between gap-3" style={{ borderTop: "1px solid #f0f0f0", marginTop: 12 }}>
                <div>
                    <p className="font-semibold text-[17px] text-[#1d1d1f]" style={{ letterSpacing: "-0.02em", lineHeight: 1 }}>
                        {bot.price}
                    </p>
                    <p className="text-[11px] text-[#aeaeb2] mt-0.5">{bot.plan}</p>
                </div>
                <div className="shrink-0">
                    <AddToCartButton bot={bot} />
                </div>
            </div>
        </motion.div>
    );
}

// ─── DeptSection ──────────────────────────────────────────────────────────────
function DeptSection({ dept, deptBots, onViewAll }: { dept: BotDepartment; deptBots: Bot[]; onViewAll: (d: BotDepartment) => void }) {
    if (deptBots.length === 0) return null;
    const DeptIcon = DEPT_ICONS[dept];
    const preview = deptBots.slice(0, 4);

    return (
        <section className="mb-10">
            <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-[10px] flex items-center justify-center" style={{ background: "rgba(0,102,204,0.08)" }}>
                        <DeptIcon className="w-4.5 h-4.5 text-[#0066cc]" />
                    </div>
                    <div>
                        <h2 className="font-semibold text-[15px] text-[#1d1d1f]" style={{ letterSpacing: "-0.015em" }}>{dept}</h2>
                        <p className="text-[12px] text-[#aeaeb2]">{deptBots.length} worker{deptBots.length !== 1 ? "s" : ""}</p>
                    </div>
                </div>
                <button
                    onClick={() => onViewAll(dept)}
                    className="flex items-center gap-1 text-[13px] font-medium text-[#0066cc] hover:text-[#0071e3] transition-colors cursor-pointer"
                >
                    See all {deptBots.length} <ChevronRight className="w-4 h-4" />
                </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {preview.map((bot, i) => <BotCard key={bot.slug} bot={bot} index={i} />)}
            </div>
            {deptBots.length > 4 && (
                <div className="mt-3 text-center">
                    <button
                        onClick={() => onViewAll(dept)}
                        className="text-[12px] font-medium text-[#0066cc] hover:text-[#0071e3] transition-colors cursor-pointer"
                    >
                        + {deptBots.length - 4} more workers →
                    </button>
                </div>
            )}
        </section>
    );
}

// ─── MarketplaceGrid (main export) ────────────────────────────────────────────
export default function MarketplaceGrid() {
    const [dept, setDept] = useState<BotDepartment | "all">("all");
    const [plan, setPlan] = useState<Bot["plan"] | "all">("all");
    const [onlyAvailable, setOnlyAvailable] = useState(false);
    const [sortBy, setSortBy] = useState<SortOption>("recommended");
    const [search, setSearch] = useState("");
    const { items, count, total, openSidebar } = useCart();
    const { track } = useFunnelTracking();
    const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const activeDepts = useMemo(
        () => DEPARTMENTS.filter((d) => marketplaceBots.some((b) => b.department === d)),
        []
    );

    const isFiltering = dept !== "all" || plan !== "all" || onlyAvailable || sortBy !== "recommended" || search !== "";

    const filteredAll = useMemo(() => {
        const filtered = marketplaceBots.filter((b) => {
            if (plan !== "all" && b.plan !== plan) return false;
            if (onlyAvailable && !b.available) return false;
            if (search) {
                const q = search.toLowerCase();
                if (!b.name.toLowerCase().includes(q) && !b.tagline.toLowerCase().includes(q) && !b.department.toLowerCase().includes(q) && !b.skills.some((s) => s.toLowerCase().includes(q))) return false;
            }
            return true;
        });
        return filtered.sort((a, b) => {
            if (sortBy === "name") return a.name.localeCompare(b.name);
            if (sortBy === "price-low") return a.priceMonthly - b.priceMonthly;
            if (sortBy === "price-high") return b.priceMonthly - a.priceMonthly;
            if (a.available !== b.available) return a.available ? -1 : 1;
            return a.priceMonthly - b.priceMonthly;
        });
    }, [plan, onlyAvailable, search, sortBy]);

    const filteredDept = useMemo(() => dept === "all" ? [] : filteredAll.filter((b) => b.department === dept), [dept, filteredAll]);

    function clearFilters() { setDept("all"); setPlan("all"); setOnlyAvailable(false); setSortBy("recommended"); setSearch(""); }

    useEffect(() => {
        track({ type: "filter_change", dept, plan, sort: sortBy, available: onlyAvailable });
    }, [dept, plan, sortBy, onlyAvailable]); // eslint-disable-line

    useEffect(() => {
        if (!search) return;
        if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
        searchDebounceRef.current = setTimeout(() => {
            const resultCount = dept === "all" ? filteredAll.length : filteredDept.length;
            track({ type: "search_query", query: search, results: resultCount });
        }, 600);
        return () => { if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current); };
    }, [search]); // eslint-disable-line

    const CurrentDeptIcon = dept !== "all" ? DEPT_ICONS[dept] : null;

    return (
        <div>
            {/* ── Search bar ── */}
            <div className="relative mb-5">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#aeaeb2] pointer-events-none" />
                <input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search by role, skill, or department..."
                    className="w-full pl-11 pr-10 py-3 text-[15px] text-[#1d1d1f] placeholder:text-[#aeaeb2] outline-none transition-colors"
                    style={{ border: "1px solid #d2d2d7", borderRadius: "11px", background: "#ffffff" }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = "#0066cc")}
                    onBlur={(e) => (e.currentTarget.style.borderColor = "#d2d2d7")}
                />
                {search && (
                    <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#aeaeb2] hover:text-[#6e6e73] cursor-pointer">
                        <X className="w-4 h-4" />
                    </button>
                )}
            </div>

            {/* ── Dept pills ── */}
            <div className="mb-4">
                <div className="flex items-center justify-between mb-2.5">
                    <p className="text-[12px] font-semibold uppercase tracking-[0.06em] text-[#aeaeb2]">Department</p>
                    {isFiltering && (
                        <button onClick={clearFilters} className="flex items-center gap-1 text-[12px] text-[#6e6e73] hover:text-[#1d1d1f] transition-colors cursor-pointer">
                            <X className="w-3.5 h-3.5" /> Clear filters
                        </button>
                    )}
                </div>
                <div className="flex flex-wrap gap-2">
                    <button
                        onClick={() => setDept("all")}
                        className="px-3.5 py-1.5 rounded-full text-[13px] font-medium transition-colors cursor-pointer"
                        style={{ background: dept === "all" ? "#1d1d1f" : "#f5f5f7", color: dept === "all" ? "#ffffff" : "#6e6e73" }}
                    >
                        All ({marketplaceBots.length})
                    </button>
                    {activeDepts.map((d) => {
                        const DIcon = DEPT_ICONS[d];
                        const dCount = marketplaceBots.filter((b) => b.department === d).length;
                        return (
                            <button
                                key={d}
                                onClick={() => setDept(d)}
                                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[13px] font-medium transition-colors cursor-pointer"
                                style={{
                                    background: dept === d ? "#0066cc" : "#f5f5f7",
                                    color: dept === d ? "#ffffff" : "#6e6e73",
                                }}
                            >
                                <DIcon className="w-3.5 h-3.5" />
                                {d} ({dCount})
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* ── Plan + availability + sort bar ── */}
            <div className="flex flex-wrap items-center gap-3 mb-8 pb-5" style={{ borderBottom: "1px solid #e8e8ed" }}>
                <div className="flex flex-wrap gap-1.5">
                    {PLAN_FILTERS.map((f) => (
                        <button
                            key={f.value}
                            onClick={() => setPlan(f.value)}
                            className="px-3 py-1 rounded-full text-[12px] font-medium transition-colors cursor-pointer"
                            style={{ background: plan === f.value ? "#0066cc" : "#f5f5f7", color: plan === f.value ? "#ffffff" : "#6e6e73" }}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>
                <button
                    onClick={() => setOnlyAvailable(!onlyAvailable)}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-medium transition-colors cursor-pointer"
                    style={{ background: onlyAvailable ? "#34c759" : "#f5f5f7", color: onlyAvailable ? "#ffffff" : "#6e6e73" }}
                >
                    <span className={`w-1.5 h-1.5 rounded-full ${onlyAvailable ? "bg-white" : "bg-[#34c759]"}`} />
                    Live now
                </button>
                <label className="ml-auto flex items-center gap-2 text-[12px] text-[#6e6e73]">
                    Sort
                    <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value as SortOption)}
                        className="rounded-[8px] px-2 py-1 text-[12px] text-[#1d1d1f] outline-none cursor-pointer"
                        style={{ border: "1px solid #d2d2d7", background: "#ffffff" }}
                    >
                        {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                </label>
                <span className="text-[12px] text-[#aeaeb2]">
                    {dept === "all" ? filteredAll.length : filteredDept.length} / {marketplaceBots.length}
                </span>
            </div>

            {/* ── Content: All domains ── */}
            {dept === "all" && (
                <div>
                    {activeDepts.map((d) => (
                        <DeptSection key={d} dept={d} deptBots={filteredAll.filter((b) => b.department === d)} onViewAll={(d) => setDept(d)} />
                    ))}
                    {filteredAll.length === 0 && (
                        <div className="text-center py-20">
                            <p className="text-[17px] font-semibold text-[#1d1d1f] mb-2">No workers match your filters</p>
                            <p className="text-[15px] text-[#6e6e73] mb-5">Try expanding your search or include coming-soon workers.</p>
                            <div className="flex items-center justify-center gap-3">
                                <button onClick={() => setOnlyAvailable(false)} className="text-[14px] text-[#0066cc] hover:text-[#0071e3] transition-colors cursor-pointer">Show all workers</button>
                                <button onClick={clearFilters} className="text-[14px] text-[#6e6e73] hover:text-[#1d1d1f] transition-colors cursor-pointer">Reset filters</button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ── Content: Single dept ── */}
            {dept !== "all" && CurrentDeptIcon && (
                <div>
                    <div className="flex items-center gap-4 p-5 rounded-[18px] mb-8" style={{ border: "1px solid #d2d2d7", background: "rgba(0,102,204,0.03)" }}>
                        <div className="w-11 h-11 rounded-[10px] flex items-center justify-center shrink-0" style={{ background: "rgba(0,102,204,0.08)" }}>
                            <CurrentDeptIcon className="w-5 h-5 text-[#0066cc]" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <h2 className="font-semibold text-[17px] text-[#1d1d1f]">{dept}</h2>
                            <p className="text-[13px] text-[#6e6e73]">
                                {filteredDept.length} worker{filteredDept.length !== 1 ? "s" : ""} · click any card to learn more
                            </p>
                        </div>
                        <button
                            onClick={() => setDept("all")}
                            className="shrink-0 text-[13px] font-medium text-[#0066cc] hover:text-[#0071e3] transition-colors cursor-pointer flex items-center gap-1"
                        >
                            ← All departments
                        </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {filteredDept.map((bot, i) => <BotCard key={bot.slug} bot={bot} index={i} />)}
                    </div>
                    {filteredDept.length === 0 && (
                        <div className="text-center py-20">
                            <p className="text-[17px] font-semibold text-[#1d1d1f] mb-2">No workers in this department match your filters</p>
                            <div className="flex items-center justify-center gap-3 mt-4">
                                <button onClick={() => setDept("all")} className="text-[14px] text-[#0066cc] hover:text-[#0071e3] transition-colors cursor-pointer">Browse all</button>
                                <button onClick={clearFilters} className="text-[14px] text-[#6e6e73] hover:text-[#1d1d1f] transition-colors cursor-pointer">Reset filters</button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ── Sticky cart bar ── */}
            <AnimatePresence>
                {count > 0 && (
                    <motion.div
                        key="sticky-bar"
                        initial={{ y: 80, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: 80, opacity: 0 }}
                        transition={{ type: "spring", damping: 24, stiffness: 320 }}
                        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-full max-w-xl px-4"
                    >
                        <div
                            className="flex items-center gap-4 px-5 py-3.5 rounded-[18px]"
                            style={{ background: "#1a1a1c", border: "1px solid rgba(255,255,255,0.1)", boxShadow: "0 24px 56px -20px rgba(0,0,0,0.6)" }}
                        >
                            <div className="flex -space-x-2 shrink-0">
                                {items.slice(0, 5).map((item) => (
                                    <img key={item.slug} src={getBotAvatarUrl(item.slug, 64)} alt={item.name}
                                        className="w-8 h-8 rounded-full object-cover" style={{ border: "2px solid #1a1a1c" }} loading="lazy" />
                                ))}
                                {items.length > 5 && (
                                    <span className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white" style={{ border: "2px solid #1a1a1c", background: "#333" }}>
                                        +{items.length - 5}
                                    </span>
                                )}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-[14px] font-semibold text-white leading-tight">{count} worker{count !== 1 ? "s" : ""} selected</p>
                                <p className="text-[12px] text-[#98989d] mt-0.5">~${total.toLocaleString()}/mo</p>
                            </div>
                            <Link
                                href="/checkout"
                                onClick={() => track({ type: "checkout_started", count, total })}
                                className="shrink-0 flex items-center gap-1.5 px-5 py-2 rounded-full text-[14px] font-medium text-white transition-colors"
                                style={{ background: "#0066cc" }}
                                onMouseOver={(e) => (e.currentTarget.style.background = "#0071e3")}
                                onMouseOut={(e) => (e.currentTarget.style.background = "#0066cc")}
                            >
                                Build my team <ArrowRight className="w-4 h-4" />
                            </Link>
                            <button
                                onClick={() => { track({ type: "view_team_click", count }); openSidebar(); }}
                                aria-label="View team details"
                                className="shrink-0 text-[#98989d] hover:text-white transition-colors cursor-pointer"
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
