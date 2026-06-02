"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
    Activity,
    ArrowUpRight,
    BarChart3,
    Bell,
    Bot,
    ClipboardCheck,
    Cpu,
    FileArchive,
    Layers,
    LayoutDashboard,
    Link2,
    LogOut,
    Menu,
    Moon,
    Rocket,
    Search,
    Settings,
    Shield,
    ShieldCheck,
    Sun,
    Radio,
    ArrowDownToLine,
    X,
    ChevronRight,
    type LucideIcon,
} from "lucide-react";
import { useTheme } from "@/components/shared/ThemeProvider";
import CommandPalette from "@/components/shared/CommandPalette";

// ── Nav structure ─────────────────────────────────────────────────────────────

type NavItem = {
    href: string;
    label: string;
    icon: LucideIcon;
    exact?: boolean;
    badge?: "approvals" | "notifications";
};

type NavGroup = {
    label: string;
    items: NavItem[];
};

const dashboardGroups: NavGroup[] = [
    {
        label: "Main",
        items: [
            { href: "/dashboard",              label: "Overview",      icon: LayoutDashboard, exact: true },
            { href: "/dashboard/agents",       label: "Agents",        icon: Bot },
            { href: "/dashboard/approvals",    label: "Approvals",     icon: ClipboardCheck, badge: "approvals" },
        ],
    },
    {
        label: "Operations",
        items: [
            { href: "/dashboard/deployments",  label: "Deployments",   icon: Rocket },
            { href: "/dashboard/bots",         label: "Bot Status",    icon: Radio },
            { href: "/dashboard/activity",     label: "Activity",      icon: Activity },
            { href: "/dashboard/evidence",     label: "Evidence",      icon: FileArchive },
            { href: "/dashboard/reports",      label: "Reports",       icon: BarChart3 },
        ],
    },
    {
        label: "Configure",
        items: [
            { href: "/dashboard/integrations", label: "Integrations",  icon: Link2 },
            { href: "/dashboard/webhooks",     label: "Webhooks",      icon: ArrowDownToLine },
            { href: "/dashboard/mcp",          label: "MCP Servers",   icon: Cpu },
            { href: "/dashboard/adapters",     label: "Custom APIs",   icon: Layers },
            { href: "/dashboard/governance",   label: "Governance",    icon: ShieldCheck },
        ],
    },
    {
        label: "Account",
        items: [
            { href: "/dashboard/notifications", label: "Notifications", icon: Bell, badge: "notifications" },
            { href: "/dashboard/settings",      label: "Settings",      icon: Settings },
        ],
    },
];

// ── Types ─────────────────────────────────────────────────────────────────────

type BadgeCounts  = { approvals: number; notifications: number };
type SidebarUserRole = "superadmin" | "admin" | "member";

// ── Single nav item ────────────────────────────────────────────────────────────

function NavLink({
    item,
    badges,
    onClick,
}: {
    item: NavItem;
    badges: BadgeCounts;
    onClick?: () => void;
}) {
    const pathname = usePathname();
    const active = item.exact
        ? pathname === item.href
        : pathname === item.href || pathname.startsWith(item.href + "/");

    const Icon  = item.icon;
    const count = item.badge ? badges[item.badge] : 0;

    return (
        <Link
            href={item.href}
            onClick={onClick}
            className={`
                group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm
                font-medium transition-all duration-150 select-none
                ${active
                    ? "bg-sky-500/15 text-white shadow-sm"
                    : "text-slate-400 hover:bg-white/[0.05] hover:text-slate-100"
                }
            `}
        >
            {/* Left accent bar */}
            {active && (
                <span className="absolute left-0 inset-y-[6px] w-[3px] rounded-r-full bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.6)]" />
            )}

            {/* Icon container */}
            <span className={`
                flex items-center justify-center w-8 h-8 rounded-lg shrink-0 transition-all duration-150
                ${active
                    ? "bg-sky-500/20 text-sky-300"
                    : "text-slate-500 group-hover:text-slate-300 group-hover:bg-white/[0.06]"
                }
            `}>
                <Icon className="w-[17px] h-[17px]" />
            </span>

            <span className="flex-1 truncate tracking-[-0.01em]">{item.label}</span>

            {count > 0 && (
                <span className="inline-flex items-center justify-center min-w-[20px] h-5 rounded-full bg-rose-500 text-white text-[10px] font-bold px-1.5 shrink-0 shadow-sm shadow-rose-500/40">
                    {count > 99 ? "99+" : count}
                </span>
            )}

            {!active && !count && (
                <ChevronRight className="w-3 h-3 text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
            )}
        </Link>
    );
}

