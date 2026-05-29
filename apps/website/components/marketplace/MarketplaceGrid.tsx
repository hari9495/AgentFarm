"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import Link from "next/link";
import {
    Code2, Layout, TestTube2, Server, Target, FileSpreadsheet,
    UserCheck, PenLine, TrendingUp, Megaphone, Calendar, MessageCircle,
    Kanban, Search, X, ArrowRight, ChevronDown, ShoppingCart,
    type LucideIcon,
} from "lucide-react";
import { marketplaceBots, DEPARTMENTS, type Bot, type BotDepartment } from "@/lib/bots";
import { useCart } from "@/lib/cart-store";
import AddToCartButton from "@/components/shared/AddToCartButton";
import { useFunnelTracking } from "@/lib/use-funnel-tracking";

// ─── Short department display names ──────────────────────────────────────────
const DEPT_SHORT: Partial<Record<BotDepartment, string>> = {
    "Customer Success": "Cust. Success",
    "HR & Talent": "HR & Talent",
    "Quality & Testing": "QA & Testing",
    "DevOps & Infrastructure": "DevOps",
    "Data & Analytics": "Data & Analytics",
    "Business Operations": "Biz Ops",
    "Compliance & Security": "Compliance",
};

// ─── Agent icon map ───────────────────────────────────────────────────────────
const AGENT_ICONS: Record<string, string> = {
    "ai-backend-developer": "/agent-icons/ai-backend-developer.png",
    "ai-full-stack-developer": "/agent-icons/ai-full-stack-developer.png",
    "ai-qa-engineer": "/agent-icons/ai-qa-engineer.png",
    "ai-technical-writer": "/agent-icons/ai-technical-writer.png",
    "ai-business-analyst": "/agent-icons/ai-business-analyst.png",
    "ai-technical-recruiter": "/agent-icons/ai-technical-recruiter.png",
    "ai-content-writer": "/agent-icons/ai-content-writer.png",
    "ai-sales-rep": "/agent-icons/ai-sales-rep.png",
    "ai-marketing-specialist": "/agent-icons/ai-marketing-specialist.png",
    "ai-corporate-assistant": "/agent-icons/ai-corporate-assistant.png",
    "ai-customer-support-agent": "/agent-icons/ai-customer-support-agent.png",
    "ai-project-manager": "/agent-icons/ai-project-manager.png",
};

// ─── Fallback lucide icons ────────────────────────────────────────────────────
const FALLBACK_ICONS: Record<string, LucideIcon> = {
    "ai-backend-developer": Code2,
    "ai-full-stack-developer": Layout,
    "ai-qa-engineer": TestTube2,
    "ai-devops-engineer": Server,
    "ai-business-analyst": FileSpreadsheet,
    "ai-technical-writer": PenLine,
    "ai-technical-recruiter": UserCheck,
    "ai-content-writer": PenLine,
    "ai-sales-rep": TrendingUp,
    "ai-marketing-specialist": Megaphone,
    "ai-corporate-assistant": Calendar,
    "ai-customer-support-agent": MessageCircle,
    "ai-project-manager": Kanban,
};

// ─── Dept sidebar icons ───────────────────────────────────────────────────────
const DEPT_ICONS: Partial<Record<BotDepartment, LucideIcon>> = {
    "Engineering": Code2, "Quality & Testing": TestTube2, "Data & Analytics": Target,
    "Product": Target, "Documentation": PenLine, "HR & Talent": UserCheck,
    "Marketing": Megaphone, "Sales": TrendingUp, "Operations": Calendar,
    "Customer Success": MessageCircle,
};

type SortOption = "recommended" | "price-low" | "price-high" | "name";
const SORT_OPTIONS: { value: SortOption; label: string }[] = [
    { value: "recommended", label: "Recommended" },
    { value: "price-low", label: "Price: low → high" },
    { value: "price-high", label: "Price: high → low" },
    { value: "name", label: "A → Z" },
];

const DEDICATED: Record<string, string> = {
    "ai-backend-developer": "/marketplace/developer",
};

