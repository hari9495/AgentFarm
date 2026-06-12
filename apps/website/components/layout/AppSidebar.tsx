"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
    Activity,
    ArrowUpRight,
    ClipboardList,
    BarChart3,
    Bell,
    Bot,
    ClipboardCheck,
    CreditCard,
    Cpu,
    FileArchive,
    KeyRound,
    Layers,
    LayoutDashboard,
    LifeBuoy,
    Link2,
    ListTodo,
    Lock,
    LogOut,
    Menu,
    Moon,
    Rocket,
    Search,
    Settings,
    Shield,
    ShieldAlert,
    ShieldCheck,
    Sun,
    Radio,
    ArrowDownToLine,
    UsersRound,
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
            { href: "/dashboard/tasks",        label: "Tasks",         icon: ListTodo },
            { href: "/dashboard/approvals",    label: "Approvals",     icon: ClipboardCheck, badge: "approvals" },
        ],
    },
    {
        label: "Operations",
        items: [
            { href: "/dashboard/deployments",  label: "Deployments",   icon: Rocket },
            { href: "/dashboard/bots",         label: "Bot Status",    icon: Radio },
            { href: "/admin/bots",             label: "Manage Bots",   icon: Bot },
            { href: "/dashboard/activity",     label: "Activity",      icon: Activity },
            { href: "/dashboard/audit",        label: "Audit Log",     icon: ClipboardList },
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
            { href: "/dashboard/team",          label: "Team",          icon: UsersRound },
            { href: "/dashboard/roles",         label: "Roles & Permissions", icon: Lock },
            { href: "/dashboard/billing",       label: "Billing",       icon: CreditCard },
            { href: "/dashboard/security",      label: "Security",      icon: ShieldAlert },
            { href: "/dashboard/security/api-keys", label: "API Keys",  icon: KeyRound },
            { href: "/dashboard/support",       label: "Support",       icon: LifeBuoy },
            { href: "/dashboard/notifications", label: "Notifications", icon: Bell, badge: "notifications" },
            { href: "/dashboard/settings",      label: "Settings",      icon: Settings },
        ],
    },
];

// ── Types ─────────────────────────────────────────────────────────────────────

