'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
    Wrench, GitPullRequest, Cpu, RefreshCw, GitBranch, Beaker,
    SlidersHorizontal, Camera, Network, CalendarDays, AlarmClock, Monitor,
} from 'lucide-react';
import CiTriagePanel from '../components/ci-triage-panel';
import PrDraftsPanel from '../components/pr-drafts-panel';
import HandoffsPanel from '../components/handoffs-panel';
import AutonomousLoopsPanel from '../components/autonomous-loops-panel';
import AbTestsPanel from '../components/ab-tests-panel';
import EnvReconcilerPanel from '../components/env-reconciler-panel';
import CapabilitySnapshotPanel from '../components/capability-snapshot-panel';
import OrchestrationRunsPanel from '../components/orchestration-runs-panel';
import { RoutineSchedulerPanel } from '../components/routine-scheduler-panel';
import WakeRunsPanel from '../components/wake-runs-panel';
import DesktopPanel from '../components/desktop-panel';
import DesktopStreamPanel from '../components/desktop-stream-panel';

type Tab =
    | 'ci' | 'pr' | 'handoffs' | 'loops' | 'abtests'
    | 'env' | 'snapshots' | 'orchestration' | 'routine' | 'wake' | 'desktop';

const TABS: { key: Tab; label: string; icon: React.ElementType; desc: string }[] = [
    { key: 'ci',           label: 'CI Triage',          icon: Cpu,               desc: 'Intake CI failures, view triage results'                       },
    { key: 'pr',           label: 'PR Drafts',           icon: GitPullRequest,    desc: 'Review, publish, or discard AI-generated PRs'                  },
    { key: 'env',          label: 'Env Reconciler',      icon: SlidersHorizontal, desc: 'Compare expected vs actual environment variables'              },
    { key: 'snapshots',    label: 'Bot Snapshots',       icon: Camera,            desc: 'Snapshot history and latest config snapshot per agent'         },
    { key: 'handoffs',     label: 'Handoffs',            icon: GitBranch,         desc: 'View and complete pending agent handoff queue'                 },
    { key: 'loops',        label: 'Autonomous Loops',    icon: RefreshCw,         desc: 'Create and manage self-repeating agent loops'                  },
    { key: 'orchestration',label: 'Orchestration Runs',  icon: Network,           desc: 'View and cancel multi-agent orchestration runs'                },
    { key: 'routine',      label: 'Routine Scheduler',   icon: CalendarDays,      desc: 'Schedule recurring tasks with cron-style config'              },
    { key: 'wake',         label: 'Wake Runs',           icon: AlarmClock,        desc: 'One-shot scheduled task runs and wake event history'           },
    { key: 'abtests',      label: 'A/B Tests',           icon: Beaker,            desc: 'Create and monitor agent A/B experiments'                     },
    { key: 'desktop',      label: 'Desktop',             icon: Monitor,           desc: 'Remote desktop status, automation actions, and agent profile'  },
];

function TabShell({ title, icon: Icon, description, children }: {
    title: string; icon: React.ElementType; description: string; children: React.ReactNode;
}) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'color-mix(in srgb, var(--accent) 8%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                    <Icon size={16} color="var(--accent)" />
                </div>
                <div>
                    <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--ink)', letterSpacing: '-0.02em' }}>{title}</h2>
                    <p style={{ margin: '3px 0 0', fontSize: 13, color: 'var(--ink-muted)', lineHeight: 1.45 }}>{description}</p>
                </div>
            </div>
            <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 18, padding: 20, boxShadow: 'var(--shadow-sm)' }}>
                {children}
            </div>
        </div>
    );
}