// ── Sidebar content ────────────────────────────────────────────────────────────

function SidebarContent({
    userName,
    userRole,
    showCompanyPortal,
    badges,
    onClose,
}: {
    userName: string;
    userRole: SidebarUserRole;
    showCompanyPortal?: boolean;
    badges: BadgeCounts;
    onClose?: () => void;
}) {
    const router = useRouter();
    const { theme, toggle } = useTheme();

    const initials = userName
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((p) => p[0]?.toUpperCase() ?? "")
        .join("") || "U";

    const roleLabel =
        userRole === "superadmin" ? "Super Admin"
        : userRole === "admin"    ? "Org Admin"
        : "Member";

    const handleLogout = async () => {
        await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
        router.push("/login");
    };

    const openSearch = () => {
        window.dispatchEvent(
            new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true }),
        );
    };

    return (
        <aside className="flex flex-col w-64 h-full bg-[#0d1117] border-r border-white/[0.07]">

            {/* CommandPalette listener — renders nothing visible */}
            <CommandPalette />

            {/* ── Logo row ─────────────────────────────────────────────── */}
            <div className="flex items-center gap-3 px-4 py-5 border-b border-white/[0.07] shrink-0">
                <Link
                    href="/"
                    onClick={onClose}
                    className="flex items-center gap-3 group flex-1 min-w-0"
                >
                    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 via-blue-600 to-emerald-500 shadow-lg shadow-sky-500/25">
                        <Bot className="w-4 h-4 text-white" />
                    </span>
                    <div className="min-w-0">
                        <span className="block text-[15px] font-bold text-white tracking-tight group-hover:text-sky-300 transition-colors truncate leading-tight">
                            AgentFarms
                        </span>
                        <span className="block text-[10px] text-slate-500 uppercase tracking-widest font-semibold leading-tight mt-0.5">
                            Dashboard
                        </span>
                    </div>
                </Link>
                {onClose && (
                    <button
                        onClick={onClose}
                        className="shrink-0 p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-white/8 transition-colors md:hidden"
                    >
                        <X className="w-4 h-4" />
                    </button>
                )}
            </div>

            {/* ── Search bar ───────────────────────────────────────────── */}
            <div className="px-3 pt-4 pb-2">
                <button
                    onClick={openSearch}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-[13px] text-slate-500 hover:bg-white/[0.07] hover:text-slate-300 hover:border-white/[0.12] transition-all group"
                >
                    <Search className="w-4 h-4 shrink-0 group-hover:text-slate-300 transition-colors" />
                    <span className="flex-1 text-left">Search…</span>
                    <kbd className="text-[10px] font-mono bg-white/[0.06] text-slate-600 px-1.5 py-0.5 rounded-md border border-white/[0.06]">⌘K</kbd>
                </button>
            </div>

            {/* ── Nav groups ───────────────────────────────────────────── */}
            <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-5 scrollbar-none">
                {dashboardGroups.map((group) => (
                    <div key={group.label}>
                        {/* Section header */}
                        <div className="flex items-center gap-2 px-3 mb-2">
                            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-600">
                                {group.label}
                            </p>
                            <div className="flex-1 h-px bg-white/[0.05]" />
                        </div>
                        <div className="space-y-0.5">
                            {group.items.map((item) => (
                                <NavLink
                                    key={item.href}
                                    item={item}
                                    badges={badges}
                                    onClick={onClose}
                                />
                            ))}
                        </div>
                    </div>
                ))}

                {/* Internal links (admin / company portal) */}
                {(userRole !== "member" || showCompanyPortal) && (
                    <div>
                        <div className="flex items-center gap-2 px-3 mb-2">
                            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-600">
                                Internal
                            </p>
                            <div className="flex-1 h-px bg-white/[0.05]" />
                        </div>
                        <div className="space-y-0.5">
                            {userRole !== "member" && (
                                <Link
                                    href="/admin"
                                    onClick={onClose}
                                    className="group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-400 hover:bg-white/[0.05] hover:text-slate-100 transition-all"
                                >
                                    <span className="flex items-center justify-center w-8 h-8 rounded-lg text-slate-500 group-hover:text-slate-300 group-hover:bg-white/[0.06] transition-all">
                                        <Shield className="w-[17px] h-[17px]" />
                                    </span>
                                    <span className="flex-1 truncate tracking-[-0.01em]">Admin Console</span>
                                    <ArrowUpRight className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                                </Link>
                            )}
                            {showCompanyPortal && (
                                <Link
                                    href="/company"
                                    onClick={onClose}
                                    className="group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-fuchsia-400/80 hover:bg-fuchsia-500/10 hover:text-fuchsia-300 transition-all"
                                >
                                    <span className="flex items-center justify-center w-8 h-8 rounded-lg group-hover:bg-fuchsia-500/10 transition-all">
                                        <ShieldCheck className="w-[17px] h-[17px]" />
                                    </span>
                                    <span className="flex-1 truncate tracking-[-0.01em]">Company Portal</span>
                                    <ArrowUpRight className="w-3.5 h-3.5 shrink-0" />
                                </Link>
                            )}
                        </div>
                    </div>
                )}
            </nav>

            {/* ── Footer ───────────────────────────────────────────────── */}
            <div className="border-t border-white/[0.07] p-3 space-y-1 shrink-0">

                {/* User identity row */}
                <div className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-white/[0.04] transition-colors cursor-default">
                    <div className="h-8 w-8 rounded-full bg-gradient-to-br from-sky-500 to-emerald-500 flex items-center justify-center text-[12px] font-bold text-white shrink-0 shadow-md shadow-sky-500/25 ring-2 ring-white/10">
                        {initials}
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold text-slate-200 truncate leading-snug">
                            {userName}
                        </p>
                        <p className="text-[11px] text-slate-500 truncate leading-snug">
                            {roleLabel}
                        </p>
                    </div>
                    {/* Theme toggle */}
                    <button
                        onClick={toggle}
                        aria-label="Toggle theme"
                        title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
                        className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:text-slate-300 hover:bg-white/[0.08] transition-colors"
                    >
                        {theme === "dark"
                            ? <Sun className="w-[15px] h-[15px]" />
                            : <Moon className="w-[15px] h-[15px]" />}
                    </button>
                </div>

                {/* Sign out */}
                <button
                    onClick={() => void handleLogout()}
                    className="w-full flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium text-slate-500 hover:bg-rose-500/10 hover:text-rose-400 transition-all group"
                >
                    <span className="flex items-center justify-center w-8 h-8 rounded-lg group-hover:bg-rose-500/10 transition-all">
                        <LogOut className="w-[15px] h-[15px]" />
                    </span>
                    <span className="tracking-[-0.01em]">Sign out</span>
                </button>
            </div>
        </aside>
    );
}