type BadgeCounts  = { approvals: number; notifications: number };
type SidebarUserRole = "superadmin" | "admin" | "member" | "owner";

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
                    ? "bg-sky-50 text-sky-700"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }
            `}
        >
            {/* Left accent bar */}
            {active && (
                <span className="absolute left-0 inset-y-[6px] w-[3px] rounded-r-full bg-sky-500" />
            )}

            {/* Icon container */}
            <span className={`
                flex items-center justify-center w-8 h-8 rounded-lg shrink-0 transition-all duration-150
                ${active
                    ? "bg-sky-100 text-sky-600"
                    : "text-slate-400 group-hover:text-slate-600 group-hover:bg-slate-200/70"
                }
            `}>
                <Icon className="w-[17px] h-[17px]" />
            </span>

            <span className="flex-1 truncate tracking-[-0.01em]">{item.label}</span>

            {count > 0 && (
                <span className="inline-flex items-center justify-center min-w-[20px] h-5 rounded-full bg-rose-500 text-white text-[10px] font-bold px-1.5 shrink-0 shadow-sm shadow-rose-500/30">
                    {count > 99 ? "99+" : count}
                </span>
            )}

            {!active && !count && (
                <ChevronRight className="w-3 h-3 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
            )}
        </Link>
    );
}

// ── Sidebar content ────────────────────────────────────────────────────────────

function SidebarContent({
    userName,
    userRole,
    tenantId,
    showCompanyPortal,
    badges,
    onClose,
}: {
    userName: string;
    userRole: SidebarUserRole;
    tenantId?: string;
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
        : userRole === "owner"    ? "Owner"
        : userRole === "admin"    ? "Admin"
        : "Member";

    const handleLogout = async () => {
        await fetch("/api/portal/auth/logout", { method: "POST", credentials: "include" });
        router.push("/login");
    };

    const openSearch = () => {
        window.dispatchEvent(
            new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true }),
        );
    };

    return (
        <aside style={{ width: 260 }} className="flex flex-col h-full bg-white border-r border-slate-200 shrink-0">

            {/* CommandPalette listener — renders nothing visible */}
            <CommandPalette />

            {/* ── Logo row ─────────────────────────────────────────────── */}
            <div className="flex items-center gap-3 px-4 py-5 border-b border-slate-200 shrink-0">
                <Link
                    href="/"
                    onClick={onClose}
                    className="flex items-center gap-3 group flex-1 min-w-0"
                >
                    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 via-blue-600 to-emerald-500 shadow-md shadow-sky-500/20">
                        <Bot className="w-4 h-4 text-white" />
                    </span>
                    <div className="min-w-0">
                        <span className="block text-[15px] font-bold text-slate-900 tracking-tight group-hover:text-sky-600 transition-colors truncate leading-tight">
                            AgentFarms
                        </span>
                        <span className="block text-[10px] text-slate-400 uppercase tracking-widest font-semibold leading-tight mt-0.5">
                            Dashboard
                        </span>
                    </div>
                </Link>
                {onClose && (
                    <button
                        onClick={onClose}
                        className="shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors md:hidden"
                    >
                        <X className="w-4 h-4" />
                    </button>
                )}
            </div>

            {/* ── Search bar ───────────────────────────────────────────── */}
            <div className="px-3 pt-4 pb-2">
                <button
                    onClick={openSearch}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-slate-50 border border-slate-200 text-[13px] text-slate-400 hover:bg-slate-100 hover:text-slate-600 hover:border-slate-300 transition-all group"
                >
                    <Search className="w-4 h-4 shrink-0 group-hover:text-slate-600 transition-colors" />
                    <span className="flex-1 text-left">Search…</span>
                    <kbd className="text-[10px] font-mono bg-white text-slate-400 px-1.5 py-0.5 rounded-md border border-slate-200">⌘K</kbd>
                </button>
            </div>

            {/* ── Nav groups ───────────────────────────────────────────── */}
            <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-5 scrollbar-none">
                {dashboardGroups.map((group) => (
                    <div key={group.label}>
                        {/* Section header */}
                        <div className="flex items-center gap-2 px-3 mb-2">
                            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">
                                {group.label}
                            </p>
                            <div className="flex-1 h-px bg-slate-200" />
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

                {/* Internal links (admin / company portal) — staff only.
                    Customer owners/admins manage their org from the ACCOUNT
                    group; the Admin Console is platform-staff tooling. */}
                {(userRole === "superadmin" || showCompanyPortal) && (
                    <div>
                        <div className="flex items-center gap-2 px-3 mb-2">
                            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">
                                Internal
                            </p>
                            <div className="flex-1 h-px bg-slate-200" />
                        </div>
                        <div className="space-y-0.5">
                            {userRole === "superadmin" && (
                                <>
                                    <Link
                                        href="/admin"
                                        onClick={onClose}
                                        className="group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-all"
                                    >
                                        <span className="flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 group-hover:text-slate-600 group-hover:bg-slate-200/70 transition-all">
                                            <Shield className="w-[17px] h-[17px]" />
                                        </span>
                                        <span className="flex-1 truncate tracking-[-0.01em]">Admin Console</span>
                                        <ArrowUpRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                    </Link>
                                    <Link
                                        href="/admin/bots"
                                        onClick={onClose}
                                        className="group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-all"
                                    >
                                        <span className="flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 group-hover:text-slate-600 group-hover:bg-slate-200/70 transition-all">
                                            <Bot className="w-[17px] h-[17px]" />
                                        </span>
                                        <span className="flex-1 truncate tracking-[-0.01em]">Manage Bots</span>
                                        <ArrowUpRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                    </Link>
                                </>
                            )}
                            {showCompanyPortal && (
                                <Link
                                    href="/company"
                                    onClick={onClose}
                                    className="group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-fuchsia-600 hover:bg-fuchsia-50 hover:text-fuchsia-700 transition-all"
                                >
                                    <span className="flex items-center justify-center w-8 h-8 rounded-lg text-fuchsia-500 group-hover:bg-fuchsia-100 transition-all">
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
            <div className="border-t border-slate-200 p-3 space-y-1 shrink-0">

                {/* User identity row */}
                <div className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-slate-50 transition-colors cursor-default">
                    <div className="h-8 w-8 rounded-full bg-gradient-to-br from-sky-500 to-emerald-500 flex items-center justify-center text-[12px] font-bold text-white shrink-0 shadow-sm shadow-sky-500/20 ring-2 ring-slate-200">
                        {initials}
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold text-slate-800 truncate leading-snug">
                            {userName}
                        </p>
                        <p className="text-[11px] text-slate-400 truncate leading-snug">
                            {tenantId ? tenantId : roleLabel}
                        </p>
                    </div>
                    {/* Theme toggle */}
                    <button
                        onClick={toggle}
                        aria-label="Toggle theme"
                        title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
                        className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                    >
                        {theme === "dark"
                            ? <Sun className="w-[15px] h-[15px]" />
                            : <Moon className="w-[15px] h-[15px]" />}
                    </button>
                </div>

                {/* Sign out */}
                <button
                    onClick={() => void handleLogout()}
                    className="w-full flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium text-slate-500 hover:bg-rose-50 hover:text-rose-600 transition-all group"
                >
                    <span className="flex items-center justify-center w-8 h-8 rounded-lg group-hover:bg-rose-100 transition-all">
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
    tenantId,
    showCompanyPortal,
    badges,
}: {
    userName: string;
    userRole: SidebarUserRole;
    tenantId?: string;
    showCompanyPortal?: boolean;
    badges: BadgeCounts;
}) {
    const [open, setOpen] = useState(false);

    return (
        <>
            {/* Mobile toggle button */}
            <button
                onClick={() => setOpen(true)}
                className="md:hidden fixed top-3.5 left-3.5 z-40 p-2 bg-white border border-slate-200 rounded-lg shadow-sm"
                aria-label="Open navigation"
            >
                <Menu className="w-4 h-4 text-slate-500" />
            </button>

            {/* Mobile backdrop */}
            {open && (
                <div
                    className="md:hidden fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
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
                    tenantId={tenantId}
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
                    tenantId={tenantId}
                    showCompanyPortal={showCompanyPortal}
                    badges={badges}
                />
            </div>
        </>
    );
}
