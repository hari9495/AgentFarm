'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
    Cpu, Brain, ShoppingBag, LayoutDashboard, ClipboardCheck,
    Activity, FileText, Store, Search, LogOut, Settings,
    ChevronDown, Bot, ListChecks, ShieldCheck, Link2,
    BarChart2, CreditCard, Wrench, TrendingUp, Video,
    MessageSquare, DollarSign, PieChart, LineChart, Trophy, Bell, CalendarClock,
    ScrollText, Film, Waves, Lock,
    type LucideIcon,
} from 'lucide-react';
import type { DashboardTab } from './dashboard-navigation';
import { getDashboardTabStorageKey } from './dashboard-tab-storage';

type NavItemDef = {
    key: DashboardTab;
    label: string;
    icon: LucideIcon;
};

const navItems: NavItemDef[] = [
    { key: 'overview', label: 'Overview', icon: LayoutDashboard },
    { key: 'approvals', label: 'Approvals', icon: ClipboardCheck },
    { key: 'observability', label: 'Observability', icon: Activity },
    { key: 'audit', label: 'Evidence', icon: FileText },
    { key: 'marketplace', label: 'Skill Marketplace', icon: Store },
];

type WorkspaceOption = {
    workspaceId: string;
    workspaceName: string;
};

type InternalSidebarProps = {
    activeTab: DashboardTab;
    workspaceId: string;
    workspaceName: string;
    workspaces: WorkspaceOption[];
    pendingCount?: number;
    auditUnlocked?: boolean;
};

function NavItem({
    def,
    active,
    pendingCount,
    onClick,
}: {
    def: NavItemDef;
    active: boolean;
    pendingCount?: number;
    onClick: () => void;
}) {
    const Icon = def.icon;
    return (
        <button
            type="button"
            onClick={onClick}
            aria-current={active ? 'page' : undefined}
            className={[
                'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-left',
                active
                    ? 'font-semibold'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
            ].join(' ')}
            style={active ? { background: 'rgba(0,102,204,0.07)', color: '#0066cc' } : {}}
        >
            <span
                className={[
                    'inline-flex h-7 w-7 items-center justify-center rounded-lg shrink-0',
                    active ? '' : 'bg-slate-100',
                ].join(' ')}
                style={active ? { background: 'rgba(0,102,204,0.12)' } : {}}
            >
                <Icon
                    className={['w-3.5 h-3.5', active ? '' : 'text-slate-500'].join(' ')}
                    style={active ? { color: '#0066cc' } : {}}
                    aria-hidden="true"
                />
            </span>
            <span className="flex-1">{def.label}</span>
            {def.key === 'approvals' && pendingCount != null && pendingCount > 0 && (
                <span
                    aria-label={`${pendingCount} pending`}
                    className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-rose-500 text-white text-[9px] font-bold shrink-0"
                >
                    {pendingCount}
                </span>
            )}
        </button>
    );
}