// ── Root export (handles mobile drawer + desktop static) ──────────────────────

export default function AppSidebar({
    userName,
    userRole,
    showCompanyPortal,
    badges,
}: {
    userName: string;
    userRole: SidebarUserRole;
    showCompanyPortal?: boolean;
    badges: BadgeCounts;
}) {
    const [open, setOpen] = useState(false);

    return (
        <>
            {/* Mobile toggle button */}
            <button
                onClick={() => setOpen(true)}
                className="md:hidden fixed top-3.5 left-3.5 z-40 p-2 bg-[#0d1117] border border-white/10 rounded-lg shadow-lg"
                aria-label="Open navigation"
            >
                <Menu className="w-4 h-4 text-slate-400" />
            </button>

            {/* Mobile backdrop */}
            {open && (
                <div
                    className="md:hidden fixed inset-0 z-40 bg-black/70 backdrop-blur-sm"
                    onClick={() => setOpen(false)}
                />
            )}

            {/* Mobile drawer */}
            <div
                className={`md:hidden fixed inset-y-0 left-0 z-50 transition-transform duration-200 ease-out ${
                    open ? "translate-x-0" : "-translate-x-full"
                }`}
            >
                <SidebarContent
                    userName={userName}
                    userRole={userRole}
                    showCompanyPortal={showCompanyPortal}
                    badges={badges}
                    onClose={() => setOpen(false)}
                />
            </div>

            {/* Desktop — always visible */}
            <div className="hidden md:flex flex-col min-h-screen shrink-0">
                <SidebarContent
                    userName={userName}
                    userRole={userRole}
                    showCompanyPortal={showCompanyPortal}
                    badges={badges}
                />
            </div>
        </>
    );
}
