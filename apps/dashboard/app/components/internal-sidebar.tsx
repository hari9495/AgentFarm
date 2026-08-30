'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
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

// ─── Color system ────────────────────────────────────────────────────────────

type NavColor =
    | 'blue' | 'purple' | 'green' | 'amber' | 'red' | 'rose'
    | 'pink' | 'orange' | 'teal' | 'cyan' | 'indigo' | 'sky'
    | 'violet' | 'gold' | 'emerald' | 'slate';

// Section-accent nav icons — a glyph tinted by its SECTION (not per-item), via
// an inherited --nav-tint CSS var set on each section wrapper. Falls back to
// muted when no section tint is in scope. Active item still overrides to accent.
// Colour encodes area, not decoration — one cool hue per group, no rainbow.
const MONO_ICON = { bg: 'transparent', text: 'var(--nav-tint, var(--sidebar-muted))' } as const;

// One calm, cool-family hue per section. Distinct from the status palette
// (green/amber/red stay reserved for signals) so area-coding never reads as state.
const tint = (hex: string) => ({ ['--nav-tint']: hex } as React.CSSProperties);
const SECTION_TINT = {
    operations: '#3B82F6', // blue
    workforce:  '#6366F1', // indigo
    devtools:   '#8B5CF6', // violet
    analytics:  '#0EA5E9', // sky
    audit:      '#64748B', // slate
    platform:   '#06B6D4', // cyan
    business:   '#14B8A6', // teal
    settings:   '#7C83A3', // muted slate-violet
} as const;
const COLOR_MAP: Record<NavColor, { bg: string; text: string }> = {
    blue: MONO_ICON, purple: MONO_ICON, green: MONO_ICON, amber: MONO_ICON,
    red: MONO_ICON, rose: MONO_ICON, pink: MONO_ICON, orange: MONO_ICON,
    teal: MONO_ICON, cyan: MONO_ICON, indigo: MONO_ICON, sky: MONO_ICON,
    violet: MONO_ICON, gold: MONO_ICON, emerald: MONO_ICON, slate: MONO_ICON,
};

// ─── Types ───────────────────────────────────────────────────────────────────