export function InternalSidebar({
    activeTab,
    workspaceId,
    workspaceName,
    workspaces,
    pendingCount = 0,
    auditUnlocked = true,
}: InternalSidebarProps) {
    const router = useRouter();
    const searchParams = useSearchParams();

    const handleTabSelect = (tab: DashboardTab) => {
        window.localStorage.setItem(getDashboardTabStorageKey(workspaceId), tab);
        const params = new URLSearchParams(searchParams.toString());
        params.set('tab', tab);
        if (workspaceId) params.set('workspaceId', workspaceId);
        router.push(`/?${params.toString()}`);
    };

    const handleWorkspaceChange = (newWorkspaceId: string) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set('workspaceId', newWorkspaceId);
        router.push(`/?${params.toString()}`);
    };

    const handleSearchKey = () => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
    };

    return (
        <div className="flex flex-col h-screen sticky top-0 bg-white border-r border-slate-200 overflow-hidden">
            {/* Logo */}
            <div className="flex items-center gap-2.5 px-4 h-14 border-b border-slate-200 shrink-0">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg shadow-sm shrink-0" style={{ background: '#0066cc' }}>
                    <Cpu className="w-3.5 h-3.5 text-white" aria-hidden="true" />
                </span>
                <span className="text-sm font-bold tracking-tight text-slate-900">AgentFarms Ops</span>
            </div>

            {/* Nav */}
            <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5 sidebar-scroll">
                {/* ⌘K Search */}
                <button
                    type="button"
                    onClick={handleSearchKey}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-xs text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                >
                    <Search className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    <span className="flex-1 text-left">Search pages…</span>
                    <kbd className="inline-flex items-center text-[9px] font-mono text-slate-400">⌘K</kbd>
                </button>

                {/* Workspace switcher */}
                {workspaces.length > 1 && (
                    <div>
                        <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                            Workspace
                        </p>
                        <div className="relative">
                            <select
                                value={workspaceId}
                                onChange={(e) => handleWorkspaceChange(e.target.value)}
                                className="w-full appearance-none bg-white border border-slate-200 rounded-lg px-3 py-2 pr-8 text-xs font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-sky-400 cursor-pointer"
                            >
                                {workspaces.map((ws) => (
                                    <option key={ws.workspaceId} value={ws.workspaceId}>
                                        {ws.workspaceName}
                                    </option>
                                ))}
                            </select>
                            <ChevronDown
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none"
                                aria-hidden="true"
                            />
                        </div>
                    </div>
                )}

                {/* Navigation */}
                <div>
                    <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                        Operations
                    </p>
                    <div className="space-y-0.5">
                        {navItems.map((item) => (
                            <NavItem
                                key={item.key}
                                def={item}
                                active={activeTab === item.key}
                                pendingCount={item.key === 'approvals' ? pendingCount : undefined}
                                onClick={() => handleTabSelect(item.key)}
                            />
                        ))}
                        <Link href="/activity" className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors">
                            <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 shrink-0"><Bell className="w-3.5 h-3.5 text-slate-500" /></span>
                            <span className="flex-1">Activity</span>
                        </Link>
                    </div>
                </div>

                {/* ── Agents ───────────────────────────────────────── */}
                <div>
                    <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-400">Agents</p>
                    <div className="space-y-0.5">
                        {[{ href: '/agents', label: 'Agents', Icon: Bot },{ href: '/tasks', label: 'Tasks', Icon: ListChecks },{ href: '/devops', label: 'DevOps', Icon: Wrench },{ href: '/agent-chat', label: 'Chat', Icon: MessageSquare }].map(({ href, label, Icon }) => (
                            <Link key={href} href={href} className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors">
                                <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 shrink-0"><Icon className="w-3.5 h-3.5 text-slate-500" /></span>
                                <span className="flex-1">{label}</span>
                            </Link>
                        ))}
                    </div>
                </div>

                {/* ── Analytics ────────────────────────────────────── */}
                <div>
                    <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-400">Analytics</p>
                    <div className="space-y-0.5">
                        {[
                            { href: '/analytics', label: 'Overview', Icon: BarChart2 },
                            { href: '/cost-dashboard', label: 'Cost Dashboard', Icon: PieChart },
                            { href: '/historical-metrics', label: 'Historical Metrics', Icon: LineChart },
                            { href: '/quality-roi', label: 'Quality ROI', Icon: Trophy },
                        ].map(({ href, label, Icon }) => (
                            <Link key={href} href={href} className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors">
                                <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 shrink-0"><Icon className="w-3.5 h-3.5 text-slate-500" /></span>
                                <span className="flex-1">{label}</span>
                            </Link>
                        ))}
                    </div>
                </div>

                {/* ── Audit & Compliance ───────────────────────────── */}
                <div>
                    <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                        Audit &amp; Compliance
                        {!auditUnlocked && <Lock className="w-2.5 h-2.5 text-slate-400" />}
                    </p>
                    <div className="space-y-0.5">
                        {auditUnlocked ? (
                            [
                                { href: '/audit', label: 'Audit Log', Icon: ScrollText },
                                { href: '/audit/session-replay', label: 'Session Replay', Icon: Film },
                                { href: '/operational-signals', label: 'Op. Signals', Icon: Waves },
                            ].map(({ href, label, Icon }) => (
                                <Link key={href} href={href} className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors">
                                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 shrink-0"><Icon className="w-3.5 h-3.5 text-slate-500" /></span>
                                    <span className="flex-1">{label}</span>
                                </Link>
                            ))
                        ) : (
                            <Link
                                href="/billing"
                                className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                                style={{ color: '#94a3b8' }}
                            >
                                <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg shrink-0" style={{ background: 'rgba(148,163,184,0.1)' }}>
                                    <Lock className="w-3.5 h-3.5" style={{ color: '#94a3b8' }} />
                                </span>
                                <span className="flex-1 text-slate-400">Upgrade to unlock</span>
                                <span style={{
                                    fontSize: '0.62rem',
                                    fontWeight: 700,
                                    padding: '1px 5px',
                                    borderRadius: 4,
                                    background: 'rgba(0,102,204,0.08)',
                                    color: '#0066cc',
                                    border: '1px solid rgba(0,102,204,0.2)',
                                    whiteSpace: 'nowrap',
                                }}>
                                    Business+
                                </span>
                            </Link>
                        )}
                    </div>
                </div>

                {/* ── Platform ─────────────────────────────────────── */}
                <div>
                    <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-400">Platform</p>
                    <div className="space-y-0.5">
                        {[
                            { href: '/connectors', label: 'Connectors', Icon: Link2 },
                            { href: '/platform-mcp', label: 'Platform MCP', Icon: Cpu },
                            { href: '/skills', label: 'Skills', Icon: ShoppingBag },
                            { href: '/memory', label: 'Memory', Icon: Brain },
                            { href: '/governance', label: 'Governance', Icon: ShieldCheck },
                        ].map(({ href, label, Icon }) => (
                            <Link key={href} href={href} className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors">
                                <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 shrink-0"><Icon className="w-3.5 h-3.5 text-slate-500" /></span>
                                <span className="flex-1">{label}</span>
                            </Link>
                        ))}
                    </div>
                </div>

                {/* ── Business ─────────────────────────────────────── */}
                <div>
                    <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-400">Business</p>
                    <div className="space-y-0.5">
                        {[
                            { href: '/scheduled-reports', label: 'Scheduled Reports', Icon: CalendarClock },
                            { href: '/sales', label: 'Sales', Icon: TrendingUp },
                            { href: '/meetings', label: 'Meetings', Icon: Video },
                            { href: '/billing', label: 'Billing', Icon: CreditCard },
                            { href: '/budget', label: 'Budget', Icon: DollarSign },
                        ].map(({ href, label, Icon }) => (
                            <Link key={href} href={href} className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors">
                                <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 shrink-0"><Icon className="w-3.5 h-3.5 text-slate-500" /></span>
                                <span className="flex-1">{label}</span>
                            </Link>
                        ))}
                    </div>
                </div>

                {/* ── Admin ────────────────────────────────────────── */}
                <div>
                    <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-400">Admin</p>
                    <div className="space-y-0.5">
                        <Link href="/settings" className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors">
                            <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 shrink-0"><Settings className="w-3.5 h-3.5 text-slate-500" /></span>
                            <span className="flex-1">Settings</span>
                        </Link>
                    </div>
                </div>
            </nav>

            {/* Footer */}
            <div className="border-t border-slate-200 px-3 py-3 space-y-0.5 shrink-0">
                {/* Current workspace indicator (single workspace) */}
                {workspaces.length <= 1 && (
                    <div className="flex items-center gap-3 px-3 py-2 rounded-lg">
                        <div className="h-7 w-7 rounded-full bg-sky-100 flex items-center justify-center text-[10px] font-bold text-sky-600 shrink-0">
                            {workspaceName.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-slate-800 font-medium truncate text-xs">{workspaceName}</p>
                            <p className="text-slate-400 truncate text-[10px]">Active workspace</p>
                        </div>
                    </div>
                )}
                <Link
                    href="/login"
                    className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                >
                    <LogOut className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span>Sign out</span>
                </Link>
            </div>
        </div>
    );
}
