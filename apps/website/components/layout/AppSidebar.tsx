"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
    Bot,
    Activity,
    ClipboardCheck,
    LayoutDashboard,
    Settings,
    Link2,
    Shield,
    ShieldCheck,
    Users,
    CreditCard,
    ClipboardList,
    Menu,
    ArrowLeft,
    LogOut,
    X,
    Radio,
    Rocket,
    FileArchive,
    Bell,
    BarChart3,
    Search,
    type LucideIcon,
} from "lucide-react";
import PremiumIcon from "@/components/shared/PremiumIcon";
import ThemeToggle from "@/components/shared/ThemeToggle";
import CommandPalette from "@/components/shared/CommandPalette";

const dashboardNav = [
    { href: "/dashboard", label: "Overview", icon: LayoutDashboard, exact: true },
    { href: "/dashboard/agents", label: "Agents", icon: Bot },
    { href: "/dashboard/deployments", label: "Deployments", icon: Rocket },
    { href: "/dashboard/bots", label: "Bot Status", icon: Radio },
    { href: "/dashboard/approvals", label: "Approvals", icon: ClipboardCheck, badgeCount: 3 },
    { href: "/dashboard/evidence", label: "Evidence", icon: FileArchive },
    { href: "/dashboard/activity", label: "Activity", icon: Activity },
    { href: "/dashboard/reports", label: "Reports", icon: BarChart3 },
    { href: "/dashboard/notifications", label: "Notifications", icon: Bell, badgeCount: 3 },
    { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

const adminNav = [
    { href: "/admin", label: "Console", icon: Shield, exact: true },
    { href: "/admin/users", label: "Team & Access", icon: Users },
    { href: "/admin/bots", label: "Bot Control", icon: Bot },
    { href: "/admin/superadmin", label: "Tenant Superadmin", icon: ShieldCheck, superAdminOnly: true },
    { href: "/admin/roles", label: "Roles & Permissions", icon: ShieldCheck },
    { href: "/admin/security", label: "Security", icon: Shield },
    { href: "/admin/integrations", label: "Integrations", icon: Link2 },
    { href: "/admin/billing", label: "Billing", icon: CreditCard },
    { href: "/admin/audit", label: "Audit Log", icon: ClipboardList },
];

type SidebarSection = "dashboard" | "admin";
type SidebarUserRole = "superadmin" | "admin" | "member";

function NavItem({
    href,
    label,
    icon: Icon,
    exact,
    onClick,
    badgeCount,
}: {
    href: string;
    label: string;
    icon: LucideIcon;
    exact?: boolean;
    onClick?: () => void;
    badgeCount?: number;
}) {
    const pathname = usePathname();
    const active = exact
        ? pathname === href
        : pathname === href || pathname.startsWith(href + "/");

    return (
        <Link
            href={href}
            onClick={onClick}
            className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${active
                ? "bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 font-semibold"
                : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100"
                }`}
        >
            <PremiumIcon icon={Icon} tone={active ? "sky" : "slate"} containerClassName="h-7 w-7 rounded-lg shrink-0" iconClassName="w-3.5 h-3.5" />
            <span className="flex-1">{label}</span>
            {badgeCount && badgeCount > 0 ? (
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-rose-500 text-white text-[9px] font-bold shrink-0">
                    {badgeCount}
                </span>
            ) : null}
        </Link>
    );
}

function SidebarContent({
    section,
    userName,
    userRole,
    showCompanyPortal,
    onClose,
}: {
    section: SidebarSection;
    userName: string;
    userRole: SidebarUserRole;
    showCompanyPortal?: boolean;
    onClose?: () => void;
}) {
    const currentNav = (section === "admin" ? adminNav : dashboardNav).filter((item) => {
        if ("superAdminOnly" in item && item.superAdminOnly) {
            return userRole === "superadmin";
        }
        return true;
    });
    const navLabel = section === "admin" ? "Admin" : "Dashboard";
    const switchHref = section === "admin" ? "/dashboard" : "/admin";
    const switchLabel = section === "admin" ? "Switch to dashboard" : "Switch to admin";
    const initials = userName
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? "")
        .join("") || "U";

    return (
        <aside className="flex flex-col w-60 h-full bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800">
            {/* Logo */}
            <CommandPalette />
            <div className="flex items-center gap-2 px-4 h-14 border-b border-slate-200 dark:border-slate-800 shrink-0">
                <Link
                    href="/"
                    className="flex items-center gap-2 font-bold text-slate-900 dark:text-slate-100"
                    onClick={onClose}
                >
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 via-blue-600 to-emerald-500 shadow-sm">
                        <Bot className="w-3.5 h-3.5 text-white" />
                    </span>
                    <span className="text-sm tracking-tight">AgentFarm</span>
                </Link>
                {onClose && (
                    <button
                        onClick={onClose}
                        className="ml-auto p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 md:hidden"
                    >
                        <X className="w-4 h-4" />
                    </button>
                )}
            </div>

            {/* Nav */}
            <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
                {/* D2: ⌘K command palette trigger */}
                <button
                    onClick={() => {
                        const evt = new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true });
                        window.dispatchEvent(evt);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-xs text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                >
                    <Search className="w-3.5 h-3.5 shrink-0" />
                    <span className="flex-1 text-left">Search pages…</span>
                    <kbd className="inline-flex items-center gap-0.5 text-[9px] font-mono text-slate-400 dark:text-slate-500">⌘K</kbd>
                </button>
                <div>
                    <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                        {navLabel}
                    </p>
                    <div className="space-y-0.5">
                        {currentNav.map((item) => (
                            <NavItem key={item.href} {...item} onClick={onClose} />
                        ))}
                    </div>
                </div>
            </nav>

            {/* Footer */}
            <div className="border-t border-slate-200 dark:border-slate-800 px-3 py-3 space-y-0.5 shrink-0">
                <div className="flex items-center px-2 py-1">
                    <ThemeToggle />
                    <span className="text-xs text-slate-400 dark:text-slate-500 ml-1">Theme</span>
                </div>
                <Link
                    href="/"
                    onClick={onClose}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
                >
                    <ArrowLeft className="w-4 h-4 shrink-0" />
                    <span>Back to site</span>
                </Link>
                {userRole !== "member" ? (
                    <Link
                        href={switchHref}
                        onClick={onClose}
                        className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
                    >
                        <Shield className="w-4 h-4 shrink-0" />
                        <span>{switchLabel}</span>
                    </Link>
                ) : null}
                {showCompanyPortal ? (
                    <Link
                        href="/company"
                        onClick={onClose}
                        className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-fuchsia-600 dark:text-fuchsia-300 hover:bg-fuchsia-50 dark:hover:bg-fuchsia-900/20 transition-colors"
                    >
                        <ShieldCheck className="w-4 h-4 shrink-0" />
                        <span>Company Portal</span>
                    </Link>
                ) : null}
                <div className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm">
                    <div className="h-7 w-7 rounded-full bg-sky-100 dark:bg-sky-900/50 flex items-center justify-center text-[10px] font-bold text-sky-700 dark:text-sky-300 shrink-0">
                        {initials}
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-slate-700 dark:text-slate-300 font-medium truncate text-xs">{userName}</p>
                        <p className="text-slate-400 dark:text-slate-500 truncate text-[10px]">{userRole === "superadmin" ? "Super Admin" : userRole === "admin" ? "Org Admin" : "Member"}</p>
                    </div>
                    <LogOut className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 shrink-0" />
                </div>
            </div>
        </aside>
    );
}

export default function AppSidebar({
    section,
    userName,
    userRole,
    showCompanyPortal,
}: {
    section: SidebarSection;
    userName: string;
    userRole: SidebarUserRole;
    showCompanyPortal?: boolean;
}) {
    const [open, setOpen] = useState(false);

    return (
        <>
            {/* Mobile toggle button */}
            <button
                onClick={() => setOpen(true)}
                className="md:hidden fixed top-3.5 left-3.5 z-40 p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-sm"
                aria-label="Open navigation"
            >
                <Menu className="w-4 h-4 text-slate-600 dark:text-slate-300" />
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
                className={`md:hidden fixed inset-y-0 left-0 z-50 transition-transform duration-200 ${open ? "translate-x-0" : "-translate-x-full"
                    }`}
            >
                <SidebarContent section={section} userName={userName} userRole={userRole} showCompanyPortal={showCompanyPortal} onClose={() => setOpen(false)} />
            </div>

            {/* Desktop sidebar — always visible */}
            <div className="hidden md:flex flex-col w-60 min-h-screen shrink-0">
                <SidebarContent section={section} userName={userName} userRole={userRole} showCompanyPortal={showCompanyPortal} />
            </div>
        </>
    );
}
