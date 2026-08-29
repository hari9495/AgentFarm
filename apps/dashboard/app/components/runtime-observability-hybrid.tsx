'use client';

/**
 * Hybrid Runtime Observability — the command-center observability tab wired to
 * LIVE runtime data (health snapshot, log stream, state transitions, connector
 * health). Rendered inside the page.tsx observability tab (no masthead).
 */

import { Radio, Activity, Plug, GitBranch } from 'lucide-react';
import { UiKit, Panel, Badge, Eyebrow, Display, Stat } from './ui-kit';

type RtHealth = { status?: string; runtime_state?: string; heartbeat_sent?: number; heartbeat_failed?: number; task_queue_depth?: number; processed_tasks?: number; succeeded_tasks?: number; failed_tasks?: number; last_heartbeat_at?: string | null };
type RtLog = { at: string; eventType: string; runtimeState: string; correlationId?: string | null };
type RtTransition = { at: string; from: string; to: string; reason?: string | null };
type ConnHealth = { connector_id: string; connector_type: string; status: string; last_healthcheck_at?: string | null; last_error_message?: string | null };

const stateTone = (s?: string): 'ok' | 'warn' | 'err' | 'accent' => {
    const v = (s ?? '').toLowerCase();
    if (['running', 'active', 'idle', 'ready', 'healthy'].includes(v)) return 'ok';
    if (['failed', 'error', 'crashed', 'stopped'].includes(v)) return 'err';
    if (['starting', 'restarting', 'degraded', 'paused'].includes(v)) return 'warn';
    return 'accent';
};
const connTone = (s: string): 'ok' | 'warn' | 'err' => {
    const v = (s ?? '').toLowerCase();
    if (['connected', 'active', 'healthy', 'ok'].includes(v)) return 'ok';
    if (['error', 'failed', 'revoked', 'expired'].includes(v)) return 'err';
    return 'warn';
};
const hhmmss = (iso: string) => { try { return new Date(iso).toLocaleTimeString('en-GB', { hour12: false }); } catch { return (iso || '').slice(11, 19); } };

export default function RuntimeObservabilityHybrid({ health, logs, transitions, currentState, connectors }: {
    health: RtHealth; logs: RtLog[]; transitions: RtTransition[]; currentState?: string; connectors: ConnHealth[];
}) {
    const state = currentState || health.runtime_state || health.status || 'unknown';
    const failed = health.failed_tasks ?? 0;
    return (
        <UiKit style={{ background: 'var(--bg)' }}>
            <div style={{ display: 'grid', gap: 24 }}>
                {/* Health strip */}
                <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <div>
                        <div className="uk-display" style={{ fontSize: 24, color: `var(--${stateTone(state) === 'accent' ? 'accent' : stateTone(state) === 'ok' ? 'ok' : stateTone(state) === 'err' ? 'danger' : 'warn'})` }}>{state}</div>
                        <div className="uk-eyebrow" style={{ marginTop: 5 }}>Runtime state</div>
                    </div>
                    <Stat n={String(health.heartbeat_sent ?? 0)} k="Heartbeats" tone="accent" />
                    <Stat n={String(health.task_queue_depth ?? 0)} k="Queue depth" tone={health.task_queue_depth ? 'warn' : 'ok'} />
                    <Stat n={String(health.succeeded_tasks ?? health.processed_tasks ?? 0)} k="Processed" tone="ok" />
                    <Stat n={String(failed)} k="Failed tasks" tone={failed > 0 ? 'err' : 'ok'} />
                </div>

                {/* Log feed + transitions */}
                <section style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 16, alignItems: 'start' }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                            <Radio size={14} color="var(--accent)" /><Eyebrow>Runtime log stream</Eyebrow>
                            <span className="uk-mono" style={{ marginLeft: 'auto', fontSize: 10.5, color: 'var(--ink-muted)' }}>{logs.length} entries</span>
                        </div>
                        {logs.length === 0 ? (
                            <div className="uk-panel" style={{ padding: 20, color: 'var(--ink-muted)', fontSize: 13 }}>No runtime logs in the current window.</div>
                        ) : (
                            <table className="uk-ledger">
                                <thead><tr><th>Time</th><th>Event</th><th>State</th></tr></thead>
                                <tbody>
                                    {logs.slice(0, 12).map((l, i) => (
                                        <tr key={`${l.at}-${i}`}>
                                            <td className="uk-num">{hhmmss(l.at)}</td>
                                            <td className="uk-mono" style={{ fontSize: 12 }}>{l.eventType}{l.correlationId ? <span style={{ color: 'var(--ink-muted)' }}> · {l.correlationId.slice(-8)}</span> : null}</td>
                                            <td><Badge tone={stateTone(l.runtimeState)}>{l.runtimeState}</Badge></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>

                    <Panel title="State transitions" action={<span className="uk-eyebrow" style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}><GitBranch size={11} /> machine</span>}>
                        {transitions.length === 0 ? (
                            <div style={{ fontSize: 13, color: 'var(--ink-muted)' }}>No recent transitions.</div>
                        ) : (
                            <div style={{ display: 'grid', gap: 10 }}>
                                {transitions.slice(0, 6).map((t, i) => (
                                    <div key={`${t.at}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 10, borderBottom: '1px solid var(--line)' }}>
                                        <Activity size={13} color="var(--ink-muted)" style={{ flexShrink: 0 }} />
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div className="uk-mono" style={{ fontSize: 12 }}>{t.from} → <span style={{ color: 'var(--accent)' }}>{t.to}</span></div>
                                            <div className="uk-mono" style={{ fontSize: 10, color: 'var(--ink-muted)', marginTop: 2 }}>{hhmmss(t.at)}{t.reason ? ` · ${t.reason}` : ''}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </Panel>
                </section>

                {/* Connector health */}
                <section>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                        <Plug size={14} color="var(--accent)" /><Display size={18}>Connector health</Display>
                        <span className="uk-mono" style={{ marginLeft: 'auto', fontSize: 10.5, color: 'var(--ink-muted)' }}>{connectors.length} connectors</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 12 }}>
                        {connectors.map((c) => (
                            <div key={c.connector_id} className="uk-panel" style={{ padding: 14, display: 'flex', alignItems: 'center', gap: 12, borderLeft: `2px solid var(--${connTone(c.status) === 'ok' ? 'ok' : connTone(c.status) === 'err' ? 'danger' : 'warn'})` }}>
                                <span style={{ width: 8, height: 8, borderRadius: '50%', background: `var(--${connTone(c.status) === 'ok' ? 'ok' : connTone(c.status) === 'err' ? 'danger' : 'warn'})`, flexShrink: 0 }} />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 13, color: 'var(--ink)', fontWeight: 500 }}>{c.connector_type}</div>
                                    <div className="uk-mono" style={{ fontSize: 10, color: 'var(--ink-muted)' }}>{c.last_error_message ? c.last_error_message.slice(0, 40) : (c.last_healthcheck_at ? `checked ${hhmmss(c.last_healthcheck_at)}` : 'no check yet')}</div>
                                </div>
                                <Badge tone={connTone(c.status)}>{c.status}</Badge>
                            </div>
                        ))}
                        {connectors.length === 0 && <div style={{ fontSize: 13, color: 'var(--ink-muted)' }}>No connectors configured.</div>}
                    </div>
                </section>
            </div>
        </UiKit>
    );
}