// ─── Agent Card (crossfade front ↔ back, auto height) ─────────────────────────
function AgentFlipCard({ bot, index }: { bot: Bot; index: number }) {
    const [showBack, setShowBack] = useState(false);
    const [hovered, setHovered] = useState(false);
    const { hasBot } = useCart();
    const { track } = useFunnelTracking();
    const inCart = hasBot(bot.slug);
    const iconSrc = AGENT_ICONS[bot.slug];
    const FallbackIcon = FALLBACK_ICONS[bot.slug] ?? Code2;

    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, delay: Math.min(index * 0.04, 0.5) }}
            className="relative rounded-[18px] overflow-hidden"
            style={{
                border: inCart ? "2px solid #0066cc" : "1px solid #d2d2d7",
                background: "#ffffff",
                boxShadow: hovered ? "0 8px 24px -10px rgba(0,0,0,0.15)" : "none",
                transition: "box-shadow 200ms ease",
            }}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
        >
            <AnimatePresence mode="wait" initial={false}>
                {!showBack ? (
                    /* ── FRONT ── */
                    <motion.div
                        key="front"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="flex flex-col items-center justify-center gap-3 px-4 py-8"
                        style={{ minHeight: 220 }}
                    >
                        {/* Icon */}
                        <div className="relative shrink-0">
                            {iconSrc ? (
                                <div style={{ width: 96, height: 96, overflow: "hidden" }}>
                                    <img
                                        src={iconSrc}
                                        alt={bot.name}
                                        draggable={false}
                                        style={{ width: "100%", height: "128%", objectFit: "cover", objectPosition: "top center", display: "block" }}
                                    />
                                </div>
                            ) : (
                                <div className="rounded-2xl flex items-center justify-center" style={{ width: 96, height: 96, background: "rgba(0,102,204,0.08)" }}>
                                    <FallbackIcon className="w-10 h-10 text-[#0066cc]" />
                                </div>
                            )}
                            {bot.available && (
                                <span className="absolute rounded-full bg-[#34c759]" style={{ width: 13, height: 13, bottom: 0, right: 0, border: "2.5px solid white" }} />
                            )}
                        </div>

                        {/* Name */}
                        <p className="font-semibold text-[#1d1d1f] text-center leading-snug" style={{ fontSize: "14px", letterSpacing: "-0.01em" }}>
                            {bot.name.replace("AI ", "")}
                        </p>

                        {/* Read More — always visible (not hover-only) */}
                        <button
                            onClick={() => { setShowBack(true); track({ type: "bot_peek_toggle", slug: bot.slug, name: bot.name, open: true }); }}
                            className="flex items-center gap-1 text-[12px] font-semibold text-[#0066cc] hover:text-[#0071e3] transition-colors cursor-pointer"
                        >
                            Read More <ArrowRight className="w-3 h-3" />
                        </button>
                    </motion.div>
                ) : (
                    /* ── BACK — full content, no height constraint ── */
                    <motion.div
                        key="back"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                    >
                        {/* Header */}
                        <div className="flex items-start justify-between px-4 pt-4 pb-3" style={{ borderBottom: "1px solid #f0f0f0" }}>
                            <div className="flex-1 min-w-0 pr-2">
                                <span
                                    className="inline-block text-[10px] font-semibold uppercase tracking-[0.05em] px-1.5 py-0.5 rounded"
                                    style={{ background: "rgba(0,102,204,0.08)", color: "#0066cc", lineHeight: 1.5 }}
                                >
                                    {DEPT_SHORT[bot.department as BotDepartment] ?? bot.department}
                                </span>
                                <p className="font-semibold text-[#1d1d1f] text-[14px] mt-1.5 leading-snug" style={{ letterSpacing: "-0.015em" }}>
                                    {bot.name.replace("AI ", "")}
                                </p>
                            </div>
                            <button
                                onClick={() => setShowBack(false)}
                                className="shrink-0 mt-0.5 text-[#aeaeb2] hover:text-[#6e6e73] transition-colors cursor-pointer"
                                aria-label="Go back"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Body — no height limit, all content visible */}
                        <div className="px-4 py-3 space-y-3">
                            {/* Tagline */}
                            <p className="text-[12px] font-semibold text-[#0066cc]" style={{ lineHeight: 1.5 }}>
                                {bot.tagline}
                            </p>

                            {/* Description */}
                            <p className="text-[12px] text-[#6e6e73]" style={{ lineHeight: 1.6 }}>
                                {bot.description}
                            </p>

                            {/* Skills */}
                            <div className="flex flex-wrap gap-1.5">
                                {bot.skills.slice(0, 4).map((s) => (
                                    <span key={s} className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: "#f5f5f7", color: "#6e6e73" }}>
                                        {s}
                                    </span>
                                ))}
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="flex items-center justify-between px-4 py-3" style={{ borderTop: "1px solid #f0f0f0" }}>
                            <div>
                                <p className="font-semibold text-[#1d1d1f] text-[15px]" style={{ letterSpacing: "-0.02em", lineHeight: 1 }}>
                                    {bot.price}
                                </p>
                                <p className="text-[10px] text-[#aeaeb2] mt-0.5">{bot.plan}</p>
                            </div>
                            <AddToCartButton bot={bot} compact />
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}