type NavItemDef = {
    key: DashboardTab;
    label: string;
    icon: LucideIcon;
    color: NavColor;
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
    { key: 'overview',      label: 'Overview',      icon: LayoutDashboard, color: 'blue'   },
    { key: 'approvals',     label: 'Approvals',     icon: ClipboardCheck,  color: 'rose'   },
    { key: 'observability', label: 'Observability', icon: Activity,        color: 'orange' },
    { key: 'audit',         label: 'Evidence',      icon: FileText,        color: 'teal'   },
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
    const c = COLOR_MAP[def.color];
    const { collapsed } = useSidebarCollapse();
    const hasBadge = def.key === 'approvals' && pendingCount != null && pendingCount > 0;
    return (
        <button
            type="button"
            onClick={onClick}
            aria-current={active ? 'page' : undefined}
            title={collapsed ? def.label : undefined}
            className={[
                'w-full flex items-center gap-3 py-2 rounded-sm text-sm font-medium transition-colors text-left',
                collapsed ? 'justify-center px-0' : 'px-3',
                active
                    ? 'font-semibold'
                    : 'text-[color:var(--ink-soft)] hover:bg-[var(--bg-deep)] hover:text-[color:var(--ink)]',
            ].join(' ')}
            style={active ? { background: 'color-mix(in srgb, var(--accent) 7%, transparent)', color: 'var(--accent)' } : {}}
        >
            <span
                className="relative inline-flex h-7 w-7 items-center justify-center rounded-sm shrink-0"
                style={active
                    ? { background: 'rgba(37, 99, 235,0.12)' }
                    : { background: c.bg }}
            >
                <Icon
                    className="w-3.5 h-3.5"
                    style={{ color: active ? 'var(--accent)' : c.text }}
                    aria-hidden="true"
                />
                {collapsed && hasBadge && (
                    <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-[color:var(--card)]" aria-label={`${pendingCount} pending`} />
                )}
            </span>
            {!collapsed && <span className="flex-1">{def.label}</span>}
            {!collapsed && hasBadge && (
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

// ─── SidebarLink (page-based nav item) ──────────────────────────────────────

function SidebarLink({
    href,
    label,
    Icon,
    color,
    badge,
}: {
    href: string;
    label: string;
    Icon: LucideIcon;
    color: NavColor;
    badge?: string;
}) {
    const c = COLOR_MAP[color];
    const { collapsed } = useSidebarCollapse();
    return (
        <Link
            href={href}
            title={collapsed ? label : undefined}
            className={`flex items-center gap-3 py-2 rounded-sm text-sm font-medium text-[color:var(--ink-soft)] hover:bg-[var(--bg-deep)] hover:text-[color:var(--ink)] transition-colors ${collapsed ? 'justify-center px-0' : 'px-3'}`}
        >
            <span
                className="inline-flex h-7 w-7 items-center justify-center rounded-sm shrink-0"
                style={{ background: c.bg }}
            >
                <Icon className="w-3.5 h-3.5" style={{ color: c.text }} aria-hidden="true" />
            </span>
            {!collapsed && <span className="flex-1">{label}</span>}
            {!collapsed && badge && (
                <span style={{
                    fontSize: '0.6rem', fontWeight: 700, padding: '1px 5px', borderRadius: 4,
                    background: 'color-mix(in srgb, var(--accent) 8%, transparent)', color: 'var(--accent)',
                    border: '1px solid color-mix(in srgb, var(--accent) 20%, transparent)', whiteSpace: 'nowrap',
                }}>{badge}</span>
            )}
        </Link>
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
        <div className="flex flex-col h-screen sticky top-0 bg-[var(--card)] border-r border-[color:var(--line)] overflow-hidden">
            {/* Logo / header — when collapsed, the expand toggle takes the top
                line (same row as expanded) so it's easy to find. */}
            <div className={`flex items-center h-14 border-b border-[color:var(--line)] shrink-0 ${collapsed ? 'justify-center px-2' : 'gap-2.5 px-4'}`}>
                {!collapsed && (
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-sm shadow-sm shrink-0" style={{ background: 'var(--accent)' }}>
                        <Cpu className="w-3.5 h-3.5 text-white" aria-hidden="true" />
                    </span>
                )}
                {!collapsed && <span className="text-sm font-bold tracking-tight text-[color:var(--ink)] flex-1">AgentFarms Ops</span>}
                {!collapsed && <NotificationBell workspaceId={workspaceId} />}
                <button
                    type="button"
                    onClick={toggle}
                    title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                    aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                    className="shrink-0 inline-flex items-center justify-center p-1 rounded-sm text-[color:var(--ink-muted)] hover:text-[color:var(--ink-soft)] hover:bg-[var(--bg-deep)] transition-colors"
                >
                    {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
                </button>
            </div>

            {/* Nav */}
            <nav className={`flex-1 overflow-y-auto py-4 space-y-5 sidebar-scroll ${collapsed ? 'px-2 rail-scroll' : 'px-3'}`}>

                {/* ⌘K Search */}
                <button
                    type="button"
                    onClick={handleSearchKey}
                    title={collapsed ? 'Search (⌘K)' : undefined}
                    className={`w-full flex items-center rounded-sm border border-[color:var(--line)] bg-[var(--bg-deep)] text-xs text-[color:var(--ink-muted)] hover:bg-[var(--bg-deep)] hover:text-[color:var(--ink-soft)] transition-colors ${collapsed ? 'justify-center py-2' : 'gap-2 px-3 py-2'}`}
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
                                className="w-full appearance-none bg-[var(--card)] border border-[color:var(--line)] rounded-sm px-3 py-2 pr-8 text-xs font-medium text-[color:var(--ink-soft)] focus:outline-none focus:ring-1 focus:ring-red-400 cursor-pointer"
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
                <div style={tint(SECTION_TINT.operations)}>
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
                        <SidebarLink href="/activity"          label="Activity"         Icon={Bell}          color="violet" />
                        <SidebarLink href="/approvals/mobile"  label="Mobile Approvals" Icon={ClipboardCheck} color="sky"    badge="Mobile" />
                    </div>
                </div>

                {/* ── Workforce ─────────────────────────────────────── */}
                <div style={tint(SECTION_TINT.workforce)}>
                    <SectionLabel>Workforce</SectionLabel>
                    <div className="space-y-0.5">
                        <SidebarLink href="/agents"          label="Team"             Icon={Users}       color="slate"  />
                        <SidebarLink href="/agents/health"   label="Team Health"      Icon={HeartPulse}  color="slate"  />
                        <SidebarLink href="/agents/compare"  label="Compare"          Icon={BarChart2}    color="slate"  />
                        <SidebarLink href="/tasks"           label="Tasks"            Icon={ListChecks}  color="amber"  />
                        <SidebarLink href="/tasks?tab=queue" label="Task Queue"       Icon={Layers}      color="orange" />
                        <SidebarLink href="/playbooks"       label="Playbooks"        Icon={BookOpen}    color="indigo" />
                        <SidebarLink href="/devops"          label="DevOps Hub"       Icon={Wrench}      color="red"    />
                        <SidebarLink href="/chat"            label="Chat"             Icon={MessageSquare} color="sky"  />
                    </div>
                </div>

                {/* ── Developer Tools ───────────────────────────────── */}
                <div style={tint(SECTION_TINT.devtools)}>
                    <SectionLabel>Developer Tools</SectionLabel>
                    <div className="space-y-0.5">
                        <SidebarLink href="/playground"      label="API Playground"     Icon={Zap}              color="gold"   />
                        <SidebarLink href="/ci"              label="CI Triage"           Icon={Terminal}         color="slate"  />
                        <SidebarLink href="/env"             label="Env Reconciler"      Icon={SlidersHorizontal} color="green" />
                        <SidebarLink href="/snapshots"       label="Bot Snapshots"       Icon={Camera}           color="blue"   />
                        <SidebarLink href="/handoffs"        label="Handoffs"            Icon={GitBranch}        color="orange" />
                        <SidebarLink href="/loops"           label="Autonomous Loops"    Icon={RefreshCw}        color="purple" />
                        <SidebarLink href="/agent-chat"      label="Loop Chat"           Icon={MessageSquare}    color="pink"   />
                        <SidebarLink href="/orchestration"   label="Orchestration Runs"  Icon={Network}          color="teal"   />
                        <SidebarLink href="/routine-tasks"   label="Routine Scheduler"   Icon={CalendarDays}     color="sky"    />
                        <SidebarLink href="/wake-runs"       label="Wake Runs"           Icon={AlarmClock}       color="amber"  />
                        <SidebarLink href="/ab-tests"        label="A/B Tests"           Icon={Beaker}           color="violet" />
                        <SidebarLink href="/desktop"         label="Desktop"             Icon={Monitor}          color="cyan"   />
                    </div>
                </div>

                {/* ── Analytics ─────────────────────────────────────── */}
                <div style={tint(SECTION_TINT.analytics)}>
                    <SectionLabel>Analytics</SectionLabel>
                    <div className="space-y-0.5">
                        <SidebarLink href="/analytics"           label="Overview"           Icon={BarChart2}   color="blue"   />
                        <SidebarLink href="/roi"                 label="ROI Dashboard"      Icon={Trophy}      color="gold"   />
                        <SidebarLink href="/cost-dashboard"      label="Cost Dashboard"     Icon={PieChart}    color="green"  />
                        <SidebarLink href="/observability"       label="LLM Traces"         Icon={Network}     color="blue"   />
                        <SidebarLink href="/infra-monitoring"    label="Infra Monitoring"   Icon={Activity}    color="orange" />
                        <SidebarLink href="/historical-metrics"  label="Historical Metrics" Icon={LineChart}   color="violet" />
                        <SidebarLink href="/deliverables"        label="Deliverables"       Icon={ListChecks}  color="teal"   />
                        <SidebarLink href="/scheduled-tasks"     label="Scheduled Tasks"    Icon={CalendarDays} color="orange" />
                        <SidebarLink href="/batch-tasks"         label="Batch Tasks"        Icon={Layers}      color="purple" />
                    </div>
                </div>

                {/* ── Audit & Compliance ────────────────────────────── */}
                <div style={tint(SECTION_TINT.audit)}>
                    <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-[color:var(--ink-muted)] flex items-center gap-1.5">
                        Audit &amp; Compliance
                        {!auditUnlocked && <Lock className="w-2.5 h-2.5 text-[color:var(--ink-muted)]" />}
                    </p>
                    <div className="space-y-0.5">
                        {auditUnlocked ? (
                            <>
                                <SidebarLink href="/audit"                label="Audit Log"       Icon={ScrollText} color="red"    />
                                <SidebarLink href="/audit/session-replay" label="Session Replay"  Icon={Film}       color="orange" />
                                <SidebarLink href="/operational-signals"  label="Op. Signals"     Icon={Waves}      color="amber"  />
                                <SidebarLink href="/circuit-breakers"     label="Circuit Breakers" Icon={Plug}      color="rose"   />
                            </>
                        ) : (
                            <Link
                                href="/billing"
                                className="flex items-center gap-3 px-3 py-2 rounded-sm text-sm font-medium transition-colors"
                                style={{ color: 'var(--ink-muted)' }}
                            >
                                <span className="inline-flex h-7 w-7 items-center justify-center rounded-sm shrink-0" style={{ background: 'rgba(148,163,184,0.1)' }}>
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
                <div style={tint(SECTION_TINT.platform)}>
                    <SectionLabel>Platform</SectionLabel>
                    <div className="space-y-0.5">
                        <SidebarLink href="/connectors"    label="Connectors"    Icon={Link2}      color="blue"   />
                        <SidebarLink href="/task-sources"  label="Task Sources"  Icon={ListChecks} color="amber"  />
                        <SidebarLink href="/platform-mcp"  label="Platform MCP"  Icon={Cpu}        color="cyan"   />
                        <SidebarLink href="/connector-status" label="Connector Status" Icon={Plug}    color="green"  />
                        <SidebarLink href="/skills"         label="Skills"        Icon={ShoppingBag} color="purple" />
                        <SidebarLink href="/memory"         label="Memory"        Icon={Brain}      color="violet" />
                        <SidebarLink href="/governance"     label="Governance"    Icon={ShieldCheck} color="green" />
                        <SidebarLink href="/support"        label="Support Agent" Icon={LifeBuoy}   color="orange" />
                    </div>
                </div>

                {/* ── Business ──────────────────────────────────────── */}
                <div style={tint(SECTION_TINT.business)}>
                    <SectionLabel>Business</SectionLabel>
                    <div className="space-y-0.5">
                        <SidebarLink href="/billing" label="Billing" Icon={CreditCard} color="green"   />
                        <SidebarLink href="/budget"  label="Budget"  Icon={DollarSign} color="emerald" />
                    </div>
                </div>

                {/* ── Team & Settings ───────────────────────────────── */}
                <div style={tint(SECTION_TINT.settings)}>
                    <SectionLabel>Team &amp; Settings</SectionLabel>
                    <div className="space-y-0.5">
                        <SidebarLink href="/account"            label="My Account"       Icon={User}         color="blue"   />
                        <SidebarLink href="/team"               label="Team Members"     Icon={Users}        color="indigo" />
                        <SidebarLink href="/settings"           label="API Keys"         Icon={Key}          color="slate"  />
                        <SidebarLink href="/settings/sso"       label="SSO / SAML"       Icon={ShieldCheck}  color="green"  />
                        <SidebarLink href="/llm-config"         label="LLM Config"       Icon={Zap}          color="purple" />
                        <SidebarLink href="/quality"            label="Quality Feedback" Icon={Star}         color="gold"   />
                        <SidebarLink href="/notifications"      label="Notifications"    Icon={Bell}         color="rose"   />
                        <SidebarLink href="/sla-alerts"         label="SLA Alerts"       Icon={AlarmClock}   color="red"    />
                        <SidebarLink href="/scheduled-reports"  label="Report Emails"    Icon={CalendarDays} color="sky"    />
                    </div>
                </div>

            </nav>

            {/* Footer */}
            <div className={`border-t border-[color:var(--line)] py-3 space-y-0.5 shrink-0 ${collapsed ? 'px-2 flex flex-col items-center' : 'px-3'}`}>
                {workspaces.length <= 1 && (
                    <div className={`flex items-center rounded-sm ${collapsed ? 'justify-center py-2' : 'gap-3 px-3 py-2'}`} title={collapsed ? workspaceName : undefined}>
                        <div className="h-7 w-7 rounded-full bg-red-100 flex items-center justify-center text-[10px] font-bold text-red-600 shrink-0">
                            {workspaceName.slice(0, 2).toUpperCase()}
                        </div>
                        {!collapsed && (
                            <div className="flex-1 min-w-0">
                                <p className="text-[color:var(--ink)] font-medium truncate text-xs">{workspaceName}</p>
                                <p className="text-[color:var(--ink-muted)] truncate text-[10px]">Active workspace</p>
                            </div>
                        )}
                    </div>
                )}
                {!collapsed && <ThemeToggle />}
                {!collapsed && <LocaleSwitcher />}
                <button
                    type="button"
                    onClick={async () => {
                        await fetch('/api/auth/logout', { method: 'POST' });
                        document.cookie = 'agentfarm_internal_session=; path=/; max-age=0; samesite=strict';
                        window.location.href = '/login';
                    }}
                    title={collapsed ? 'Sign out' : undefined}
                    className={`flex items-center rounded-sm text-sm text-[color:var(--ink-muted)] hover:bg-[var(--bg-deep)] hover:text-[color:var(--ink-soft)] transition-colors text-left ${collapsed ? 'justify-center w-9 h-9' : 'gap-3 px-3 py-2 w-full'}`}
                >
                    <LogOut className="w-4 h-4 shrink-0" aria-hidden="true" />
                    {!collapsed && <span>Sign out</span>}
                </button>
            </div>
        </div>
    );
}
