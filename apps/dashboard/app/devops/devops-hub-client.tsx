'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Wrench, GitPullRequest, Cpu, RefreshCw, GitBranch, Beaker } from 'lucide-react';
import CiTriagePanel from '../components/ci-triage-panel';
import PrDraftsPanel from '../components/pr-drafts-panel';
import HandoffsPanel from '../components/handoffs-panel';
import AutonomousLoopsPanel from '../components/autonomous-loops-panel';
import AbTestsPanel from '../components/ab-tests-panel';

type Tab = 'ci' | 'pr' | 'handoffs' | 'loops' | 'abtests';

const TABS = [
    { key: 'ci'       as Tab, label: 'CI Triage',       icon: Cpu,           desc: 'Intake CI failures, view triage results'            },
    { key: 'pr'       as Tab, label: 'PR Drafts',        icon: GitPullRequest, desc: 'Review, publish, or discard AI-generated PRs'     },
    { key: 'handoffs' as Tab, label: 'Handoffs',         icon: GitBranch,     desc: 'View and complete pending agent handoff queue'      },
    { key: 'loops'    as Tab, label: 'Autonomous Loops', icon: RefreshCw,     desc: 'Create and manage self-repeating agent loops'       },
    { key: 'abtests'  as Tab, label: 'A/B Tests',        icon: Beaker,        desc: 'Create and monitor agent A/B experiments'          },
];

function TabShell({ title, icon: Icon, description, children }: {
    title: string; icon: React.ElementType; description: string; children: React.ReactNode;
}) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(0,102,204,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                    <Icon size={16} color="#0066cc" />
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

export default function DevOpsHubClient({ tenantId, workspaceId }: { tenantId: string; workspaceId: string }) {
    const [activeTab, setActiveTab] = useState<Tab>('ci');

    return (
        <div style={{ minHeight: '100vh', background: 'var(--bg)', fontFamily: "var(--font-inter), -apple-system, sans-serif", display: 'flex', flexDirection: 'column' }}>
            <header style={{ height: 56, background: 'var(--card)', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', padding: '0 20px', gap: 12, flexShrink: 0, position: 'sticky', top: 0, zIndex: 10 }}>
                <Link href="/" style={{ color: 'var(--ink-muted)', fontSize: 13, textDecoration: 'none', fontWeight: 500 }}>← Dashboard</Link>
                <span style={{ color: 'var(--line-strong)' }}>|</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(0,102,204,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Wrench size={14} color="#0066cc" />
                    </div>
                    <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', letterSpacing: '-0.02em' }}>DevOps & Developer Tools</span>
                </div>
            </header>

            <div style={{ background: 'var(--card)', borderBottom: '1px solid var(--line)', padding: '0 20px', display: 'flex', gap: 0, overflowX: 'auto' }}>
                {TABS.map(({ key, label, icon: Icon }) => {
                    const active = activeTab === key;
                    return (
                        <button key={key} type="button" onClick={() => setActiveTab(key)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '13px 14px', background: 'transparent', border: 'none', borderBottom: `2px solid ${active ? '#0066cc' : 'transparent'}`, cursor: 'pointer', color: active ? '#0066cc' : 'var(--ink-muted)', fontSize: 13, fontWeight: active ? 600 : 500, transition: 'all 0.15s', marginBottom: -1, whiteSpace: 'nowrap' }}>
                            <Icon size={13} />{label}
                        </button>
                    );
                })}
            </div>

            <div style={{ flex: 1, padding: 20, overflow: 'auto' }}>
                {activeTab === 'ci' && <TabShell icon={Cpu} title="CI Triage" description="Intake CI pipeline failures, view AI-generated root-cause analysis, and track resolution status."><CiTriagePanel workspaceId={workspaceId} /></TabShell>}
                {activeTab === 'pr' && <TabShell icon={GitPullRequest} title="PR Drafts" description="Review AI-generated pull request drafts awaiting human sign-off. Publish, edit, or discard each draft."><PrDraftsPanel tenantId={tenantId} workspaceId={workspaceId} /></TabShell>}
                {activeTab === 'handoffs' && <TabShell icon={GitBranch} title="Agent Handoffs" description="View and complete pending handoffs between agents. Handoffs occur when one agent delegates work to another."><HandoffsPanel tenantId={tenantId} workspaceId={workspaceId} /></TabShell>}
                {activeTab === 'loops' && <TabShell icon={RefreshCw} title="Autonomous Loops" description="Create and manage self-repeating agent loops — tasks that run on a schedule or trigger condition automatically."><AutonomousLoopsPanel /></TabShell>}
                {activeTab === 'abtests' && <TabShell icon={Beaker} title="A/B Tests" description="Create agent A/B experiments, configure variants, and monitor which performs better on real tasks."><AbTestsPanel tenantId={tenantId} /></TabShell>}
            </div>
        </div>
    );
}
