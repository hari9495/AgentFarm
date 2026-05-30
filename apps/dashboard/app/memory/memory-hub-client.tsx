'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Brain, BookOpen, Layers, Network, Search } from 'lucide-react';
import MemoryBrowserPanel from '../components/memory-browser-panel';
import AgentEpisodicMemoryPanel from '../components/agent-episodic-memory-panel';
import WorkMemoryPanel from '../components/work-memory-panel';
import AgentMemoryPatternFetcher from '../components/agent-memory-pattern-fetcher';
import { KnowledgeGraphExplorer } from '../components/knowledge-graph-explorer';

// ── Types ─────────────────────────────────────────────────────────────────────

type Tab = 'episodic' | 'work' | 'patterns' | 'knowledge' | 'search';

const TABS: { key: Tab; label: string; icon: React.ElementType; desc: string }[] = [
    { key: 'episodic',  label: 'Episodic Memory',    icon: Brain,   desc: 'Long-term learned patterns per agent'        },
    { key: 'work',      label: 'Work Memory',         icon: Layers,  desc: 'Per-workspace short-term working memory'     },
    { key: 'patterns',  label: 'Memory Patterns',     icon: BookOpen,desc: 'High-confidence patterns + reinforce'        },
    { key: 'knowledge', label: 'Knowledge Graph',     icon: Network, desc: 'Symbols, relationships, snapshots'           },
    { key: 'search',    label: 'Memory Search',       icon: Search,  desc: 'Full-text + semantic search across all stores'},
];

// ── Tab shell ─────────────────────────────────────────────────────────────────

function TabShell({
    title, icon: Icon, description, children,
}: {
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

// ── Bot ID input (for episodic + patterns that need a bot ID) ─────────────────

function BotIdInput({ botId, setBotId }: { botId: string; setBotId: (v: string) => void }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'rgba(0,102,204,0.04)', border: '1px solid rgba(0,102,204,0.15)', borderRadius: 12, marginBottom: 14 }}>
            <Brain size={14} color="#0066cc" style={{ flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#0066cc', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>Bot ID (optional — leave blank to search all)</div>
                <input
                    value={botId} onChange={e => setBotId(e.target.value)}
                    placeholder="Enter a Bot ID to filter by agent…"
                    style={{ width: '100%', maxWidth: 360, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--ink)', fontSize: 13, outline: 'none', fontFamily: 'ui-monospace, monospace' }}
                />
            </div>
        </div>
    );
}

// ── Main hub ──────────────────────────────────────────────────────────────────

export default function MemoryHubClient({
    tenantId,
    workspaceId,
}: {
    tenantId: string;
    workspaceId: string;
}) {
    const [activeTab, setActiveTab] = useState<Tab>('episodic');
    const [botId, setBotId] = useState('');

    return (
        <div style={{
            minHeight: '100vh', background: 'var(--bg)',
            fontFamily: "var(--font-inter), -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
            display: 'flex', flexDirection: 'column',
        }}>
            {/* ── Top bar ──────────────────────────────────────────────── */}
            <header style={{
                height: 56, background: 'var(--card)', borderBottom: '1px solid var(--line)',
                display: 'flex', alignItems: 'center', padding: '0 20px', gap: 12,
                flexShrink: 0, position: 'sticky', top: 0, zIndex: 10,
            }}>
                <Link href="/" style={{ color: 'var(--ink-muted)', fontSize: 13, textDecoration: 'none', fontWeight: 500 }}>← Dashboard</Link>
                <span style={{ color: 'var(--line-strong)' }}>|</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(0,102,204,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Brain size={14} color="#0066cc" />
                    </div>
                    <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', letterSpacing: '-0.02em' }}>Memory & Knowledge</span>
                </div>
                {workspaceId && (
                    <div style={{ marginLeft: 8, display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 9999, background: 'rgba(0,102,204,0.07)', border: '1px solid rgba(0,102,204,0.2)', fontSize: 11, color: '#0066cc', fontWeight: 600, fontFamily: 'monospace' }}>
                        ws: {workspaceId.slice(0, 18)}
                    </div>
                )}
            </header>

            {/* ── Tab bar ──────────────────────────────────────────────── */}
            <div style={{ background: 'var(--card)', borderBottom: '1px solid var(--line)', padding: '0 20px', display: 'flex', gap: 0, overflowX: 'auto' }}>
                {TABS.map(({ key, label, icon: Icon }) => {
                    const active = activeTab === key;
                    return (
                        <button key={key} type="button" onClick={() => setActiveTab(key)} style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            padding: '13px 14px', background: 'transparent', border: 'none',
                            borderBottom: `2px solid ${active ? '#0066cc' : 'transparent'}`,
                            cursor: 'pointer', color: active ? '#0066cc' : 'var(--ink-muted)',
                            fontSize: 13, fontWeight: active ? 600 : 500,
                            transition: 'all 0.15s', marginBottom: -1, whiteSpace: 'nowrap',
                        }}>
                            <Icon size={13} />
                            {label}
                        </button>
                    );
                })}
            </div>

            {/* ── Content ──────────────────────────────────────────────── */}
            <div style={{ flex: 1, padding: 20, overflow: 'auto' }}>

                {/* Episodic Memory — long-term learned patterns per agent */}
                {activeTab === 'episodic' && (
                    <TabShell
                        icon={Brain}
                        title="Episodic Memory"
                        description="Long-term memory records stored in AgentLongTermMemory. Each record is a lesson an agent learned from task outcomes — patterns, failures, successes. Search and redact individual records."
                    >
                        <BotIdInput botId={botId} setBotId={setBotId} />
                        <AgentEpisodicMemoryPanel defaultBotId={botId} />
                    </TabShell>
                )}

                {/* Work Memory — per-workspace short-term context */}
                {activeTab === 'work' && (
                    <TabShell
                        icon={Layers}
                        title="Work Memory"
                        description="Short-term working memory for the active workspace — current goals, next actions, and task context that agents maintain while executing a workflow."
                    >
                        <WorkMemoryPanel tenantId={tenantId} workspaceId={workspaceId} />
                    </TabShell>
                )}

                {/* Memory Patterns — high-confidence learned behaviours + reinforce */}
                {activeTab === 'patterns' && (
                    <TabShell
                        icon={BookOpen}
                        title="Memory Patterns"
                        description="High-confidence patterns extracted from episodic memory. These are distilled lessons that agents apply to future tasks. You can manually reinforce a pattern to boost its confidence score."
                    >
                        <BotIdInput botId={botId} setBotId={setBotId} />
                        <AgentMemoryPatternFetcher botId={botId} />
                    </TabShell>
                )}

                {/* Knowledge Graph — symbols, relationships, snapshots */}
                {activeTab === 'knowledge' && (
                    <TabShell
                        icon={Network}
                        title="Knowledge Graph"
                        description="Repository symbol index, call graph relationships, and semantic suggestions. Agents use this to understand codebases, navigate dependencies, and make architecture-aware decisions. Includes point-in-time snapshots."
                    >
                        <KnowledgeGraphExplorer />
                    </TabShell>
                )}

                {/* Memory Search — full-text + semantic across all stores */}
                {activeTab === 'search' && (
                    <TabShell
                        icon={Search}
                        title="Memory Search"
                        description="Full-text and semantic search across all memory stores — episodic records, work memory, learned patterns. Find any memory entry an agent has stored."
                    >
                        <MemoryBrowserPanel />
                    </TabShell>
                )}
            </div>
        </div>
    );
}