// ─── MarketplaceGrid ──────────────────────────────────────────────────────────
export default function MarketplaceGrid() {
    const [dept, setDept] = useState<BotDepartment | "all">("all");
    const [search, setSearch] = useState("");
    const [sortBy, setSortBy] = useState<SortOption>("recommended");
    const [onlyAvailable, setOnlyAvailable] = useState(false);
    const { items, count, total, openSidebar } = useCart();
    const { track } = useFunnelTracking();
    const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const activeDepts = useMemo(
        () => DEPARTMENTS.filter((d) => marketplaceBots.some((b) => b.department === d)),
        []
    );

    const filtered = useMemo(() => {
        const bots = marketplaceBots.filter((b) => {
            if (dept !== "all" && b.department !== dept) return false;
            if (onlyAvailable && !b.available) return false;
            if (search) {
                const q = search.toLowerCase();
                return (
                    b.name.toLowerCase().includes(q) ||
                    b.tagline.toLowerCase().includes(q) ||
                    b.department.toLowerCase().includes(q) ||
                    b.skills.some((s) => s.toLowerCase().includes(q))
                );
            }
            return true;
        });
        return bots.sort((a, b) => {
            if (sortBy === "name") return a.name.localeCompare(b.name);
            if (sortBy === "price-low") return a.priceMonthly - b.priceMonthly;
            if (sortBy === "price-high") return b.priceMonthly - a.priceMonthly;
            if (a.available !== b.available) return a.available ? -1 : 1;
            return a.priceMonthly - b.priceMonthly;
        });
    }, [dept, search, sortBy, onlyAvailable]);

    useEffect(() => {
        if (!search) return;
        if (searchRef.current) clearTimeout(searchRef.current);
        searchRef.current = setTimeout(() => track({ type: "search_query", query: search, results: filtered.length }), 600);
        return () => { if (searchRef.current) clearTimeout(searchRef.current); };
    }, [search]); // eslint-disable-line

    return (
        <div>
            {/* ── Toolbar ── */}
            <div className="flex flex-wrap items-center gap-3 mb-6">
                {/* Search */}
                <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#aeaeb2] pointer-events-none" />
                    <input
                        type="search"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search by role, skill, or department..."
                        className="w-full pl-10 pr-8 py-2.5 text-[14px] text-[#1d1d1f] placeholder:text-[#aeaeb2] outline-none"
                        style={{ border: "1px solid #d2d2d7", borderRadius: 11, background: "#ffffff" }}
                        onFocus={(e) => (e.currentTarget.style.borderColor = "#0066cc")}
                        onBlur={(e) => (e.currentTarget.style.borderColor = "#d2d2d7")}
                    />
                    {search && (
                        <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#aeaeb2] hover:text-[#6e6e73] cursor-pointer">
                            <X className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>

                {/* Live now toggle */}
                <button
                    onClick={() => setOnlyAvailable(!onlyAvailable)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-full text-[13px] font-medium transition-colors cursor-pointer shrink-0"
                    style={{
                        background: onlyAvailable ? "#34c759" : "#f5f5f7",
                        color: onlyAvailable ? "#ffffff" : "#6e6e73",
                    }}
                >
                    <span className={`w-1.5 h-1.5 rounded-full ${onlyAvailable ? "bg-white" : "bg-[#34c759]"}`} />
                    Live now
                </button>

                {/* Sort */}
                <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as SortOption)}
                    className="px-3 py-2 text-[13px] text-[#1d1d1f] rounded-[11px] outline-none cursor-pointer shrink-0"
                    style={{ border: "1px solid #d2d2d7", background: "#ffffff" }}
                >
                    {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>

                {/* Count */}
                <span className="text-[12px] text-[#aeaeb2] shrink-0">{filtered.length} / {marketplaceBots.length}</span>
            </div>

            {/* ── Dept filter pills ── */}
            <div className="flex flex-wrap gap-2 mb-6">
                <button
                    onClick={() => setDept("all")}
                    className="px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors cursor-pointer"
                    style={{ background: dept === "all" ? "#1d1d1f" : "#f5f5f7", color: dept === "all" ? "#ffffff" : "#6e6e73" }}
                >
                    All ({marketplaceBots.length})
                </button>
                {activeDepts.map((d) => {
                    const cnt = marketplaceBots.filter((b) => b.department === d).length;
                    return (
                        <button
                            key={d}
                            onClick={() => setDept(d)}
                            className="px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors cursor-pointer"
                            style={{
                                background: dept === d ? "#0066cc" : "#f5f5f7",
                                color: dept === d ? "#ffffff" : "#6e6e73",
                            }}
                        >
                            {d} ({cnt})
                        </button>
                    );
                })}
            </div>

            {/* ── Agent icon grid ── */}
            {filtered.length === 0 ? (
                <div className="text-center py-16">
                    <p className="text-[17px] font-semibold text-[#1d1d1f] mb-2">No workers match your filters</p>
                    <button
                        onClick={() => { setDept("all"); setSearch(""); setOnlyAvailable(false); }}
                        className="text-[14px] text-[#0066cc] hover:text-[#0071e3] transition-colors cursor-pointer mt-3"
                    >
                        Clear all filters
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
                    {filtered.map((bot, i) => (
                        <AgentFlipCard key={bot.slug} bot={bot} index={i} />
                    ))}
                </div>
            )}

            {/* ── Sticky cart bar ── */}
            <AnimatePresence>
                {count > 0 && (
                    <motion.div
                        key="sticky"
                        initial={{ y: 80, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: 80, opacity: 0 }}
                        transition={{ type: "spring", damping: 24, stiffness: 320 }}
                        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-full max-w-lg px-4"
                    >
                        <div
                            className="flex items-center gap-4 px-5 py-3.5 rounded-[18px]"
                            style={{ background: "#1a1a1c", border: "1px solid rgba(255,255,255,0.1)", boxShadow: "0 24px 56px -20px rgba(0,0,0,0.6)" }}
                        >
                            {/* Avatars */}
                            <div className="flex -space-x-2 shrink-0">
                                {items.slice(0, 5).map((item) => {
                                    const iconSrc = AGENT_ICONS[item.slug];
                                    return iconSrc ? (
                                        <img key={item.slug} src={iconSrc} alt={item.name}
                                            className="w-8 h-8 rounded-full object-cover" style={{ border: "2px solid #1a1a1c" }} />
                                    ) : (
                                        <div key={item.slug} className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white" style={{ background: "#0066cc", border: "2px solid #1a1a1c" }}>
                                            {item.name.slice(0, 2)}
                                        </div>
                                    );
                                })}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-[13px] font-semibold text-white">{count} worker{count !== 1 ? "s" : ""} selected</p>
                                <p className="text-[11px] text-[#98989d]">~${total.toLocaleString()}/mo</p>
                            </div>
                            <Link
                                href="/checkout"
                                onClick={() => track({ type: "checkout_started", count, total })}
                                className="shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-full text-[13px] font-medium text-white transition-colors"
                                style={{ background: "#0066cc" }}
                                onMouseOver={(e) => (e.currentTarget.style.background = "#0071e3")}
                                onMouseOut={(e) => (e.currentTarget.style.background = "#0066cc")}
                            >
                                <ShoppingCart className="w-3.5 h-3.5" />
                                Build my team
                            </Link>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
