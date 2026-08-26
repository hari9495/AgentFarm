'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
    Cpu, Brain, ShoppingBag, LayoutDashboard, ClipboardCheck,
    Activity, FileText, Search, LogOut, HeartPulse,
    ChevronDown, Bot, ListChecks, ShieldCheck, Link2,
    BarChart2, CreditCard, Wrench,
    MessageSquare, DollarSign, PieChart, LineChart, Trophy, Bell,
    ScrollText, Film, Waves, Lock,
    SlidersHorizontal, Camera, GitBranch, RefreshCw,
    Network, CalendarDays, AlarmClock, Beaker, Monitor, Terminal,
    Zap, Star, Plug, Layers, BookOpen, LifeBuoy, User, Users, Key,
    type LucideIcon,
} from 'lucide-react';
import type { DashboardTab } from './dashboard-navigation';
import { getDashboardTabStorageKey } from './dashboard-tab-storage';
import { NotificationBell } from './notification-bell';
import { ThemeToggle } from './theme-toggle';
import { LocaleSwitcher } from './locale-switcher';

// ─── Color system ────────────────────────────────────────────────────────────

type NavColor =
    | 'blue' | 'purple' | 'green' | 'amber' | 'red' | 'rose'
    | 'pink' | 'orange' | 'teal' | 'cyan' | 'indigo' | 'sky'
    | 'violet' | 'gold' | 'emerald' | 'slate';

