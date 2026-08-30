"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect, useRef, useCallback } from "react";
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
    PanelLeftClose,
    PanelLeftOpen,
    type LucideIcon,
} from "lucide-react";

// ── Collapse + resize state (persisted) ────────────────────────────────────────
const SIDEBAR_MIN = 208;
const SIDEBAR_MAX = 420;
const SIDEBAR_DEFAULT = 260;
const RAIL_WIDTH = 68;
const LS_COLLAPSED = "af_sidebar_collapsed";
const LS_WIDTH = "af_sidebar_width";

function useSidebarState() {
    const [collapsed, setCollapsed] = useState(false);
    const [width, setWidth] = useState(SIDEBAR_DEFAULT);
    const [ready, setReady] = useState(false);

    useEffect(() => {
        try {
            const c = localStorage.getItem(LS_COLLAPSED);
            const w = Number(localStorage.getItem(LS_WIDTH));
            if (c === "1") setCollapsed(true);
            if (w >= SIDEBAR_MIN && w <= SIDEBAR_MAX) setWidth(w);
        } catch { /* private mode / SSR */ }
        setReady(true);
    }, []);

    const toggle = useCallback(() => {
        setCollapsed((prev) => {
            const next = !prev;
            try { localStorage.setItem(LS_COLLAPSED, next ? "1" : "0"); } catch { /* noop */ }
            return next;
        });
    }, []);

    const persistWidth = useCallback((w: number) => {
        const clamped = Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, w));
        setWidth(clamped);
        try { localStorage.setItem(LS_WIDTH, String(clamped)); } catch { /* noop */ }
    }, []);

    // Until ready (post-hydration) expose the SSR defaults so the first client
    // render matches the server; the persisted collapse/width apply after.
    return {
        collapsed: ready ? collapsed : false,
        width: ready ? width : SIDEBAR_DEFAULT,
        ready,
        toggle,
        setWidth,
        persistWidth,
    };
}
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
            { href: "/dashboard/traces",       label: "LLM Traces",    icon: Activity },
            { href: "/dashboard/evidence",     label: "Evidence",      icon: FileArchive },
            { href: "/dashboard/reports",      label: "Reports",       icon: BarChart3 },
        ],
    },
    {
        label: "Configure",
        items: [
            { href: "/dashboard/integrations", label: "Integrations",  icon: Link2 },
            { href: "/dashboard/webhooks",     label: "Webhooks",      icon: ArrowDownToLine },
            { href: "/dashboard/task-sources", label: "Task Sources",  icon: ListTodo },
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
    collapsed,
}: {
    item: NavItem;
    badges: BadgeCounts;
    onClick?: () => void;
    collapsed?: boolean;
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
            title={collapsed ? item.label : undefined}
            className={`
                group relative flex items-center gap-3 rounded-[3px] py-2.5 text-sm
                font-medium transition-all duration-150 select-none
                ${collapsed ? "justify-center px-0" : "px-3"}
                ${active
                    ? "bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-[color:var(--accent)]"
                    : "text-[color:var(--ink-soft)] hover:bg-[var(--bg-deep)] hover:text-[color:var(--ink)]"
                }
            `}
        >
            {/* Left accent bar */}
            {active && (
                <span className="absolute left-0 inset-y-[6px] w-[3px] rounded-r-full bg-[var(--accent)]" />
            )}

            {/* Icon container */}
            <span className={`
                relative flex items-center justify-center w-8 h-8 rounded-[3px] shrink-0 transition-all duration-150
                ${active
                    ? "bg-[color-mix(in_srgb,var(--accent)_16%,transparent)] text-[color:var(--accent)]"
                    : "text-[color:var(--ink-muted)] group-hover:text-[color:var(--ink-soft)] group-hover:bg-[var(--line)]/70"
                }
            `}>
                <Icon className="w-[17px] h-[17px]" />
                {/* Collapsed: badge as a dot on the icon */}
                {collapsed && count > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-[var(--danger)] ring-2 ring-[color:var(--card)]" />
                )}
            </span>

            {!collapsed && (
                <span className="flex-1 truncate tracking-[-0.01em]">{item.label}</span>
            )}

            {!collapsed && count > 0 && (
                <span className="inline-flex items-center justify-center min-w-[20px] h-5 rounded-full bg-[var(--danger)] text-white text-[10px] font-bold px-1.5 shrink-0 shadow-sm ">
                    {count > 99 ? "99+" : count}
                </span>
            )}

            {!collapsed && !active && !count && (
                <ChevronRight className="w-3 h-3 text-[color:var(--ink-muted)] opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
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
    collapsed = false,
    width = SIDEBAR_DEFAULT,
    onToggleCollapse,
}: {
    userName: string;
    userRole: SidebarUserRole;
    tenantId?: string;
    showCompanyPortal?: boolean;
    badges: BadgeCounts;
    onClose?: () => void;
    collapsed?: boolean;
    width?: number;
    onToggleCollapse?: () => void;
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
        <aside style={{ width: collapsed ? RAIL_WIDTH : width }} className="flex flex-col h-full bg-[var(--card)] border-r border-[color:var(--line)] shrink-0 transition-[width] duration-150 ease-out">

            {/* CommandPalette listener — renders nothing visible */}
            <CommandPalette />

            {/* ── Logo row — when collapsed, the expand toggle takes the top
                line (same row as expanded) so it's easy to find. ─────────── */}
            <div className={`flex items-center gap-2 py-5 border-b border-[color:var(--line)] shrink-0 ${collapsed ? "justify-center px-2" : "px-4"}`}>
                {!collapsed && (
                    <Link
                        href="/"
                        onClick={onClose}
                        className="flex items-center gap-3 group min-w-0 flex-1"
                    >
                        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[3px] bg-[var(--accent)] shadow-md shadow-blue-600/20">
                            <svg width="16" height="16" viewBox="0 0 12 12" fill="none" aria-hidden>
                                <circle cx="6" cy="6" r="5" stroke="white" strokeWidth="1.5" />
                                <path d="M4 6h4M6 4v4" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
                            </svg>
                        </span>
                        <div className="min-w-0">
                            <span className="block text-[15px] font-bold text-[color:var(--ink)] tracking-tight group-hover:text-[color:var(--accent)] transition-colors truncate leading-tight">
                                AgentFarms
                            </span>
                            <span className="block text-[10px] text-[color:var(--ink-muted)] uppercase tracking-widest font-semibold leading-tight mt-0.5">
                                Dashboard
                            </span>
                        </div>
                    </Link>
                )}
                {/* Desktop collapse/expand toggle */}
                {onToggleCollapse && (
                    <button
                        onClick={onToggleCollapse}
                        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                        className="hidden md:inline-flex shrink-0 p-1.5 rounded-[3px] text-[color:var(--ink-muted)] hover:text-[color:var(--ink-soft)] hover:bg-[var(--bg-deep)] transition-colors"
                    >
                        {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
                    </button>
                )}
                {onClose && (
                    <button
                        onClick={onClose}
                        className="shrink-0 p-1.5 rounded-[3px] text-[color:var(--ink-muted)] hover:text-[color:var(--ink-soft)] hover:bg-[var(--bg-deep)] transition-colors md:hidden"
                    >
                        <X className="w-4 h-4" />
                    </button>
                )}
            </div>

            {/* ── Search bar ───────────────────────────────────────────── */}
            <div className={collapsed ? "px-2 pt-4 pb-2" : "px-3 pt-4 pb-2"}>
                <button
                    onClick={openSearch}
                    title={collapsed ? "Search (⌘K)" : undefined}
                    className={`w-full flex items-center rounded-[3px] bg-[var(--bg-deep)] border border-[color:var(--line)] text-[13px] text-[color:var(--ink-muted)] hover:bg-[var(--bg-deep)] hover:text-[color:var(--ink-soft)] hover:border-[color:var(--line-strong)] transition-all group ${collapsed ? "justify-center py-2.5" : "gap-2.5 px-3 py-2.5"}`}
                >
                    <Search className="w-4 h-4 shrink-0 group-hover:text-[color:var(--ink-soft)] transition-colors" />
                    {!collapsed && <span className="flex-1 text-left">Search…</span>}
                    {!collapsed && <kbd className="text-[10px] font-mono bg-[var(--card)] text-[color:var(--ink-muted)] px-1.5 py-0.5 rounded-[3px] border border-[color:var(--line)]">⌘K</kbd>}
                </button>
            </div>

            {/* ── Nav groups ───────────────────────────────────────────── */}
            <nav className={`flex-1 overflow-y-auto py-2 space-y-5 scrollbar-none ${collapsed ? "px-2" : "px-3"}`}>
                {dashboardGroups.map((group) => (
                    <div key={group.label}>
                        {/* Section header */}
                        {collapsed ? (
                            <div className="h-px bg-[var(--line)] mx-2 mb-2" />
                        ) : (
                            <div className="flex items-center gap-2 px-3 mb-2">
                                <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[color:var(--ink-muted)]">
                                    {group.label}
                                </p>
                                <div className="flex-1 h-px bg-[var(--line)]" />
                            </div>
                        )}
                        <div className="space-y-0.5">
                            {group.items.map((item) => (
                                <NavLink
                                    key={item.href}
                                    item={item}
                                    badges={badges}
                                    onClick={onClose}
                                    collapsed={collapsed}
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
                        {collapsed ? (
                            <div className="h-px bg-[var(--line)] mx-2 mb-2" />
                        ) : (
                            <div className="flex items-center gap-2 px-3 mb-2">
                                <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[color:var(--ink-muted)]">
                                    Internal
                                </p>
                                <div className="flex-1 h-px bg-[var(--line)]" />
                            </div>
                        )}
                        <div className="space-y-0.5">
                            {userRole === "superadmin" && (
                                <>
                                    <Link
                                        href="/admin"
                                        onClick={onClose}
                                        title={collapsed ? "Admin Console" : undefined}
                                        className={`group flex items-center gap-3 rounded-[3px] py-2.5 text-sm font-medium text-[color:var(--ink-soft)] hover:bg-[var(--bg-deep)] hover:text-[color:var(--ink)] transition-all ${collapsed ? "justify-center px-0" : "px-3"}`}
                                    >
                                        <span className="flex items-center justify-center w-8 h-8 rounded-[3px] text-[color:var(--ink-muted)] group-hover:text-[color:var(--ink-soft)] group-hover:bg-[var(--line)]/70 transition-all">
                                            <Shield className="w-[17px] h-[17px]" />
                                        </span>
                                        {!collapsed && <span className="flex-1 truncate tracking-[-0.01em]">Admin Console</span>}
                                        {!collapsed && <ArrowUpRight className="w-3.5 h-3.5 text-[color:var(--ink-muted)] shrink-0" />}
                                    </Link>
                                    <Link
                                        href="/admin/bots"
                                        onClick={onClose}
                                        title={collapsed ? "Manage Bots" : undefined}
                                        className={`group flex items-center gap-3 rounded-[3px] py-2.5 text-sm font-medium text-[color:var(--ink-soft)] hover:bg-[var(--bg-deep)] hover:text-[color:var(--ink)] transition-all ${collapsed ? "justify-center px-0" : "px-3"}`}
                                    >
                                        <span className="flex items-center justify-center w-8 h-8 rounded-[3px] text-[color:var(--ink-muted)] group-hover:text-[color:var(--ink-soft)] group-hover:bg-[var(--line)]/70 transition-all">
                                            <Bot className="w-[17px] h-[17px]" />
                                        </span>
                                        {!collapsed && <span className="flex-1 truncate tracking-[-0.01em]">Manage Bots</span>}
                                        {!collapsed && <ArrowUpRight className="w-3.5 h-3.5 text-[color:var(--ink-muted)] shrink-0" />}
                                    </Link>
                                </>
                            )}
                            {showCompanyPortal && (
                                <Link
                                    href="/company"
                                    onClick={onClose}
                                    title={collapsed ? "Company Portal" : undefined}
                                    className={`group flex items-center gap-3 rounded-[3px] py-2.5 text-sm font-medium text-[color:var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] hover:text-[color:var(--accent)] transition-all ${collapsed ? "justify-center px-0" : "px-3"}`}
                                >
                                    <span className="flex items-center justify-center w-8 h-8 rounded-[3px] text-[color:var(--accent)] group-hover:bg-[color-mix(in_srgb,var(--accent)_16%,transparent)] transition-all">
                                        <ShieldCheck className="w-[17px] h-[17px]" />
                                    </span>
                                    {!collapsed && <span className="flex-1 truncate tracking-[-0.01em]">Company Portal</span>}
                                    {!collapsed && <ArrowUpRight className="w-3.5 h-3.5 shrink-0" />}
                                </Link>
                            )}
                        </div>
                    </div>
                )}
            </nav>

            {/* ── Footer ───────────────────────────────────────────────── */}
            <div className={`border-t border-[color:var(--line)] space-y-1 shrink-0 ${collapsed ? "p-2 flex flex-col items-center" : "p-3"}`}>

                {/* User identity row */}
                <div className={`flex items-center rounded-[3px] hover:bg-[var(--bg-deep)] transition-colors cursor-default ${collapsed ? "justify-center p-1.5" : "gap-3 px-2 py-2 w-full"}`} title={collapsed ? `${userName} · ${tenantId ? tenantId : roleLabel}` : undefined}>
                    <div className="h-8 w-8 rounded-full bg-[var(--accent)] flex items-center justify-center text-[12px] font-bold text-white shrink-0 shadow-sm shadow-blue-600/20 ring-2 ring-[color:var(--line)]">
                        {initials}
                    </div>
                    {!collapsed && (
                        <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-semibold text-[color:var(--ink)] truncate leading-snug">
                                {userName}
                            </p>
                            <p className="text-[11px] text-[color:var(--ink-muted)] truncate leading-snug">
                                {tenantId ? tenantId : roleLabel}
                            </p>
                        </div>
                    )}
                    {/* Theme toggle */}
                    {!collapsed && (
                        <button
                            onClick={toggle}
                            aria-label="Toggle theme"
                            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
                            className="shrink-0 w-8 h-8 rounded-[3px] flex items-center justify-center text-[color:var(--ink-muted)] hover:text-[color:var(--ink-soft)] hover:bg-[var(--bg-deep)] transition-colors"
                        >
                            {theme === "dark"
                                ? <Sun className="w-[15px] h-[15px]" />
                                : <Moon className="w-[15px] h-[15px]" />}
                        </button>
                    )}
                </div>

                {/* Theme toggle (collapsed — own row) */}
                {collapsed && (
                    <button
                        onClick={toggle}
                        aria-label="Toggle theme"
                        title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
                        className="w-8 h-8 rounded-[3px] flex items-center justify-center text-[color:var(--ink-muted)] hover:text-[color:var(--ink-soft)] hover:bg-[var(--bg-deep)] transition-colors"
                    >
                        {theme === "dark" ? <Sun className="w-[15px] h-[15px]" /> : <Moon className="w-[15px] h-[15px]" />}
                    </button>
                )}

                {/* Sign out */}
                <button
                    onClick={() => void handleLogout()}
                    title={collapsed ? "Sign out" : undefined}
                    className={`flex items-center rounded-[3px] text-[13px] font-medium text-[color:var(--ink-muted)] hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] hover:text-[color:var(--danger)] transition-all group ${collapsed ? "justify-center w-8 h-8" : "w-full gap-3 px-3 py-2"}`}
                >
                    <span className={`flex items-center justify-center rounded-[3px] group-hover:bg-[color-mix(in_srgb,var(--danger)_16%,transparent)] transition-all ${collapsed ? "w-8 h-8" : "w-8 h-8"}`}>
                        <LogOut className="w-[15px] h-[15px]" />
                    </span>
                    {!collapsed && <span className="tracking-[-0.01em]">Sign out</span>}
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
    const { collapsed, width, toggle, setWidth, persistWidth } = useSidebarState();
    const [dragging, setDragging] = useState(false);
    const asideRef = useRef<HTMLDivElement>(null);

    // Drag-to-resize the desktop sidebar (expanded only).
    const startResize = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        const left = asideRef.current?.getBoundingClientRect().left ?? 0;
        setDragging(true);
        const onMove = (ev: MouseEvent) => setWidth(Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, ev.clientX - left)));
        const onUp = (ev: MouseEvent) => {
            document.removeEventListener("mousemove", onMove);
            document.removeEventListener("mouseup", onUp);
            document.body.style.userSelect = "";
            document.body.style.cursor = "";
            setDragging(false);
            persistWidth(ev.clientX - left);
        };
        document.body.style.userSelect = "none";
        document.body.style.cursor = "col-resize";
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
    }, [setWidth, persistWidth]);

    return (
        <>
            {/* Mobile toggle button */}
            <button
                onClick={() => setOpen(true)}
                className="md:hidden fixed top-3.5 left-3.5 z-40 p-2 bg-[var(--card)] border border-[color:var(--line)] rounded-[3px] shadow-sm"
                aria-label="Open navigation"
            >
                <Menu className="w-4 h-4 text-[color:var(--ink-muted)]" />
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

            {/* Desktop — always visible; collapsible + resizable */}
            <div ref={asideRef} className="hidden md:flex flex-col min-h-screen shrink-0 relative">
                <SidebarContent
                    userName={userName}
                    userRole={userRole}
                    tenantId={tenantId}
                    showCompanyPortal={showCompanyPortal}
                    badges={badges}
                    collapsed={collapsed}
                    width={width}
                    onToggleCollapse={toggle}
                />
                {/* Resize handle (expanded only) */}
                {!collapsed && (
                    <div
                        onMouseDown={startResize}
                        onDoubleClick={() => persistWidth(SIDEBAR_DEFAULT)}
                        title="Drag to resize · double-click to reset"
                        className="absolute top-0 right-0 h-full w-2.5 cursor-col-resize z-20 group flex justify-end"
                    >
                        <div className={`h-full w-0.5 transition-colors ${dragging ? "bg-[var(--accent)]" : "bg-transparent group-hover:bg-[var(--accent)]"}`} />
                    </div>
                )}
            </div>
        </>
    );
}
