'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
    Activity, History, List, RefreshCw, Layers,
    Radio, Package, ChevronDown, Bot,
} from 'lucide-react';
import { LiveTaskFeed } from '../components/live-task-feed';
import TaskHistoryPanel from '../components/task-history-panel';
import TaskQueuePanel from '../components/task-queue-panel';
import TaskRetryPanel from '../components/task-retry-panel';
import RuntimeObservabilityWrapper from '../components/runtime-observability-wrapper';
import ReproPackPanel from '../components/repro-pack-panel';

// ── Types ─────────────────────────────────────────────────────────────────────

type Tab = 'live' | 'history' | 'queue' | 'retry' | 'runtime' | 'repro';

const TABS: { key: Tab; label: string; icon: React.ElementType; desc: string }[] = [
    { key: 'live',    label: 'Live Feed',    icon: Radio,     desc: 'Real-time SSE task events' },
    { key: 'history', label: 'History',      icon: History,   desc: 'Searchable task log' },
    { key: 'queue',   label: 'Queue + DAG',  icon: Layers,    desc: 'Queued tasks and dependency graph' },
    { key: 'retry',   label: 'Retry',        icon: RefreshCw, desc: 'Manually retry failed tasks' },
    { key: 'runtime', label: 'Runtime',      icon: Activity,  desc: 'Status, logs & transcripts' },
    { key: 'repro',   label: 'Repro Packs',  icon: Package,   desc: 'Bug-report bundles from tasks' },
];

// ── Component ─────────────────────────────────────────────────────────────────

