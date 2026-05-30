'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
    Cpu,
    Brain,
    ShoppingBag,
    LayoutDashboard,
    ClipboardCheck,
    Activity,
    FileText,
    Store,
    Search,
    LogOut,
    Settings,
    ChevronDown,
    Bot,
    ListChecks,
    ShieldCheck,
    Link2,
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
    { key: 'audit', label: 'Audit', icon: FileText },
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
        <div className="flex flex-col h-full bg-white border-r border-slate-200 overflow-hidden">
            {/* Logo */}
            <div className="flex items-center gap-2.5 px-4 h-14 border-b border-slate-200 shrink-0">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg shadow-sm shrink-0" style={{ background: '#0066cc' }}>
                    <Cpu className="w-3.5 h-3.5 text-white" aria-hidden="true" />
                </span>
                <span className="text-sm font-bold tracking-tight text-slate-900">AgentFarms Ops</span>
            </div>

            {/* Nav */}
            <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
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
                    </div>
                </div>

                {/* Platform links */}
                <div>
                    <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                        Platform
                    </p>
                    <div className="space-y-0.5">
                        <Link
                            href="/connectors"
                            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                        >
                            <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 shrink-0">
                                <Link2 className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
                            </span>
                            <span className="flex-1">Connectors</span>
                        </Link>
                        <Link
                            href="/platform-mcp"
                            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                        >
                            <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 shrink-0">
                                <Cpu className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
                            </span>
                            <span className="flex-1">Platform MCP</span>
                        </Link>
                        <Link
                            href="/skills"
                            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                        >
                            <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 shrink-0">
                                <ShoppingBag className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
                            </span>
                            <span className="flex-1">Skills</span>
                        </Link>
                        <Link
                            href="/memory"
                            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                        >
                            <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 shrink-0">
                                <Brain className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
                            </span>
                            <span className="flex-1">Memory</span>
                        </Link>
                        <Link
                            href="/governance"
                            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                        >
                            <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 shrink-0">
                                <ShieldCheck className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
                            </span>
                            <span className="flex-1">Governance</span>
                        </Link>
                        <Link
                            href="/agents"
                            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                        >
                            <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 shrink-0">
                                <Bot className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
                            </span>
                            <span className="flex-1">Agents</span>
                        </Link>
                        <Link
                            href="/tasks"
                            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                        >
                            <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 shrink-0">
                                <ListChecks className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
                            </span>
                            <span className="flex-1">Tasks</span>
                        </Link>
                        <Link
                            href="/settings"
                            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                        >
                            <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 shrink-0">
                                <Settings className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
                            </span>
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
