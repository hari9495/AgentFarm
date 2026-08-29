'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import {
    Activity, History, List, RefreshCw, Layers,
    Radio, Package, ChevronDown, Bot, Plug,
} from 'lucide-react';
import { LiveTaskFeed } from '../components/live-task-feed';
import TaskHistoryPanel from '../components/task-history-panel';
import TaskQueuePanel from '../components/task-queue-panel';
import TaskRetryPanel from '../components/task-retry-panel';
import RuntimeObservabilityWrapper from '../components/runtime-observability-wrapper';
import ReproPackPanel from '../components/repro-pack-panel';
import SseStreamPanel from '../components/sse-stream-panel';
import { WF_CSS, WfThemeToggle } from '../components/editorial';

type Tab = 'live' | 'history' | 'queue' | 'retry' | 'runtime' | 'repro' | 'sse';

const TABS: { key: Tab; label: string; icon: React.ElementType; needsBot?: boolean }[] = [
    { key: 'live', label: 'Live Feed', icon: Radio },
    { key: 'history', label: 'History', icon: History },
    { key: 'queue', label: 'Queue + DAG', icon: Layers },
    { key: 'retry', label: 'Retry', icon: RefreshCw, needsBot: true },
    { key: 'runtime', label: 'Runtime', icon: Activity, needsBot: true },
    { key: 'repro', label: 'Repro Packs', icon: Package, needsBot: true },
    { key: 'sse', label: 'SSE Stream', icon: Plug },
];

// ── Bot ID input — shown inline inside tabs that need it ──────────────────────