export default function TasksPageClient({
    tenantId,
    workspaceIds,
}: {
    tenantId: string;
    workspaceIds: string[];
}) {
    const [activeTab, setActiveTab] = useState<Tab>('live');
    const [workspaceId, setWorkspaceId] = useState(workspaceIds[0] ?? '');
    const [botId, setBotId] = useState('');

    const ActiveIcon = TABS.find(t => t.key === activeTab)?.icon ?? Activity;

    return (
        <div style={{
            minHeight: '100vh',
            background: '#f5f5f7',
            fontFamily: "var(--font-inter), -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
            display: 'flex',
            flexDirection: 'column',
        }}>
            {/* ── Top bar ─────────────────────────────────────────────────── */}
            <header style={{
                height: 56, background: '#ffffff', borderBottom: '1px solid #d2d2d7',
                display: 'flex', alignItems: 'center', padding: '0 24px', gap: 16,
                flexShrink: 0, position: 'sticky', top: 0, zIndex: 10,
            }}>
                <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#6e6e73', fontSize: 13, textDecoration: 'none', fontWeight: 500 }}>
                    ← Dashboard
                </Link>
                <span style={{ color: '#d2d2d7' }}>|</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(0,102,204,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <List size={14} color="#0066cc" />
                    </div>
                    <span style={{ fontSize: 15, fontWeight: 700, color: '#1d1d1f', letterSpacing: '-0.02em' }}>
                        Task Execution & Runtime
                    </span>
                </div>

                {/* Context selectors */}
                <div style={{ display: 'flex', gap: 8, marginLeft: 16, flexWrap: 'wrap' }}>
                    {workspaceIds.length > 0 && (
                        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                            <select
                                value={workspaceId}
                                onChange={e => setWorkspaceId(e.target.value)}
                                style={{ padding: '5px 28px 5px 10px', borderRadius: 9999, border: '1px solid #d2d2d7', background: '#fff', color: '#1d1d1f', fontSize: 12, fontWeight: 500, appearance: 'none', cursor: 'pointer', outline: 'none' }}
                            >
                                <option value="">All workspaces</option>
                                {workspaceIds.map(id => <option key={id} value={id}>{id.slice(0, 16)}…</option>)}
                            </select>
                            <ChevronDown size={11} style={{ position: 'absolute', right: 9, pointerEvents: 'none', color: '#6e6e73' }} />
                        </div>
                    )}
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                        <Bot size={12} style={{ position: 'absolute', left: 9, color: '#6e6e73', pointerEvents: 'none' }} />
                        <input
                            value={botId}
                            onChange={e => setBotId(e.target.value)}
                            placeholder="Bot ID (for runtime tabs)"
                            style={{ padding: '5px 10px 5px 26px', borderRadius: 9999, border: '1px solid #d2d2d7', background: '#fff', color: '#1d1d1f', fontSize: 12, width: 210, outline: 'none' }}
                        />
                    </div>
                </div>

                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 9999, background: 'rgba(0,102,204,0.07)', border: '1px solid rgba(0,102,204,0.2)' }}>
                        <ActiveIcon size={11} color="#0066cc" />
                        <span style={{ fontSize: 11, fontWeight: 600, color: '#0066cc' }}>
                            {TABS.find(t => t.key === activeTab)?.desc}
                        </span>
                    </div>
                </div>
            </header>

            {/* ── Tab bar ─────────────────────────────────────────────────── */}
            <div style={{ background: '#ffffff', borderBottom: '1px solid #d2d2d7', padding: '0 24px', display: 'flex', gap: 2 }}>
                {TABS.map(({ key, label, icon: Icon }) => (
                    <button
                        key={key}
                        type="button"
                        onClick={() => setActiveTab(key)}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 6, padding: '12px 14px',
                            background: 'transparent', border: 'none', borderBottom: `2px solid ${activeTab === key ? '#0066cc' : 'transparent'}`,
                            cursor: 'pointer', color: activeTab === key ? '#0066cc' : '#6e6e73',
                            fontSize: 13, fontWeight: activeTab === key ? 600 : 500,
                            transition: 'color 0.15s, border-color 0.15s', marginBottom: -1,
                        }}
                    >
                        <Icon size={13} />
                        {label}
                    </button>
                ))}
            </div>

            {/* ── Content ─────────────────────────────────────────────────── */}
            <div style={{ flex: 1, padding: 24, overflow: 'auto' }}>

                {/* Live Feed */}
                {activeTab === 'live' && (
                    <div>
                        <SectionHeader
                            icon={Radio}
                            title="Live Task Feed"
                            description="Real-time SSE stream of task events. Connect to /api/sse/tasks for raw stream access."
                        />
                        <div style={{ background: '#ffffff', border: '1px solid #d2d2d7', borderRadius: 18, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                            <LiveTaskFeed workspaceId={workspaceId || undefined} />
                        </div>
                    </div>
                )}

                {/* Task History */}
                {activeTab === 'history' && (
                    <div>
                        <SectionHeader
                            icon={History}
                            title="Task History"
                            description="Search and filter all task executions — filter by outcome, provider, bot, or date range."
                        />
                        <div style={{ background: '#ffffff', border: '1px solid #d2d2d7', borderRadius: 18, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                            <TaskHistoryPanel tenantId={tenantId} />
                        </div>
                    </div>
                )}

                {/* Task Queue + DAG */}
                {activeTab === 'queue' && (
                    <div>
                        <SectionHeader
                            icon={Layers}
                            title="Task Queue & Dependency Graph"
                            description="View queued tasks, re-prioritise entries, flush stale items, and visualise multi-step task DAGs."
                        />
                        <div style={{ background: '#ffffff', border: '1px solid #d2d2d7', borderRadius: 18, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                            <TaskQueuePanel tenantId={tenantId} />
                        </div>
                    </div>
                )}

                {/* Task Retry */}
                {activeTab === 'retry' && (
                    <div>
                        <SectionHeader
                            icon={RefreshCw}
                            title="Task Retry"
                            description="Manually retry failed tasks for a specific bot. Lists failed runs with retry controls."
                        />
                        <BotIdGuard botId={botId} featureName="task retry">
                            <div style={{ background: '#ffffff', border: '1px solid #d2d2d7', borderRadius: 18, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                                <TaskRetryPanel botId={botId} />
                            </div>
                        </BotIdGuard>
                    </div>
                )}

                {/* Runtime Status, Logs & Transcripts */}
                {activeTab === 'runtime' && (
                    <div>
                        <SectionHeader
                            icon={Activity}
                            title="Runtime Status, Logs & Transcripts"
                            description="Per-agent health, state machine, live logs, conversation transcripts, and capability snapshot."
                        />
                        <BotIdGuard botId={botId} featureName="runtime observability">
                            <RuntimeObservabilityWrapper botId={botId} />
                        </BotIdGuard>
                    </div>
                )}

                {/* Repro Packs */}
                {activeTab === 'repro' && (
                    <div>
                        <SectionHeader
                            icon={Package}
                            title="Repro Packs"
                            description="Create reproducible bug-report bundles from task executions. Bundles include full context for offline debugging."
                        />
                        <BotIdGuard botId={botId} featureName="repro packs">
                            <ReproPackPanel botId={botId} />
                        </BotIdGuard>
                    </div>
                )}
            </div>
        </div>
    );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function SectionHeader({
    icon: Icon,
    title,
    description,
}: {
    icon: React.ElementType;
    title: string;
    description: string;
}) {
    return (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
            <div style={{ width: 38, height: 38, borderRadius: 11, background: 'rgba(0,102,204,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                <Icon size={17} color="#0066cc" />
            </div>
            <div>
                <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#1d1d1f', letterSpacing: '-0.02em' }}>{title}</h2>
                <p style={{ margin: '3px 0 0', fontSize: 13, color: '#6e6e73', lineHeight: 1.4 }}>{description}</p>
            </div>
        </div>
    );
}

function BotIdGuard({ botId, featureName, children }: { botId: string; featureName: string; children: React.ReactNode }) {
    if (!botId.trim()) {
        return (
            <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                padding: 40, background: '#ffffff', border: '1px solid #d2d2d7', borderRadius: 18,
                textAlign: 'center', gap: 8,
            }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(0,102,204,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 4 }}>
                    <Bot size={18} color="#0066cc" />
                </div>
                <div style={{ fontSize: 15, fontWeight: 600, color: '#1d1d1f' }}>Bot ID required</div>
                <div style={{ fontSize: 13, color: '#6e6e73', maxWidth: 280 }}>
                    Enter a Bot ID in the header field above to use {featureName}.
                </div>
            </div>
        );
    }
    return <>{children}</>;
}
