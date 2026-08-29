'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Activity, ExternalLink, Gauge, Coins } from 'lucide-react';
import { UiKit, Masthead, Panel, Button, Badge, Eyebrow, Display, Stat } from '../components/ui-kit';
import { WfThemeToggle } from '../components/editorial';

type Trace = {
    id: string; task: string; agent: string; model: string; tin: number; tout: number;
    cost: number; ms: number; status: 'ok' | 'err'; eval: number; correlation: string;
    spans: { name: string; model: string; ms: number; tok: number; tone: string }[];
};

const A = 'var(--accent)', G = 'var(--ok)', W = 'var(--warn)', M = 'var(--ink-muted)';

const TRACES: Trace[] = [
    { id: 'TR-8f2a1', task: 'code_generate · PR #218', agent: 'developer', model: 'anthropic/claude-opus', tin: 4200, tout: 1800, cost: 0.09, ms: 4200, status: 'ok', eval: 0.92, correlation: 'corr-98f2a1',
        spans: [{ name: 'planner_decision', model: 'claude-opus', ms: 820, tok: 1100, tone: A }, { name: 'risk_classify', model: 'claude-haiku', ms: 300, tok: 400, tone: G }, { name: 'code_generate', model: 'claude-opus', ms: 2600, tok: 3200, tone: A }, { name: 'self_review', model: 'claude-opus', ms: 480, tok: 1300, tone: A }] },
    { id: 'TR-77c1b', task: 'send_outreach · gmail', agent: 'sales-agent', model: 'openai/gpt-4o', tin: 2100, tout: 900, cost: 0.04, ms: 1400, status: 'ok', eval: 0.88, correlation: 'corr-77c1b8',
        spans: [{ name: 'planner_decision', model: 'gpt-4o', ms: 420, tok: 700, tone: G }, { name: 'draft_outreach', model: 'gpt-4o', ms: 980, tok: 2300, tone: G }] },
    { id: 'TR-51aa0', task: 'screen_candidate', agent: 'recruiter', model: 'anthropic/claude-opus', tin: 3100, tout: 1200, cost: 0.06, ms: 2900, status: 'ok', eval: 0.95, correlation: 'corr-51aa02',
        spans: [{ name: 'planner_decision', model: 'claude-opus', ms: 700, tok: 900, tone: A }, { name: 'rank_resume', model: 'claude-opus', ms: 1600, tok: 2200, tone: A }, { name: 'score_fit', model: 'claude-haiku', ms: 600, tok: 1200, tone: G }] },
    { id: 'TR-22b7e', task: 'task_dispatch · retry', agent: 'runtime', model: 'nvidia/llama-3.1', tin: 1200, tout: 400, cost: 0.01, ms: 2100, status: 'err', eval: 0.41, correlation: 'corr-22b7e1',
        spans: [{ name: 'planner_decision', model: 'llama-3.1', ms: 1300, tok: 900, tone: W }, { name: 'execute', model: '—', ms: 800, tok: 0, tone: M }] },
];

const evalTone = (e: number): 'ok' | 'warn' | 'err' => (e >= 0.85 ? 'ok' : e >= 0.6 ? 'warn' : 'err');
const k = (n: number) => (n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n));