const COLOR_MAP: Record<NavColor, { bg: string; text: string }> = {
    blue:    { bg: 'rgba(0,102,204,0.1)',    text: 'var(--accent)' },
    purple:  { bg: 'rgba(124,58,237,0.1)',   text: 'var(--accent)' },
    green:   { bg: 'rgba(5,150,105,0.1)',    text: 'var(--ok)' },
    amber:   { bg: 'rgba(217,119,6,0.1)',    text: 'var(--warn)' },
    red:     { bg: 'rgba(220,38,38,0.1)',    text: 'var(--danger)' },
    rose:    { bg: 'rgba(225,29,72,0.1)',    text: 'var(--danger)' },
    pink:    { bg: 'rgba(219,39,119,0.1)',   text: '#db2777' },
    orange:  { bg: 'rgba(234,88,12,0.1)',    text: 'var(--warn)' },
    teal:    { bg: 'rgba(13,148,136,0.1)',   text: 'var(--info)' },
    cyan:    { bg: 'rgba(8,145,178,0.1)',    text: 'var(--info)' },
    indigo:  { bg: 'rgba(79,70,229,0.1)',    text: 'var(--accent)' },
    sky:     { bg: 'rgba(2,132,199,0.1)',    text: 'var(--info)' },
    violet:  { bg: 'rgba(109,40,217,0.1)',   text: 'var(--accent)' },
    gold:    { bg: 'rgba(202,138,4,0.1)',    text: 'var(--warn)' },
    emerald: { bg: 'rgba(16,185,129,0.1)',   text: 'var(--ok)' },
    slate:   { bg: 'rgba(71,85,105,0.1)',    text: 'var(--ink-muted)' },
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
            style={active ? { background: 'color-mix(in srgb, var(--accent) 7%, transparent)', color: 'var(--accent)' } : {}}
        >
            <span
                className="inline-flex h-7 w-7 items-center justify-center rounded-lg shrink-0"
                style={active
                    ? { background: 'rgba(0,102,204,0.12)' }
                    : { background: c.bg }}
            >
                <Icon
                    className="w-3.5 h-3.5"
                    style={{ color: active ? 'var(--accent)' : c.text }}
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
    return (
        <Link
            href={href}
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
        >
            <span
                className="inline-flex h-7 w-7 items-center justify-center rounded-lg shrink-0"
                style={{ background: c.bg }}
            >
                <Icon className="w-3.5 h-3.5" style={{ color: c.text }} aria-hidden="true" />
            </span>
            <span className="flex-1">{label}</span>
            {badge && (
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
    return (
        <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
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
        <div className="flex flex-col h-screen sticky top-0 bg-white border-r border-slate-200 overflow-hidden">
            {/* Logo */}
            <div className="flex items-center gap-2.5 px-4 h-14 border-b border-slate-200 shrink-0">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg shadow-sm shrink-0" style={{ background: 'var(--accent)' }}>
                    <Cpu className="w-3.5 h-3.5 text-white" aria-hidden="true" />
                </span>
                <span className="text-sm font-bold tracking-tight text-slate-900 flex-1">AgentFarms Ops</span>
                <NotificationBell workspaceId={workspaceId} />
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
                        <SectionLabel>Workspace</SectionLabel>
                        <div className="relative">
                            <select
                                value={workspaceId}
                                onChange={(e) => handleWorkspaceChange(e.target.value)}
                                className="w-full appearance-none bg-white border border-slate-200 rounded-lg px-3 py-2 pr-8 text-xs font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-400 cursor-pointer"
                            >
                                {workspaces.map((ws) => (
                                    <option key={ws.workspaceId} value={ws.workspaceId}>
                                        {ws.workspaceName}
                                    </option>
                                ))}
                            </select>
                            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" aria-hidden="true" />
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
                        <SidebarLink href="/activity"          label="Activity"         Icon={Bell}          color="violet" />
                        <SidebarLink href="/approvals/mobile"  label="Mobile Approvals" Icon={ClipboardCheck} color="sky"    badge="Mobile" />
                    </div>
                </div>

                {/* ── Agents ────────────────────────────────────────── */}
                <div>
                    <SectionLabel>Agents</SectionLabel>
                    <div className="space-y-0.5">
                        <SidebarLink href="/agents"          label="Agents"           Icon={Bot}         color="purple" />
                        <SidebarLink href="/agents/health"   label="Agent Health"     Icon={HeartPulse}  color="green"  />
                        <SidebarLink href="/agents/compare"  label="Agent Comparison" Icon={BarChart2}    color="blue"   />
                        <SidebarLink href="/tasks"           label="Tasks"            Icon={ListChecks}  color="amber"  />
                        <SidebarLink href="/tasks?tab=queue" label="Task Queue"       Icon={Layers}      color="orange" />
                        <SidebarLink href="/playbooks"       label="Playbooks"        Icon={BookOpen}    color="indigo" />
                        <SidebarLink href="/devops"          label="DevOps Hub"       Icon={Wrench}      color="red"    />
                        <SidebarLink href="/chat"            label="Chat"             Icon={MessageSquare} color="sky"  />
                    </div>
                </div>

                {/* ── Developer Tools ───────────────────────────────── */}
                <div>
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
                <div>
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
                <div>
                    <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                        Audit &amp; Compliance
                        {!auditUnlocked && <Lock className="w-2.5 h-2.5 text-slate-400" />}
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
                                className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                                style={{ color: 'var(--ink-muted)' }}
                            >
                                <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg shrink-0" style={{ background: 'rgba(148,163,184,0.1)' }}>
                                    <Lock className="w-3.5 h-3.5" style={{ color: 'var(--ink-muted)' }} />
                                </span>
                                <span className="flex-1 text-slate-400">Upgrade to unlock</span>
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
                <div>
                    <SectionLabel>Business</SectionLabel>
                    <div className="space-y-0.5">
                        <SidebarLink href="/billing" label="Billing" Icon={CreditCard} color="green"   />
                        <SidebarLink href="/budget"  label="Budget"  Icon={DollarSign} color="emerald" />
                    </div>
                </div>

                {/* ── Team & Settings ───────────────────────────────── */}
                <div>
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
            <div className="border-t border-slate-200 px-3 py-3 space-y-0.5 shrink-0">
                {workspaces.length <= 1 && (
                    <div className="flex items-center gap-3 px-3 py-2 rounded-lg">
                        <div className="h-7 w-7 rounded-full bg-blue-100 flex items-center justify-center text-[10px] font-bold text-blue-600 shrink-0">
                            {workspaceName.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-slate-800 font-medium truncate text-xs">{workspaceName}</p>
                            <p className="text-slate-400 truncate text-[10px]">Active workspace</p>
                        </div>
                    </div>
                )}
                <ThemeToggle />
                <LocaleSwitcher />
                <button
                    type="button"
                    onClick={async () => {
                        await fetch('/api/auth/logout', { method: 'POST' });
                        document.cookie = 'agentfarm_internal_session=; path=/; max-age=0; samesite=strict';
                        window.location.href = '/login';
                    }}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors w-full text-left"
                >
                    <LogOut className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span>Sign out</span>
                </button>
            </div>
        </div>
    );
}