function BotIdInput({ botId, setBotId }: { botId: string; setBotId: (v: string) => void }) {
    return (
        <div style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '14px 16px', background: 'color-mix(in srgb, var(--signal) 5%, transparent)',
            borderLeft: '2px solid var(--signal)', border: '1px solid var(--rule)', marginBottom: 16,
        }}>
            <div style={{ width: 30, height: 30, border: '1px solid var(--rule)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Bot size={14} color="var(--signal)" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div className="wf-eyebrow" style={{ color: 'var(--signal)', marginBottom: 5 }}>Bot ID required</div>
                <input
                    value={botId}
                    onChange={e => setBotId(e.target.value)}
                    placeholder="Enter a Bot ID to load this panel…"
                    className="wf-mono"
                    style={{
                        width: '100%', maxWidth: 360, padding: '7px 11px',
                        border: '1px solid var(--rule)', background: 'var(--panel)',
                        color: 'var(--ink)', fontSize: 13, outline: 'none',
                    }}
                    autoFocus
                />
            </div>
        </div>
    );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function TasksPageClient({
    tenantId,
    workspaceIds,
}: {
    tenantId: string;
    workspaceIds: string[];
}) {
    const searchParams = useSearchParams();
    const initialTab = (searchParams.get('tab') as Tab | null) ?? 'live';
    const VALID_TABS = new Set<Tab>(['live', 'history', 'queue', 'retry', 'runtime', 'repro', 'sse']);
    const [activeTab, setActiveTab] = useState<Tab>(VALID_TABS.has(initialTab) ? initialTab : 'live');
    const [workspaceId, setWorkspaceId] = useState(workspaceIds[0] ?? '');
    const [botId, setBotId] = useState('');

    // Sync tab when URL param changes (e.g. sidebar navigation)
    useEffect(() => {
        const t = (searchParams.get('tab') as Tab | null) ?? 'live';
        if (VALID_TABS.has(t)) setActiveTab(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchParams]);

    return (
        <div className="wf" style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
        }}>
            <style>{WF_CSS}</style>

            {/* ── Masthead ────────────────────────────────────────────────── */}
            <header style={{
                background: 'var(--paper)', borderBottom: '1px solid var(--rule)',
                padding: '14px 28px 18px', flexShrink: 0, position: 'sticky', top: 0, zIndex: 10,
            }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                    <Link href="/" className="wf-eyebrow" style={{ textDecoration: 'none' }}>← Dashboard</Link>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {/* Active bot pill — sharp, mono */}
                        {botId.trim() && (
                            <span className="wf-mono" style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 9px', border: '1px solid var(--signal)', color: 'var(--signal)', fontSize: 11 }}>
                                <Bot size={11} />
                                {botId.slice(0, 16)}{botId.length > 16 ? '…' : ''}
                                <button onClick={() => setBotId('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--signal)', padding: 0, lineHeight: 1, marginLeft: 2, fontSize: 13 }}>×</button>
                            </span>
                        )}
                        {/* Workspace selector */}
                        {workspaceIds.length > 0 && (
                            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                                <select
                                    value={workspaceId}
                                    onChange={e => setWorkspaceId(e.target.value)}
                                    className="wf-mono"
                                    style={{ padding: '6px 26px 6px 10px', border: '1px solid var(--rule)', background: 'var(--panel)', color: 'var(--ink)', fontSize: 11, appearance: 'none', cursor: 'pointer', outline: 'none' }}
                                >
                                    <option value="">All workspaces</option>
                                    {workspaceIds.map(id => <option key={id} value={id}>{id.slice(0, 20)}…</option>)}
                                </select>
                                <ChevronDown size={11} style={{ position: 'absolute', right: 9, pointerEvents: 'none', color: 'var(--ink-muted)' }} />
                            </div>
                        )}
                        <WfThemeToggle />
                    </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24 }}>
                    <div>
                        <div className="wf-eyebrow" style={{ marginBottom: 5 }}>Task Execution — Runtime Ledger</div>
                        <h1 className="wf-display" style={{ margin: 0, fontSize: 36, lineHeight: 0.95, color: 'var(--ink)' }}>Tasks</h1>
                    </div>
                </div>
            </header>

            {/* ── Tab bar — Swiss index ───────────────────────────────────── */}
            <div style={{ background: 'var(--paper)', borderBottom: '1px solid var(--rule)', padding: '0 28px', display: 'flex', gap: 0, overflowX: 'auto' }}>
                {TABS.map(({ key, label, icon: Icon, needsBot }) => {
                    const active = activeTab === key;
                    const needsBotUnset = needsBot && !botId.trim();
                    return (
                        <button
                            key={key}
                            type="button"
                            onClick={() => setActiveTab(key)}
                            className="wf-eyebrow"
                            style={{
                                display: 'flex', alignItems: 'center', gap: 6,
                                padding: '14px 14px',
                                background: 'transparent', border: 'none', borderRadius: 0,
                                borderBottom: `2px solid ${active ? 'var(--signal)' : 'transparent'}`,
                                cursor: 'pointer',
                                color: active ? 'var(--signal)' : 'var(--ink-muted)',
                                marginBottom: -1, whiteSpace: 'nowrap',
                            }}
                        >
                            <Icon size={13} />
                            {label}
                            {needsBotUnset && (
                                <span style={{ width: 5, height: 5, background: 'var(--ink-muted)', flexShrink: 0 }} />
                            )}
                        </button>
                    );
                })}
            </div>

            {/* ── Content ─────────────────────────────────────────────────── */}
            <div style={{ flex: 1, padding: 28, overflow: 'auto' }}>

                {activeTab === 'live' && (
                    <TabShell title="Live Task Feed" icon={Radio} description="Real-time SSE stream. Events appear as they're emitted by the runtime engine.">
                        <LiveTaskFeed workspaceId={workspaceId || undefined} />
                    </TabShell>
                )}

                {activeTab === 'history' && (
                    <TabShell title="Task History" icon={History} description="Full log of all task executions. Filter by outcome, provider, bot, or date range.">
                        <TaskHistoryPanel tenantId={tenantId} />
                    </TabShell>
                )}

                {activeTab === 'queue' && (
                    <TabShell title="Task Queue & Dependency Graph" icon={Layers} description="View queued tasks, re-prioritise entries, flush stale items, and visualise multi-step task DAGs.">
                        <TaskQueuePanel tenantId={tenantId} />
                    </TabShell>
                )}

                {activeTab === 'retry' && (
                    <TabShell title="Task Retry" icon={RefreshCw} description="Manually retry failed tasks for a specific bot.">
                        {!botId.trim()
                            ? <BotIdInput botId={botId} setBotId={setBotId} />
                            : <TaskRetryPanel botId={botId} workspaceId={workspaceId || undefined} />
                        }
                    </TabShell>
                )}

                {activeTab === 'runtime' && (
                    <TabShell title="Runtime Status, Logs & Transcripts" icon={Activity} description="Per-agent health, state machine, live logs, conversation transcripts, and capability snapshot.">
                        {!botId.trim()
                            ? <BotIdInput botId={botId} setBotId={setBotId} />
                            : <RuntimeObservabilityWrapper botId={botId} />
                        }
                    </TabShell>
                )}

                {activeTab === 'repro' && (
                    <TabShell title="Repro Packs" icon={Package} description="Create reproducible bug-report bundles from task executions. Bundles include full context for offline debugging.">
                        {!botId.trim()
                            ? <BotIdInput botId={botId} setBotId={setBotId} />
                            : <ReproPackPanel botId={botId} />
                        }
                    </TabShell>
                )}

                {activeTab === 'sse' && (
                    <TabShell title="SSE Task Stream — API Reference" icon={Plug} description="Connect external tools (Slack, PagerDuty, mobile apps, CI pipelines) to the live task event stream. No polling required.">
                        <SseStreamPanel workspaceId={workspaceId || undefined} />
                    </TabShell>
                )}
            </div>
        </div>
    );
}

// ── Shared tab shell ──────────────────────────────────────────────────────────

function TabShell({
    title, icon: Icon, description, children,
}: {
    title: string;
    icon: React.ElementType;
    description: string;
    children: React.ReactNode;
}) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Section header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ width: 34, height: 34, border: '1px solid var(--rule)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                    <Icon size={16} color="var(--signal)" />
                </div>
                <div>
                    <h2 className="wf-display" style={{ margin: 0, fontSize: 20, color: 'var(--ink)' }}>{title}</h2>
                    <p style={{ margin: '3px 0 0', fontSize: 13, color: 'var(--ink-muted)', lineHeight: 1.45 }}>{description}</p>
                </div>
            </div>

            {/* Content panel — hairline, no radius */}
            <div className="wf-panel" style={{ padding: 20 }}>
                {children}
            </div>
        </div>
    );
}
