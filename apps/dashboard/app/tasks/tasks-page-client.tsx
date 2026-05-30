'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
    Activity, History, List, RefreshCw, Layers,
    Radio, Package, ChevronDown, Bot, Plug, ListChecks,
} from 'lucide-react';
import { LiveTaskFeed } from '../components/live-task-feed';
import TaskHistoryPanel from '../components/task-history-panel';
import TaskQueuePanel from '../components/task-queue-panel';
import TaskRetryPanel from '../components/task-retry-panel';
import RuntimeObservabilityWrapper from '../components/runtime-observability-wrapper';
import ReproPackPanel from '../components/repro-pack-panel';
import SseStreamPanel from '../components/sse-stream-panel';

type Tab = 'live' | 'history' | 'queue' | 'retry' | 'runtime' | 'repro' | 'sse';

const TABS: { key: Tab; label: string; icon: React.ElementType; needsBot?: boolean }[] = [
    { key: 'live',    label: 'Live Feed',   icon: Radio },
    { key: 'history', label: 'History',     icon: History },
    { key: 'queue',   label: 'Queue + DAG', icon: Layers },
    { key: 'retry',   label: 'Retry',       icon: RefreshCw, needsBot: true },
    { key: 'runtime', label: 'Runtime',     icon: Activity,  needsBot: true },
    { key: 'repro',   label: 'Repro Packs', icon: Package,   needsBot: true },
    { key: 'sse',     label: 'SSE Stream',  icon: Plug },
];

// ── Bot ID input — shown inline inside tabs that need it ──────────────────────

function BotIdInput({ botId, setBotId }: { botId: string; setBotId: (v: string) => void }) {
    return (
        <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '12px 16px', background: 'rgba(0,102,204,0.04)',
            border: '1px solid rgba(0,102,204,0.15)', borderRadius: 12, marginBottom: 16,
        }}>
            <div style={{ width: 30, height: 30, borderRadius: 9, background: 'rgba(0,102,204,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Bot size={14} color="#0066cc" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#0066cc', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>Bot ID required</div>
                <input
                    value={botId}
                    onChange={e => setBotId(e.target.value)}
                    placeholder="Enter a Bot ID to load this panel…"
                    style={{
                        width: '100%', maxWidth: 360, padding: '7px 11px', borderRadius: 9,
                        border: '1px solid #d2d2d7', background: '#fff',
                        color: '#1d1d1f', fontSize: 13, outline: 'none',
                        fontFamily: 'ui-monospace, monospace',
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
    const [activeTab, setActiveTab] = useState<Tab>('live');
    const [workspaceId, setWorkspaceId] = useState(workspaceIds[0] ?? '');
    const [botId, setBotId] = useState('');

    return (
        <div style={{
            minHeight: '100vh',
            background: '#f5f5f7',
            fontFamily: "var(--font-inter), -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
            display: 'flex',
            flexDirection: 'column',
        }}>

            {/* ── Top bar ────────────────────────────────────────────────── */}
            <header style={{
                height: 56, background: '#ffffff', borderBottom: '1px solid #d2d2d7',
                display: 'flex', alignItems: 'center', padding: '0 20px', gap: 12,
                flexShrink: 0, position: 'sticky', top: 0, zIndex: 10,
            }}>
                <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#6e6e73', fontSize: 13, textDecoration: 'none', fontWeight: 500, flexShrink: 0 }}>
                    ← Dashboard
                </Link>
                <span style={{ color: '#d2d2d7', flexShrink: 0 }}>|</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(0,102,204,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <ListChecks size={14} color="#0066cc" />
                    </div>
                    <span style={{ fontSize: 15, fontWeight: 700, color: '#1d1d1f', letterSpacing: '-0.02em' }}>
                        Tasks
                    </span>
                </div>

                {/* Workspace selector — only relevant control in the header */}
                {workspaceIds.length > 0 && (
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', marginLeft: 8 }}>
                        <select
                            value={workspaceId}
                            onChange={e => setWorkspaceId(e.target.value)}
                            style={{ padding: '5px 28px 5px 10px', borderRadius: 9999, border: '1px solid #d2d2d7', background: '#fff', color: '#1d1d1f', fontSize: 12, fontWeight: 500, appearance: 'none', cursor: 'pointer', outline: 'none' }}
                        >
                            <option value="">All workspaces</option>
                            {workspaceIds.map(id => <option key={id} value={id}>{id.slice(0, 20)}…</option>)}
                        </select>
                        <ChevronDown size={11} style={{ position: 'absolute', right: 9, pointerEvents: 'none', color: '#6e6e73' }} />
                    </div>
                )}

                {/* Active bot pill — shown only when bot is set */}
                {botId.trim() && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 9999, background: 'rgba(0,102,204,0.07)', border: '1px solid rgba(0,102,204,0.2)', fontSize: 12, color: '#0066cc', fontWeight: 600, fontFamily: 'monospace' }}>
                        <Bot size={11} color="#0066cc" />
                        {botId.slice(0, 16)}{botId.length > 16 ? '…' : ''}
                        <button onClick={() => setBotId('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#0066cc', padding: 0, lineHeight: 1, marginLeft: 2, fontSize: 13 }}>×</button>
                    </div>
                )}
            </header>

            {/* ── Tab bar ─────────────────────────────────────────────────── */}
            <div style={{ background: '#ffffff', borderBottom: '1px solid #d2d2d7', padding: '0 20px', display: 'flex', gap: 0, overflowX: 'auto' }}>
                {TABS.map(({ key, label, icon: Icon, needsBot }) => {
                    const active = activeTab === key;
                    const needsBotUnset = needsBot && !botId.trim();
                    return (
                        <button
                            key={key}
                            type="button"
                            onClick={() => setActiveTab(key)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 6,
                                padding: '13px 14px',
                                background: 'transparent', border: 'none',
                                borderBottom: `2px solid ${active ? '#0066cc' : 'transparent'}`,
                                cursor: 'pointer',
                                color: active ? '#0066cc' : needsBotUnset ? '#aeaeb2' : '#6e6e73',
                                fontSize: 13, fontWeight: active ? 600 : 500,
                                transition: 'all 0.15s', marginBottom: -1,
                                whiteSpace: 'nowrap',
                            }}
                        >
                            <Icon size={13} />
                            {label}
                            {needsBotUnset && (
                                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#d2d2d7', flexShrink: 0 }} />
                            )}
                        </button>
                    );
                })}
            </div>

            {/* ── Content ─────────────────────────────────────────────────── */}
            <div style={{ flex: 1, padding: 20, overflow: 'auto' }}>

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
                            : <TaskRetryPanel botId={botId} />
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
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(0,102,204,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                    <Icon size={16} color="#0066cc" />
                </div>
                <div>
                    <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#1d1d1f', letterSpacing: '-0.02em' }}>{title}</h2>
                    <p style={{ margin: '3px 0 0', fontSize: 13, color: '#6e6e73', lineHeight: 1.45 }}>{description}</p>
                </div>
            </div>

            {/* Content card */}
            <div style={{ background: '#ffffff', border: '1px solid #d2d2d7', borderRadius: 18, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                {children}
            </div>
        </div>
    );
}