export default function DevOpsHubClient({
    tenantId,
    workspaceId,
}: {
    tenantId: string;
    workspaceId: string;
}) {
    const [activeTab, setActiveTab] = useState<Tab>('ci');
    const active = TABS.find(t => t.key === activeTab)!;

    return (
        <div style={{ minHeight: '100vh', background: 'var(--bg)', fontFamily: 'var(--font-inter), -apple-system, sans-serif', display: 'flex', flexDirection: 'column' }}>
            {/* Header */}
            <header style={{ height: 56, background: 'var(--card)', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', padding: '0 20px', gap: 12, flexShrink: 0, position: 'sticky', top: 0, zIndex: 10 }}>
                <Link href="/" style={{ color: 'var(--ink-muted)', fontSize: 13, textDecoration: 'none', fontWeight: 500 }}>← Dashboard</Link>
                <span style={{ color: 'var(--line-strong)' }}>|</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(45, 138, 138,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Wrench size={14} color="var(--accent)" />
                    </div>
                    <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', letterSpacing: '-0.02em' }}>DevOps &amp; Developer Tools</span>
                </div>
            </header>

            {/* Tab bar */}
            <div style={{ background: 'var(--card)', borderBottom: '1px solid var(--line)', padding: '0 20px', display: 'flex', gap: 0, overflowX: 'auto' }}>
                {TABS.map(({ key, label, icon: Icon }) => {
                    const isActive = activeTab === key;
                    return (
                        <button
                            key={key}
                            type="button"
                            onClick={() => setActiveTab(key)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 6,
                                padding: '13px 14px', background: 'transparent', border: 'none',
                                borderBottom: `2px solid ${isActive ? 'var(--accent)' : 'transparent'}`,
                                cursor: 'pointer',
                                color: isActive ? 'var(--accent)' : 'var(--ink-muted)',
                                fontSize: 13, fontWeight: isActive ? 600 : 500,
                                transition: 'all 0.15s', marginBottom: -1, whiteSpace: 'nowrap',
                            }}
                        >
                            <Icon size={13} />{label}
                        </button>
                    );
                })}
            </div>

            {/* Content */}
            <div style={{ flex: 1, padding: 20, overflow: 'auto' }}>
                {activeTab === 'ci' && (
                    <TabShell icon={Cpu} title="CI Triage" description="Intake CI pipeline failures, view AI-generated root-cause analysis, and track resolution status.">
                        <CiTriagePanel workspaceId={workspaceId} />
                    </TabShell>
                )}
                {activeTab === 'pr' && (
                    <TabShell icon={GitPullRequest} title="PR Drafts" description="Review AI-generated pull request drafts awaiting human sign-off. Publish, edit, or discard each draft.">
                        <PrDraftsPanel tenantId={tenantId} workspaceId={workspaceId} />
                    </TabShell>
                )}
                {activeTab === 'env' && (
                    <TabShell icon={SlidersHorizontal} title="Environment Reconciler" description="Compare expected vs actual environment variables across services. Spot drift before it causes incidents.">
                        <EnvReconcilerPanel tenantId={tenantId} workspaceId={workspaceId} />
                    </TabShell>
                )}
                {activeTab === 'snapshots' && (
                    <TabShell icon={Camera} title="Bot Snapshots" description="Browse snapshot history and the latest capability config snapshot for each agent.">
                        <CapabilitySnapshotPanel botId="" />
                    </TabShell>
                )}
                {activeTab === 'handoffs' && (
                    <TabShell icon={GitBranch} title="Agent Handoffs" description="View and complete pending handoffs between agents. Handoffs occur when one agent delegates work to another.">
                        <HandoffsPanel tenantId={tenantId} workspaceId={workspaceId} />
                    </TabShell>
                )}
                {activeTab === 'loops' && (
                    <TabShell icon={RefreshCw} title="Autonomous Loops" description="Create and manage self-repeating agent loops — tasks that run on a schedule or trigger condition automatically.">
                        <AutonomousLoopsPanel />
                    </TabShell>
                )}
                {activeTab === 'orchestration' && (
                    <TabShell icon={Network} title="Orchestration Runs" description="Start, monitor, and cancel multi-agent orchestration runs across your workspace.">
                        <OrchestrationRunsPanel tenantId={tenantId} />
                    </TabShell>
                )}
                {activeTab === 'routine' && (
                    <TabShell icon={CalendarDays} title="Routine Scheduler" description="Schedule recurring tasks with cron-style configuration for any agent in your workspace.">
                        <RoutineSchedulerPanel botId="" workspaceId={workspaceId} />
                    </TabShell>
                )}
                {activeTab === 'wake' && (
                    <TabShell icon={AlarmClock} title="Wake Runs" description="Schedule and monitor one-shot agent wake events. Supports timer, on-demand, automation, and handoff sources.">
                        <WakeRunsPanel workspaceId={workspaceId} />
                    </TabShell>
                )}
                {activeTab === 'abtests' && (
                    <TabShell icon={Beaker} title="A/B Tests" description="Create agent A/B experiments, configure variants, and monitor which performs better on real tasks.">
                        <AbTestsPanel tenantId={tenantId} />
                    </TabShell>
                )}
                {activeTab === 'desktop' && (
                    <TabShell icon={Monitor} title="Desktop Agent" description="Remote desktop environment status, automation action history, and agent profile configuration.">
                        <DesktopPanel tenantId={tenantId} workspaceId={workspaceId} />
                        <div style={{ marginTop: 20 }}>
                            <DesktopStreamPanel tenantId={tenantId} />
                        </div>
                    </TabShell>
                )}
            </div>
        </div>
    );
}
