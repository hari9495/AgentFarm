'use client';

import Link from 'next/link';
import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, useReducedMotion } from 'motion/react';
import { spring } from '@/components/motion';
import { useRouter, useSearchParams } from 'next/navigation';

const MotionButton = motion.button;
const MotionLink = motion.create(Link);
import {
    Cpu, Brain, ShoppingBag, LayoutDashboard, ClipboardCheck,
    Activity, FileText, Search, LogOut, HeartPulse,
    ChevronDown, ListChecks, ShieldCheck, Link2,
    BarChart2, CreditCard, Wrench,
    MessageSquare, DollarSign, PieChart, LineChart, Trophy, Bell,
    ScrollText, Film, Waves, Lock,
    SlidersHorizontal, Camera, GitBranch, RefreshCw,
    Network, CalendarDays, AlarmClock, Beaker, Monitor, Terminal,
    Zap, Star, Plug, Layers, BookOpen, LifeBuoy, User, Users, Key,
    type LucideIcon,
} from 'lucide-react';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import type { DashboardTab } from './dashboard-navigation';
import { getDashboardTabStorageKey } from './dashboard-tab-storage';
import { NotificationBell } from './notification-bell';
import { ThemeToggle } from './theme-toggle';
import { LocaleSwitcher } from './locale-switcher';
import { useSidebarCollapse } from './sidebar-collapse-context';

// ─── Types ───────────────────────────────────────────────────────────────────

type NavItemDef = {
    key: DashboardTab;
    label: string;
    icon: LucideIcon;
};

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
    activeRoles?: string[];
};

// ─── Tab nav items (Operations section) ─────────────────────────────────────

const navItems: NavItemDef[] = [
    { key: 'overview',      label: 'Overview',      icon: LayoutDashboard },
    { key: 'approvals',     label: 'Approvals',     icon: ClipboardCheck },
    { key: 'observability', label: 'Observability', icon: Activity },
    { key: 'audit',         label: 'Evidence',      icon: FileText },
];

// ─── NavItem (tab-based) ─────────────────────────────────────────────────────

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
    const reduce = useReducedMotion();
    const { collapsed } = useSidebarCollapse();
    const hasBadge = def.key === 'approvals' && pendingCount != null && pendingCount > 0;
    return (
        <MotionButton
            type="button"
            onClick={onClick}
            aria-current={active ? 'page' : undefined}
            title={collapsed ? def.label : undefined}
            whileTap={reduce ? undefined : { scale: 0.975 }}
            transition={spring.snappy}
            className={[
                'group relative w-full flex items-center gap-2.5 py-2 rounded-lg text-[13px] font-medium transition-colors text-left',
                collapsed ? 'justify-center px-0' : 'px-2.5',
                active
                    ? ''
                    : 'text-[color:var(--ink-soft)] hover:bg-[var(--bg-deep)] hover:text-[color:var(--ink)]',
            ].join(' ')}
            style={active ? { background: 'color-mix(in srgb, var(--accent) 8%, transparent)', color: 'var(--accent)' } : {}}
        >
            {active && (
                <motion.span
                    layoutId="internal-nav-active"
                    className="absolute left-0 inset-y-1.5 w-[3px] rounded-r-full"
                    style={{ background: 'var(--accent)' }}
                    transition={reduce ? { duration: 0 } : spring.smooth}
                />
            )}
            <span className="relative flex shrink-0">
                <Icon
                    className="w-[18px] h-[18px] transition-colors"
                    style={{ color: active ? 'var(--accent)' : 'var(--ink-muted)' }}
                    aria-hidden="true"
                />
                {collapsed && hasBadge && (
                    <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-[color:var(--card)]" aria-label={`${pendingCount} pending`} />
                )}
            </span>
            {!collapsed && <span className="flex-1">{def.label}</span>}
            {!collapsed && hasBadge && (
                <span
                    aria-label={`${pendingCount} pending`}
                    className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[9px] font-semibold shrink-0"
                >
                    {pendingCount}
                </span>
            )}
        </MotionButton>
    );
}

// ─── SidebarLink (page-based nav item) ──────────────────────────────────────