export default function ObservabilityPreview() {
    const [selId, setSelId] = useState(TRACES[0].id);
    const sel = TRACES.find((t) => t.id === selId) ?? TRACES[0];
    const total = sel.spans.reduce((a, s) => a + s.ms, 0);
    let cursor = 0;

    return (
        <UiKit style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
            <Masthead
                eyebrow="Observability — LLM Traces & Telemetry"
                title="Observability"
                actions={<>
                    <Link href="/command-center-preview" className="uk-eyebrow" style={{ textDecoration: 'none', alignSelf: 'center' }}>← Command center</Link>
                    <WfThemeToggle />
                    <Button variant="ghost" size="sm">Last 24h</Button>
                </>}
                stats={<>
                    <Stat n="1,204" k="Traces today" tone="accent" />
                    <Stat n="4.8M" k="Tokens" tone="muted" />
                    <Stat n="$61" k="Spend" tone="ok" />
                    <Stat n="2.1s" k="p50 latency" />
                    <Stat n="4.9s" k="p95" tone="warn" />
                </>}
            />

            <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1.1fr', minHeight: 0 }}>
                {/* Left — traces list */}
                <div style={{ borderRight: '1px solid var(--line)', overflowY: 'auto' }}>
                    <div style={{ padding: '14px 24px 8px' }}><Eyebrow>Recent traces</Eyebrow></div>
                    {TRACES.map((t) => {
                        const isSel = t.id === sel.id;
                        return (
                            <button key={t.id} onClick={() => setSelId(t.id)}
                                style={{ width: '100%', textAlign: 'left', display: 'block', padding: '13px 24px', background: isSel ? 'color-mix(in srgb, var(--accent) 7%, transparent)' : 'transparent', border: 'none', borderBottom: '1px solid var(--line)', borderLeft: isSel ? '2px solid var(--accent)' : '2px solid transparent', cursor: 'pointer' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                    <span className="uk-mono" style={{ fontSize: 12.5, color: 'var(--ink)', fontWeight: 600 }}>{t.task}</span>
                                    <span style={{ marginLeft: 'auto' }}><Badge tone={evalTone(t.eval)}>eval {t.eval.toFixed(2)}</Badge></span>
                                </div>
                                <div className="uk-mono" style={{ fontSize: 10.5, color: 'var(--ink-muted)' }}>
                                    {t.id} · {t.agent} · {t.model} · {k(t.tin + t.tout)} tok · ${t.cost.toFixed(2)} · {(t.ms / 1000).toFixed(1)}s
                                    {t.status === 'err' && <span style={{ color: 'var(--danger)' }}> · failed</span>}
                                </div>
                            </button>
                        );
                    })}
                </div>

                {/* Right — trace detail (waterfall) */}
                <div style={{ overflowY: 'auto', padding: 24 }}>
                    <Eyebrow style={{ marginBottom: 6 }}>{sel.id} · {sel.correlation}</Eyebrow>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                        <Display size={20}>{sel.task}</Display>
                        <Badge tone={evalTone(sel.eval)}>eval {sel.eval.toFixed(2)}</Badge>
                        {sel.status === 'err' && <Badge tone="err">failed</Badge>}
                    </div>

                    {/* metrics */}
                    <div style={{ display: 'flex', gap: 28, marginBottom: 22 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}><Gauge size={14} color="var(--accent)" /><span className="uk-mono" style={{ fontSize: 13 }}>{(sel.ms / 1000).toFixed(1)}s</span></div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}><Activity size={14} color="var(--ink-muted)" /><span className="uk-mono" style={{ fontSize: 13, color: 'var(--ink-muted)' }}>{k(sel.tin)} in · {k(sel.tout)} out</span></div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}><Coins size={14} color="var(--ok)" /><span className="uk-mono" style={{ fontSize: 13 }}>${sel.cost.toFixed(2)}</span></div>
                    </div>

                    <Panel title="Trace waterfall" action={<span className="uk-eyebrow">{sel.spans.length} generations</span>}>
                        <div style={{ display: 'grid', gap: 12 }}>
                            {sel.spans.map((s, i) => {
                                const left = (cursor / total) * 100;
                                const width = Math.max(2, (s.ms / total) * 100);
                                cursor += s.ms;
                                return (
                                    <div key={i}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                            <span className="uk-mono" style={{ fontSize: 11.5, color: 'var(--ink)' }}>{s.name}</span>
                                            <span className="uk-mono" style={{ fontSize: 10.5, color: 'var(--ink-muted)' }}>{s.model} · {k(s.tok)} tok · {(s.ms / 1000).toFixed(1)}s</span>
                                        </div>
                                        <div style={{ position: 'relative', height: 8, background: 'var(--bg-deep)', borderRadius: 2, overflow: 'hidden' }}>
                                            <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${left}%`, width: `${width}%`, background: s.tone, borderRadius: 2 }} />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </Panel>

                    <div className="uk-panel" style={{ padding: '12px 16px', marginTop: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span className="uk-mono" style={{ fontSize: 11.5, color: 'var(--ink-muted)' }}>correlation › {sel.correlation}</span>
                        <Link href="#" className="uk-eyebrow" style={{ marginLeft: 'auto', textDecoration: 'none', display: 'inline-flex', gap: 4, alignItems: 'center' }}>Open in audit <ExternalLink size={10} /></Link>
                    </div>
                </div>
            </div>
        </UiKit>
    );
}
