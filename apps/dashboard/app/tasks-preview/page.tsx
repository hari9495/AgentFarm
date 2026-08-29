'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'motion/react';
import { Radio, Layers, History as HistoryIcon, Circle } from 'lucide-react';
import { UiKit, Masthead, Button, Badge, Eyebrow, Display, Stat, Tabs } from '../components/ui-kit';
import { WfThemeToggle } from '../components/editorial';

type Status = 'ok' | 'warn' | 'err' | 'accent';
type Ev = { id: number; t: string; action: string; provider: string; status: Status; label: string; ms: number };

const ACTIONS = [
    { action: 'connector_execute', provider: 'jira' },
    { action: 'llm_dispatch', provider: 'anthropic' },
    { action: 'code_generate', provider: 'nvidia' },
    { action: 'memory_write', provider: 'pgvector' },
    { action: 'connector_execute', provider: 'slack' },
    { action: 'approval_decision', provider: 'gateway' },
    { action: 'task_dispatch', provider: 'runtime' },
    { action: 'mcp_tool_call', provider: 'filesystem' },
];
const OUTCOMES: { status: Status; label: string }[] = [
    { status: 'ok', label: 'done' }, { status: 'ok', label: 'done' }, { status: 'ok', label: 'done' },
    { status: 'accent', label: 'running' }, { status: 'warn', label: 'retried' }, { status: 'err', label: 'failed' },
];

function pick<T>(a: T[]) { return a[Math.floor(Math.random() * a.length)]; }

const QUEUE = [
    { id: 'TQ-9042', action: 'code_generate · PR #218', prio: 'high', deps: 'waits on lint pass' },
    { id: 'TQ-9041', action: 'connector_execute · jira bulk', prio: 'medium', deps: '3 sub-tasks' },
    { id: 'TQ-9039', action: 'memory_reindex · workspace', prio: 'low', deps: '—' },
    { id: 'TQ-9036', action: 'meeting_analyze · transcript', prio: 'medium', deps: 'waits on STT' },
];
const HISTORY = [
    { t: '18:02:41', action: 'code_generate · PR #217', provider: 'nvidia', dur: '4.2s', status: 'ok' as Status, label: 'merged' },
    { t: '18:01:58', action: 'connector_execute · github', provider: 'github', dur: '0.9s', status: 'ok' as Status, label: 'done' },
    { t: '18:00:12', action: 'send_outreach · gmail', provider: 'gmail', dur: '1.4s', status: 'warn' as Status, label: 'gated' },
    { t: '17:58:47', action: 'task_dispatch · retry', provider: 'runtime', dur: '2.1s', status: 'err' as Status, label: 'failed' },
    { t: '17:57:03', action: 'llm_dispatch · summary', provider: 'openai', dur: '3.0s', status: 'ok' as Status, label: 'done' },
];
const PRIO_TONE: Record<string, Status> = { high: 'err', medium: 'warn', low: 'ok' };