function SidebarLink({
    href,
    label,
    Icon,
    badge,
}: {
    href: string;
    label: string;
    Icon: LucideIcon;
    badge?: string;
}) {
    const reduce = useReducedMotion();
    const { collapsed } = useSidebarCollapse();
    return (
        <MotionLink
            href={href}
            title={collapsed ? label : undefined}
            whileTap={reduce ? undefined : { scale: 0.975 }}
            transition={spring.snappy}
            className={`group flex items-center gap-2.5 py-2 rounded-lg text-[13px] font-medium text-[color:var(--ink-soft)] hover:bg-[var(--bg-deep)] hover:text-[color:var(--ink)] transition-colors ${collapsed ? 'justify-center px-0' : 'px-2.5'}`}
        >
            <Icon className="w-[18px] h-[18px] shrink-0 text-[color:var(--ink-muted)] group-hover:text-[color:var(--ink-soft)] transition-colors" aria-hidden="true" />
            {!collapsed && <span className="flex-1">{label}</span>}
            {!collapsed && badge && (
                <span style={{
                    fontSize: '0.6rem', fontWeight: 700, padding: '1px 5px', borderRadius: 4,
                    background: 'color-mix(in srgb, var(--accent) 8%, transparent)', color: 'var(--accent)',
                    border: '1px solid color-mix(in srgb, var(--accent) 20%, transparent)', whiteSpace: 'nowrap',
                }}>{badge}</span>
            )}
        </MotionLink>
    );
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
    const { collapsed } = useSidebarCollapse();
    if (collapsed) {
        return <div className="mx-2 mb-1.5 h-px bg-[var(--line)]" aria-hidden="true" />;
    }
    return (
        <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-[color:var(--ink-muted)]">
            {children}
        </p>
    );
}

// ─── Main sidebar ─────────────────────────────────────────────────────────────