export default function TasksPreview() {
    const [tab, setTab] = useState<'live' | 'queue' | 'history'>('live');
    const [feed, setFeed] = useState<Ev[]>([]);
    const idRef = useRef(0);

    useEffect(() => {
        const now = () => new Date().toLocaleTimeString('en-GB', { hour12: false });
        // seed a few
        setFeed(Array.from({ length: 6 }, () => {
            const a = pick(ACTIONS); const o = pick(OUTCOMES);
            return { id: idRef.current++, t: now(), action: a.action, provider: a.provider, status: o.status, label: o.label, ms: 300 + Math.floor(Math.random() * 4000) };
        }));
        const iv = setInterval(() => {
            const a = pick(ACTIONS); const o = pick(OUTCOMES);
            setFeed((f) => [{ id: idRef.current++, t: now(), action: a.action, provider: a.provider, status: o.status, label: o.label, ms: 300 + Math.floor(Math.random() * 4000) }, ...f].slice(0, 14));
        }, 1900);
        return () => clearInterval(iv);
    }, []);

    return (
        <UiKit style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
            <Masthead
                eyebrow="Runtime — Task Execution"
                title="Tasks"
                actions={<>
                    <Link href="/command-center-preview" className="uk-eyebrow" style={{ textDecoration: 'none', alignSelf: 'center' }}>← Command center</Link>
                    <WfThemeToggle />
                    <Button variant="ghost" size="sm">Export</Button>
                </>}
                stats={<>
                    <Stat n="03" k="Running" tone="accent" />
                    <Stat n="04" k="Queued" tone="warn" />
                    <Stat n="1,204" k="Done today" tone="ok" />
                </>}
            />

            <div style={{ padding: '0 28px' }}>
                <Tabs
                    active={tab}
                    onChange={setTab}
                    tabs={[
                        { key: 'live', label: 'Live Feed', icon: <Radio size={13} /> },
                        { key: 'queue', label: 'Queue', icon: <Layers size={13} /> },
                        { key: 'history', label: 'History', icon: <HistoryIcon size={13} /> },
                    ]}
                />
            </div>

            <div style={{ flex: 1, padding: 28, overflowY: 'auto' }}>
                {tab === 'live' && (
                    <div style={{ maxWidth: 860 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                            <Circle size={8} fill="var(--accent)" stroke="none" style={{ animation: 'tp-pulse 1.6s ease-in-out infinite' }} />
                            <Eyebrow>Live · SSE stream from the runtime engine</Eyebrow>
                            <style>{`@keyframes tp-pulse{0%,100%{opacity:1}50%{opacity:.3}}`}</style>
                        </div>
                        <div style={{ border: '1px solid var(--line)', borderRadius: 3, overflow: 'hidden' }}>
                            <AnimatePresence initial={false}>
                                {feed.map((e) => (
                                    <motion.div key={e.id}
                                        initial={{ opacity: 0, height: 0, backgroundColor: 'color-mix(in srgb, var(--accent) 10%, transparent)' }}
                                        animate={{ opacity: 1, height: 'auto', backgroundColor: 'rgba(0,0,0,0)' }}
                                        exit={{ opacity: 0 }}
                                        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                                        style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 16px', borderBottom: '1px solid var(--line)' }}>
                                        <span className="uk-mono" style={{ fontSize: 11.5, color: 'var(--ink-muted)', width: 68, flexShrink: 0 }}>{e.t}</span>
                                        <span className="uk-mono" style={{ fontSize: 12.5, color: 'var(--ink)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.action}</span>
                                        <span className="uk-mono" style={{ fontSize: 11, color: 'var(--ink-muted)', width: 84, flexShrink: 0 }}>{e.provider}</span>
                                        <span className="uk-mono" style={{ fontSize: 11, color: 'var(--ink-muted)', width: 56, textAlign: 'right', flexShrink: 0 }}>{(e.ms / 1000).toFixed(1)}s</span>
                                        <span style={{ width: 74, flexShrink: 0, textAlign: 'right' }}><Badge tone={e.status}>{e.label}</Badge></span>
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                        </div>
                    </div>
                )}

                {tab === 'queue' && (
                    <div style={{ maxWidth: 760, display: 'grid', gap: 10 }}>
                        <Eyebrow style={{ marginBottom: 4 }}>Queued · re-prioritise or flush</Eyebrow>
                        {QUEUE.map((q) => (
                            <div key={q.id} className="uk-panel" style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14 }}>
                                <Layers size={15} color="var(--ink-muted)" style={{ flexShrink: 0 }} />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div className="uk-mono" style={{ fontSize: 13, color: 'var(--ink)' }}>{q.action}</div>
                                    <div className="uk-mono" style={{ fontSize: 10.5, color: 'var(--ink-muted)', marginTop: 3 }}>{q.id} · {q.deps}</div>
                                </div>
                                <Badge tone={PRIO_TONE[q.prio]}>{q.prio}</Badge>
                                <Button variant="ghost" size="sm">Bump</Button>
                            </div>
                        ))}
                    </div>
                )}

                {tab === 'history' && (
                    <div style={{ maxWidth: 900 }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
                            <Display size={20}>Execution history</Display>
                            <Eyebrow>{String(HISTORY.length).padStart(2, '0')} recent</Eyebrow>
                        </div>
                        <table className="uk-ledger">
                            <thead><tr><th>Timestamp</th><th>Task</th><th>Provider</th><th>Duration</th><th>Outcome</th></tr></thead>
                            <tbody>
                                {HISTORY.map((h) => (
                                    <tr key={h.t}>
                                        <td className="uk-num">{h.t}</td>
                                        <td>{h.action}</td>
                                        <td className="uk-num">{h.provider}</td>
                                        <td className="uk-num">{h.dur}</td>
                                        <td><Badge tone={h.status}>{h.label}</Badge></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </UiKit>
    );
}