export function InternalSidebar({
    activeTab,
    workspaceId,
    workspaceName,
    workspaces,
    pendingCount = 0,
    auditUnlocked = true,
    activeRoles = [],
}: InternalSidebarProps) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { collapsed, toggle } = useSidebarCollapse();

    // Account menu (top header) — theme, language, sign out. Positioned `fixed`
    // off the trigger rect so the sidebar's overflow-hidden can't clip it.
    const acctRef = useRef<HTMLButtonElement>(null);
    const [menuOpen, setMenuOpen] = useState(false);
    const [menuRect, setMenuRect] = useState<{ left: number; top: number; width: number } | null>(null);
    const toggleMenu = () => {
        const r = acctRef.current?.getBoundingClientRect();
        if (r) setMenuRect({ left: r.left, top: r.bottom + 6, width: collapsed ? 232 : r.width });
        setMenuOpen((v) => !v);
    };
    useEffect(() => {
        if (!menuOpen) return;
        const close = () => setMenuOpen(false);
        window.addEventListener('resize', close);
        window.addEventListener('scroll', close, true);
        return () => {
            window.removeEventListener('resize', close);
            window.removeEventListener('scroll', close, true);
        };
    }, [menuOpen]);

    const handleSignOut = async () => {
        await fetch('/api/auth/logout', { method: 'POST' });
        document.cookie = 'agentfarm_internal_session=; path=/; max-age=0; samesite=strict';
        window.location.href = '/login';
    };

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
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
    };

    return (
        <div className="flex flex-col h-svh sticky top-0 bg-[var(--card)] border-r border-[color:var(--line)] overflow-hidden">
            {/* Account header — workspace identity + menu (dark mode, language, sign out) */}
            <div className={`flex items-center h-14 border-b border-[color:var(--line)] shrink-0 ${collapsed ? 'justify-center px-2 gap-1' : 'gap-1 px-2.5'}`}>
                <button
                    ref={acctRef}
                    type="button"
                    onClick={toggleMenu}
                    aria-haspopup="menu"
                    aria-expanded={menuOpen}
                    title={collapsed ? workspaceName : undefined}
                    className={`group flex items-center rounded-lg hover:bg-[var(--bg-deep)] transition-colors min-w-0 ${collapsed ? 'justify-center p-1' : 'flex-1 gap-2.5 px-2 py-1.5'}`}
                >
                    <span className="h-8 w-8 rounded-full bg-red-100 flex items-center justify-center text-[11px] font-bold text-red-600 shrink-0">
                        {workspaceName.slice(0, 2).toUpperCase()}
                    </span>
                    {!collapsed && (
                        <span className="flex-1 min-w-0 text-left">
                            <span className="block text-[13px] font-semibold text-[color:var(--ink)] truncate leading-tight">{workspaceName}</span>
                            <span className="block text-[10px] text-[color:var(--ink-muted)] truncate leading-tight">Active workspace</span>
                        </span>
                    )}
                    {!collapsed && <ChevronDown className={`w-3.5 h-3.5 shrink-0 text-[color:var(--ink-muted)] transition-transform ${menuOpen ? 'rotate-180' : ''}`} aria-hidden="true" />}
                </button>
                {!collapsed && <NotificationBell workspaceId={workspaceId} />}
                <button
                    type="button"
                    onClick={toggle}
                    title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                    aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                    className="shrink-0 inline-flex items-center justify-center p-1 rounded-lg text-[color:var(--ink-muted)] hover:text-[color:var(--ink-soft)] hover:bg-[var(--bg-deep)] transition-colors"
                >
                    {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
                </button>
            </div>

            {/* Account dropdown — portalled to <body> so no transformed/overflow
                ancestor can clip or mis-anchor the fixed panel. */}
            {menuOpen && menuRect && typeof document !== 'undefined' && createPortal(
                <>
                    <div className="fixed inset-0 z-[60]" onClick={() => setMenuOpen(false)} aria-hidden="true" />
                    <div
                        role="menu"
                        className="fixed z-[61] rounded-lg border border-[color:var(--line)] bg-[var(--card)] p-1.5 space-y-0.5"
                        style={{ left: menuRect.left, top: menuRect.top, width: menuRect.width, minWidth: 208, boxShadow: 'var(--shadow-lg)' }}
                    >
                        <ThemeToggle />
                        <LocaleSwitcher openUp={false} />
                        <div className="h-px bg-[var(--line)] my-1" />
                        <button
                            type="button"
                            onClick={handleSignOut}
                            role="menuitem"
                            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm w-full text-left text-[color:var(--ink-muted)] hover:bg-[var(--bg-deep)] hover:text-[color:var(--ink-soft)] transition-colors"
                        >
                            <LogOut className="w-4 h-4 shrink-0" aria-hidden="true" />
                            <span>Sign out</span>
                        </button>
                    </div>
                </>,
                document.body,
            )}

            {/* Nav */}
            <nav className={`flex-1 overflow-y-auto py-4 space-y-5 sidebar-scroll ${collapsed ? 'px-2 rail-scroll' : 'px-3'}`}>

                {/* ⌘K Search */}
                <button
                    type="button"
                    onClick={handleSearchKey}
                    title={collapsed ? 'Search (⌘K)' : undefined}
                    className={`w-full flex items-center rounded-lg border border-[color:var(--line)] bg-[var(--bg-deep)] text-xs text-[color:var(--ink-muted)] shadow-[var(--shadow-sm)] hover:bg-[var(--card)] hover:border-[color:var(--line-strong)] hover:text-[color:var(--ink-soft)] transition-colors ${collapsed ? 'justify-center py-2' : 'gap-2 px-3 py-2'}`}
                >
                    <Search className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    {!collapsed && <span className="flex-1 text-left">Search pages…</span>}
                    {!collapsed && <kbd className="inline-flex items-center text-[9px] font-mono text-[color:var(--ink-muted)]">⌘K</kbd>}
                </button>

                {/* Workspace switcher (hidden in the collapsed rail) */}
                {!collapsed && workspaces.length > 1 && (
                    <div>
                        <SectionLabel>Workspace</SectionLabel>
                        <div className="relative">
                            <select
                                value={workspaceId}
                                onChange={(e) => handleWorkspaceChange(e.target.value)}
                                className="w-full appearance-none bg-[var(--card)] border border-[color:var(--line)] rounded-lg px-3 py-2 pr-8 text-xs font-medium text-[color:var(--ink-soft)] focus:outline-none focus:ring-1 focus:ring-red-400 cursor-pointer"
                            >
                                {workspaces.map((ws) => (
                                    <option key={ws.workspaceId} value={ws.workspaceId}>
                                        {ws.workspaceName}
                                    </option>
                                ))}
                            </select>
                            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[color:var(--ink-muted)] pointer-events-none" aria-hidden="true" />
                        </div>
                    </div>
                )}

                {/* ── Operations ────────────────────────────────────── */}
                <div>
                    <SectionLabel>Operations</SectionLabel>
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
                        <SidebarLink href="/activity"          label="Activity"         Icon={Bell} />
                        <SidebarLink href="/approvals/mobile"  label="Mobile Approvals" Icon={ClipboardCheck}    badge="Mobile" />
                    </div>
                </div>

                {/* ── Workforce ─────────────────────────────────────── */}
                <div>
                    <SectionLabel>Workforce</SectionLabel>
                    <div className="space-y-0.5">
                        <SidebarLink href="/agents"          label="Team"             Icon={Users}  />
                        <SidebarLink href="/agents/health"   label="Team Health"      Icon={HeartPulse}  />
                        <SidebarLink href="/agents/compare"  label="Compare"          Icon={BarChart2}  />
                        <SidebarLink href="/tasks"           label="Tasks"            Icon={ListChecks}  />
                        <SidebarLink href="/tasks?tab=queue" label="Task Queue"       Icon={Layers} />
                        <SidebarLink href="/playbooks"       label="Playbooks"        Icon={BookOpen} />
                        <SidebarLink href="/devops"          label="DevOps Hub"       Icon={Wrench}    />
                        <SidebarLink href="/chat"            label="Chat"             Icon={MessageSquare}  />
                    </div>
                </div>

                {/* ── Developer Tools ───────────────────────────────── */}
                <div>
                    <SectionLabel>Developer Tools</SectionLabel>
                    <div className="space-y-0.5">
                        <SidebarLink href="/playground"      label="API Playground"     Icon={Zap}   />
                        <SidebarLink href="/ci"              label="CI Triage"           Icon={Terminal}  />
                        <SidebarLink href="/env"             label="Env Reconciler"      Icon={SlidersHorizontal} />
                        <SidebarLink href="/snapshots"       label="Bot Snapshots"       Icon={Camera}   />
                        <SidebarLink href="/handoffs"        label="Handoffs"            Icon={GitBranch} />
                        <SidebarLink href="/loops"           label="Autonomous Loops"    Icon={RefreshCw} />
                        <SidebarLink href="/agent-chat"      label="Loop Chat"           Icon={MessageSquare}   />
                        <SidebarLink href="/orchestration"   label="Orchestration Runs"  Icon={Network}   />
                        <SidebarLink href="/routine-tasks"   label="Routine Scheduler"   Icon={CalendarDays}    />
                        <SidebarLink href="/wake-runs"       label="Wake Runs"           Icon={AlarmClock}  />
                        <SidebarLink href="/ab-tests"        label="A/B Tests"           Icon={Beaker} />
                        <SidebarLink href="/desktop"         label="Desktop"             Icon={Monitor}   />
                    </div>
                </div>

                {/* ── Analytics ─────────────────────────────────────── */}
                <div>
                    <SectionLabel>Analytics</SectionLabel>
                    <div className="space-y-0.5">
                        <SidebarLink href="/analytics"           label="Overview"           Icon={BarChart2}   />
                        <SidebarLink href="/roi"                 label="ROI Dashboard"      Icon={Trophy}   />
                        <SidebarLink href="/cost-dashboard"      label="Cost Dashboard"     Icon={PieChart}  />
                        <SidebarLink href="/observability"       label="LLM Traces"         Icon={Network}   />
                        <SidebarLink href="/infra-monitoring"    label="Infra Monitoring"   Icon={Activity} />
                        <SidebarLink href="/historical-metrics"  label="Historical Metrics" Icon={LineChart} />
                        <SidebarLink href="/deliverables"        label="Deliverables"       Icon={ListChecks}   />
                        <SidebarLink href="/scheduled-tasks"     label="Scheduled Tasks"    Icon={CalendarDays} />
                        <SidebarLink href="/batch-tasks"         label="Batch Tasks"        Icon={Layers} />
                    </div>
                </div>

                {/* ── Audit & Compliance ────────────────────────────── */}
                <div>
                    <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-[color:var(--ink-muted)] flex items-center gap-1.5">
                        Audit &amp; Compliance
                        {!auditUnlocked && <Lock className="w-2.5 h-2.5 text-[color:var(--ink-muted)]" />}
                    </p>
                    <div className="space-y-0.5">
                        {auditUnlocked ? (
                            <>
                                <SidebarLink href="/audit"                label="Audit Log"       Icon={ScrollText}    />
                                <SidebarLink href="/audit/session-replay" label="Session Replay"  Icon={Film} />
                                <SidebarLink href="/operational-signals"  label="Op. Signals"     Icon={Waves}  />
                                <SidebarLink href="/circuit-breakers"     label="Circuit Breakers" Icon={Plug}   />
                            </>
                        ) : (
                            <Link
                                href="/billing"
                                className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                                style={{ color: 'var(--ink-muted)' }}
                            >
                                <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg shrink-0" style={{ background: 'rgba(148,163,184,0.1)' }}>
                                    <Lock className="w-3.5 h-3.5" style={{ color: 'var(--ink-muted)' }} />
                                </span>
                                <span className="flex-1 text-[color:var(--ink-muted)]">Upgrade to unlock</span>
                                <span style={{
                                    fontSize: '0.62rem', fontWeight: 700, padding: '1px 5px', borderRadius: 4,
                                    background: 'color-mix(in srgb, var(--accent) 8%, transparent)', color: 'var(--accent)',
                                    border: '1px solid color-mix(in srgb, var(--accent) 20%, transparent)', whiteSpace: 'nowrap',
                                }}>Business+</span>
                            </Link>
                        )}
                    </div>
                </div>

                {/* ── Platform ──────────────────────────────────────── */}
                <div>
                    <SectionLabel>Platform</SectionLabel>
                    <div className="space-y-0.5">
                        <SidebarLink href="/connectors"    label="Connectors"    Icon={Link2}   />
                        <SidebarLink href="/task-sources"  label="Task Sources"  Icon={ListChecks}  />
                        <SidebarLink href="/platform-mcp"  label="Platform MCP"  Icon={Cpu}   />
                        <SidebarLink href="/connector-status" label="Connector Status" Icon={Plug}  />
                        <SidebarLink href="/skills"         label="Skills"        Icon={ShoppingBag} />
                        <SidebarLink href="/memory"         label="Memory"        Icon={Brain} />
                        <SidebarLink href="/governance"     label="Governance"    Icon={ShieldCheck} />
                        <SidebarLink href="/support"        label="Support Agent" Icon={LifeBuoy} />
                    </div>
                </div>

                {/* ── Business ──────────────────────────────────────── */}
                <div>
                    <SectionLabel>Business</SectionLabel>
                    <div className="space-y-0.5">
                        <SidebarLink href="/billing" label="Billing" Icon={CreditCard}   />
                        <SidebarLink href="/budget"  label="Budget"  Icon={DollarSign} />
                    </div>
                </div>

                {/* ── Team & Settings ───────────────────────────────── */}
                <div>
                    <SectionLabel>Team &amp; Settings</SectionLabel>
                    <div className="space-y-0.5">
                        <SidebarLink href="/account"            label="My Account"       Icon={User}   />
                        <SidebarLink href="/team"               label="Team Members"     Icon={Users} />
                        <SidebarLink href="/settings"           label="API Keys"         Icon={Key}  />
                        <SidebarLink href="/settings/sso"       label="SSO / SAML"       Icon={ShieldCheck}  />
                        <SidebarLink href="/llm-config"         label="LLM Config"       Icon={Zap} />
                        <SidebarLink href="/quality"            label="Quality Feedback" Icon={Star}   />
                        <SidebarLink href="/notifications"      label="Notifications"    Icon={Bell}   />
                        <SidebarLink href="/sla-alerts"         label="SLA Alerts"       Icon={AlarmClock}    />
                        <SidebarLink href="/scheduled-reports"  label="Report Emails"    Icon={CalendarDays}    />
                    </div>
                </div>

            </nav>
        </div>
    );
}
