'use client';

import { useCallback, useEffect, useState } from 'react';
import { ShieldBan, Plus, X, Loader2, AlertCircle, Save, Trash2, Plug, Clock, Globe } from 'lucide-react';

const ROLES: { key: string; label: string }[] = [
    { key: 'developer', label: 'Developer' },
    { key: 'fullstack_developer', label: 'Fullstack Developer' },
    { key: 'tester', label: 'Tester' },
    { key: 'devops_engineer', label: 'DevOps Engineer' },
    { key: 'mobile_engineer', label: 'Mobile Engineer' },
    { key: 'recruiter', label: 'Recruiter' },
    { key: 'sales_rep', label: 'Sales Rep' },
    { key: 'marketing_specialist', label: 'Marketing Specialist' },
    { key: 'content_writer', label: 'Content Writer' },
    { key: 'technical_writer', label: 'Technical Writer' },
    { key: 'business_analyst', label: 'Business Analyst' },
    { key: 'project_manager_product_owner_scrum_master', label: 'Project Manager / PO / SM' },
    { key: 'corporate_assistant', label: 'Corporate Assistant' },
    { key: 'customer_support_executive', label: 'Customer Support Executive' },
];

type TimeWindow = { days?: number[]; start: string; end: string; tz?: string };
type Rule = { actionType: string; effect: string; connector?: string; tool?: string; mode?: string; env?: string; domain?: string; timeWindow?: TimeWindow };
type ConnectorAccess = { connector: string; readOnly: boolean; deniedVerbs: string[] };
type EnvRule = { actionType: string; env: string };
type TimeRule = { actionType: string; start: string; end: string; tz: string; days: number[] };
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const input: React.CSSProperties = { padding: '8px 11px', borderRadius: 9, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--ink)', fontSize: 13, outline: 'none' };
const label: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' };
const card: React.CSSProperties = { background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12, padding: 16 };
const mono: React.CSSProperties = { fontFamily: 'ui-monospace, monospace' };

function Chips({ items, onRemove, color = 'var(--accent)' }: { items: string[]; onRemove: (v: string) => void; color?: string }) {
    if (items.length === 0) return null;
    return (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            {items.map((a) => (
                <span key={a} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 7px 3px 9px', borderRadius: 9999, background: `color-mix(in srgb, ${color} 8%, transparent)`, border: `1px solid color-mix(in srgb, ${color} 22%, transparent)`, fontSize: 12, color, ...mono }}>
                    {a}
                    <button onClick={() => onRemove(a)} type="button" style={{ background: 'none', border: 'none', cursor: 'pointer', color, padding: 0, display: 'flex' }}><X size={11} /></button>
                </span>
            ))}
        </div>
    );
}

function AddRow({ placeholder, onAdd }: { placeholder: string; onAdd: (v: string) => void }) {
    const [v, setV] = useState('');
    const add = () => { const t = v.trim(); if (t) onAdd(t); setV(''); };
    return (
        <div style={{ display: 'flex', gap: 8 }}>
            <input value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} placeholder={placeholder} style={{ ...input, flex: 1, ...mono }} />
            <button onClick={add} type="button" style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 12px', borderRadius: 9, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--ink-soft)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}><Plus size={13} /> Add</button>
        </div>
    );
}

export default function GovernancePolicyPanel() {
    const [scope, setScope] = useState<'role' | 'tenant'>('role');
    const [roleKey, setRoleKey] = useState(ROLES[0].key);

    const [policyId, setPolicyId] = useState<string | null>(null);
    const [blockedActions, setBlockedActions] = useState<string[]>([]);
    const [connectors, setConnectors] = useState<ConnectorAccess[]>([]);
    const [deniedTools, setDeniedTools] = useState<string[]>([]);
    const [newConnector, setNewConnector] = useState('');
    const [envRules, setEnvRules] = useState<EnvRule[]>([]);
    const [timeRules, setTimeRules] = useState<TimeRule[]>([]);
    const [webhookMode, setWebhookMode] = useState<'deny' | 'allow'>('deny');
    const [webhookDomains, setWebhookDomains] = useState<string[]>([]);

    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [savedMsg, setSavedMsg] = useState<string | null>(null);

    const parsePolicy = (rules: Rule[]) => {
        const ba: string[] = [];
        const tools: string[] = [];
        const byConnector = new Map<string, ConnectorAccess>();
        const envs: EnvRule[] = [];
        const times: TimeRule[] = [];
        const whDomains: string[] = [];
        let whMode: 'deny' | 'allow' = 'deny';
        for (const r of rules) {
            // webhook domain rules (allow or deny)
            if (r.connector === 'webhook' && r.domain) {
                whDomains.push(r.domain);
                if (r.effect === 'allow') whMode = 'allow';
                continue;
            }
            if (r.effect !== 'deny') continue;
            if (r.timeWindow) {
                times.push({ actionType: r.actionType || '*', start: r.timeWindow.start, end: r.timeWindow.end, tz: r.timeWindow.tz || 'UTC', days: r.timeWindow.days || [] });
                continue;
            }
            if (r.env) { envs.push({ actionType: r.actionType || '*', env: r.env }); continue; }
            if (r.tool) { tools.push(r.tool); continue; }
            if (r.connector) {
                let c = byConnector.get(r.connector);
                if (!c) { c = { connector: r.connector, readOnly: false, deniedVerbs: [] }; byConnector.set(r.connector, c); }
                if (r.mode === 'read_only') c.readOnly = true;
                if (r.actionType && r.actionType !== '*') c.deniedVerbs.push(r.actionType);
                continue;
            }
            if (r.actionType && r.actionType !== '*') ba.push(r.actionType);
        }
        setBlockedActions(ba);
        setConnectors([...byConnector.values()]);
        setDeniedTools(tools);
        setEnvRules(envs);
        setTimeRules(times);
        setWebhookDomains(whDomains);
        setWebhookMode(whMode);
    };

    const load = useCallback(async () => {
        setLoading(true); setError(null); setSavedMsg(null);
        try {
            const q = scope === 'role' ? `scope=role&roleKey=${encodeURIComponent(roleKey)}` : 'scope=tenant';
            const res = await fetch(`/api/governance/policies?${q}`, { cache: 'no-store' });
            const data = await res.json();
            if (!res.ok) throw new Error(data?.error || 'Failed to load');
            if (data.policy) {
                setPolicyId(data.policy.id);
                parsePolicy(Array.isArray(data.policy.rulesJson) ? data.policy.rulesJson : []);
            } else {
                setPolicyId(null); setBlockedActions([]); setConnectors([]); setDeniedTools([]);
                setEnvRules([]); setTimeRules([]); setWebhookDomains([]); setWebhookMode('deny');
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to load');
        } finally { setLoading(false); }
    }, [scope, roleKey]);

    useEffect(() => { void load(); }, [load]);

    const publish = async () => {
        if (blockedActions.length === 0 && connectors.length === 0 && deniedTools.length === 0
            && envRules.length === 0 && timeRules.length === 0 && webhookDomains.length === 0) {
            setError('Add at least one rule before publishing.'); return;
        }
        setSaving(true); setError(null); setSavedMsg(null);
        try {
            const res = await fetch('/api/governance/policies', {
                method: 'POST', headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    scope, roleKey: scope === 'role' ? roleKey : undefined,
                    blockedActions, connectors, deniedTools,
                    envRules,
                    timeRules: timeRules.map((t) => ({ actionType: t.actionType, start: t.start, end: t.end, tz: t.tz, days: t.days })),
                    webhookDomains: { mode: webhookMode, domains: webhookDomains },
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data?.error || 'Failed to publish');
            setSavedMsg('Policy published.');
            await load();
        } catch (e) { setError(e instanceof Error ? e.message : 'Failed to publish'); }
        finally { setSaving(false); }
    };

    const archive = async () => {
        if (!policyId) return;
        setSaving(true); setError(null);
        try {
            const res = await fetch(`/api/governance/policies/${policyId}`, { method: 'DELETE' });
            const data = await res.json();
            if (!res.ok) throw new Error(data?.error || 'Failed to archive');
            await load();
        } catch (e) { setError(e instanceof Error ? e.message : 'Failed to archive'); }
        finally { setSaving(false); }
    };

    const addConnector = () => {
        const c = newConnector.trim().toLowerCase();
        if (c && !connectors.some((x) => x.connector === c)) setConnectors((cur) => [...cur, { connector: c, readOnly: false, deniedVerbs: [] }]);
        setNewConnector('');
    };
    const updateConnector = (name: string, fn: (c: ConnectorAccess) => ConnectorAccess) =>
        setConnectors((cur) => cur.map((c) => (c.connector === name ? fn(c) : c)));

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '10px 14px', background: 'color-mix(in srgb, var(--accent) 5%, transparent)', border: '1px solid color-mix(in srgb, var(--accent) 18%, transparent)', borderRadius: 10 }}>
                <ShieldBan size={15} color="var(--accent)" style={{ flexShrink: 0, marginTop: 1 }} />
                <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink-soft)', lineHeight: 1.5 }}>
                    Policies <strong>tighten</strong> the built-in guardrails — block actions, restrict connectors to
                    read-only or deny specific verbs, and block MCP tools. They can never <em>grant</em> access.
                    Saving replaces this scope&apos;s active policy.
                </p>
            </div>

            {/* Scope selectors */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <span style={label}>Scope</span>
                <select value={scope} onChange={(e) => setScope(e.target.value as 'role' | 'tenant')} style={{ ...input, minWidth: 140 }}>
                    <option value="role">Role</option>
                    <option value="tenant">Tenant (all agents)</option>
                </select>
                {scope === 'role' && (
                    <select value={roleKey} onChange={(e) => setRoleKey(e.target.value)} style={{ ...input, minWidth: 240 }}>
                        {ROLES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
                    </select>
                )}
                {loading && <Loader2 size={14} className="spin" color="var(--ink-muted)" />}
            </div>

            {error && <div style={{ display: 'flex', gap: 8, alignItems: 'center', color: '#b42318', fontSize: 13, background: 'rgba(180,35,24,0.06)', border: '1px solid rgba(180,35,24,0.2)', borderRadius: 9, padding: '9px 12px' }}><AlertCircle size={14} /> {error}</div>}
            {savedMsg && <div style={{ color: 'var(--accent)', fontSize: 13 }}>{savedMsg}</div>}

            {/* Blocked actions */}
            <div style={card}>
                <div style={{ ...label, marginBottom: 10 }}>Blocked action types</div>
                <AddRow placeholder="e.g. deploy_production" onAdd={(v) => setBlockedActions((a) => a.includes(v) ? a : [...a, v])} />
                <Chips items={blockedActions} onRemove={(v) => setBlockedActions((a) => a.filter((x) => x !== v))} color="#b42318" />
            </div>

            {/* Connector access */}
            <div style={card}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                    <Plug size={13} color="var(--ink-muted)" /><span style={label}>Connector access</span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <input value={newConnector} onChange={(e) => setNewConnector(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addConnector(); } }} placeholder="Connector, e.g. salesforce" style={{ ...input, flex: 1, ...mono }} />
                    <button onClick={addConnector} type="button" style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 12px', borderRadius: 9, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--ink-soft)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}><Plus size={13} /> Add</button>
                </div>
                {connectors.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
                        {connectors.map((c) => (
                            <div key={c.connector} style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 12 }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', ...mono }}>{c.connector}</span>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--ink-soft)', cursor: 'pointer' }}>
                                            <input type="checkbox" checked={c.readOnly} onChange={(e) => updateConnector(c.connector, (x) => ({ ...x, readOnly: e.target.checked }))} /> Read-only (block writes)
                                        </label>
                                        <button onClick={() => setConnectors((cur) => cur.filter((x) => x.connector !== c.connector))} type="button" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#b42318', display: 'flex' }}><Trash2 size={13} /></button>
                                    </div>
                                </div>
                                <div style={{ marginTop: 10 }}>
                                    <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginBottom: 6 }}>Deny specific verbs (optional)</div>
                                    <AddRow placeholder="e.g. merge_pr" onAdd={(v) => updateConnector(c.connector, (x) => ({ ...x, deniedVerbs: x.deniedVerbs.includes(v) ? x.deniedVerbs : [...x.deniedVerbs, v] }))} />
                                    <Chips items={c.deniedVerbs} onRemove={(v) => updateConnector(c.connector, (x) => ({ ...x, deniedVerbs: x.deniedVerbs.filter((y) => y !== v) }))} color="#b42318" />
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Denied MCP tools */}
            <div style={card}>
                <div style={{ ...label, marginBottom: 10 }}>Blocked MCP tools</div>
                <AddRow placeholder="e.g. jira.delete" onAdd={(v) => setDeniedTools((a) => a.includes(v) ? a : [...a, v])} />
                <Chips items={deniedTools} onRemove={(v) => setDeniedTools((a) => a.filter((x) => x !== v))} color="#b42318" />
            </div>

            {/* Environment restrictions */}
            <div style={card}>
                <div style={{ ...label, marginBottom: 10 }}>Environment restrictions</div>
                <div style={{ fontSize: 11.5, color: 'var(--ink-muted)', marginBottom: 8 }}>Deny an action in a given environment (matches the task&apos;s <code style={mono}>environment</code>). Leave action as <code style={mono}>*</code> for all.</div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <input id="env-action" placeholder="action (or *)" style={{ ...input, flex: 1, ...mono }} />
                    <input id="env-env" placeholder="environment, e.g. production" style={{ ...input, flex: 1, ...mono }} />
                    <button type="button" onClick={() => {
                        const a = (document.getElementById('env-action') as HTMLInputElement); const e = (document.getElementById('env-env') as HTMLInputElement);
                        const env = e.value.trim(); if (!env) return;
                        setEnvRules((cur) => [...cur, { actionType: a.value.trim() || '*', env }]); a.value = ''; e.value = '';
                    }} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 12px', borderRadius: 9, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--ink-soft)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}><Plus size={13} /> Add</button>
                </div>
                {envRules.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                        {envRules.map((r, i) => (
                            <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 7px 3px 9px', borderRadius: 9999, background: 'color-mix(in srgb, #b42318 8%, transparent)', border: '1px solid color-mix(in srgb, #b42318 22%, transparent)', fontSize: 12, color: '#b42318', ...mono }}>
                                {r.actionType} @ {r.env}
                                <button type="button" onClick={() => setEnvRules((cur) => cur.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#b42318', padding: 0, display: 'flex' }}><X size={11} /></button>
                            </span>
                        ))}
                    </div>
                )}
            </div>

            {/* Time-window restrictions */}
            <div style={card}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}><Clock size={13} color="var(--ink-muted)" /><span style={label}>Working-hours restrictions</span></div>
                <div style={{ fontSize: 11.5, color: 'var(--ink-muted)', marginBottom: 8 }}>Allow the action only within the window; deny outside it.</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <input id="t-action" placeholder="action (or *)" style={{ ...input, width: 130, ...mono }} />
                    <input id="t-start" placeholder="09:00" style={{ ...input, width: 80, ...mono }} />
                    <span style={{ color: 'var(--ink-muted)' }}>–</span>
                    <input id="t-end" placeholder="17:00" style={{ ...input, width: 80, ...mono }} />
                    <input id="t-tz" placeholder="tz (UTC)" style={{ ...input, width: 150, ...mono }} />
                    <button type="button" onClick={() => {
                        const a = document.getElementById('t-action') as HTMLInputElement; const s = document.getElementById('t-start') as HTMLInputElement; const e = document.getElementById('t-end') as HTMLInputElement; const tz = document.getElementById('t-tz') as HTMLInputElement;
                        if (!/^\d{1,2}:\d{2}$/.test(s.value.trim()) || !/^\d{1,2}:\d{2}$/.test(e.value.trim())) { setError('Time must be HH:MM'); return; }
                        setTimeRules((cur) => [...cur, { actionType: a.value.trim() || '*', start: s.value.trim(), end: e.value.trim(), tz: tz.value.trim() || 'UTC', days: [] }]);
                        a.value = ''; s.value = ''; e.value = ''; tz.value = '';
                    }} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 12px', borderRadius: 9, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--ink-soft)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}><Plus size={13} /> Add</button>
                </div>
                {timeRules.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
                        {timeRules.map((r, i) => (
                            <div key={i} style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                                <span style={{ fontSize: 12.5, color: 'var(--ink)', ...mono }}>{r.actionType} · {r.start}–{r.end} {r.tz}</span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <div style={{ display: 'flex', gap: 4 }}>
                                        {DOW.map((d, di) => {
                                            const on = r.days.length === 0 || r.days.includes(di);
                                            return <button key={di} type="button" onClick={() => setTimeRules((cur) => cur.map((x, j) => j === i ? { ...x, days: x.days.includes(di) ? x.days.filter((y) => y !== di) : [...x.days, di].sort() } : x))} style={{ fontSize: 10.5, padding: '2px 5px', borderRadius: 6, border: '1px solid var(--line)', background: on ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'var(--card)', color: on ? 'var(--accent)' : 'var(--ink-muted)', cursor: 'pointer' }}>{d}</button>;
                                        })}
                                    </div>
                                    <button type="button" onClick={() => setTimeRules((cur) => cur.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#b42318', display: 'flex' }}><X size={13} /></button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Webhook domains (tenant scope) */}
            {scope === 'tenant' && (
                <div style={card}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}><Globe size={13} color="var(--ink-muted)" /><span style={label}>Outbound webhook domains</span></div>
                    <div style={{ fontSize: 11.5, color: 'var(--ink-muted)', marginBottom: 8 }}>Layered on the always-on SSRF guard. Allow-list = only listed domains permitted; deny-list = listed domains blocked.</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                        <span style={label}>Mode</span>
                        <select value={webhookMode} onChange={(e) => setWebhookMode(e.target.value as 'deny' | 'allow')} style={{ ...input, width: 160 }}>
                            <option value="deny">Deny-list</option>
                            <option value="allow">Allow-list</option>
                        </select>
                    </div>
                    <AddRow placeholder="domain, e.g. hooks.example.com" onAdd={(v) => setWebhookDomains((a) => a.includes(v) ? a : [...a, v])} />
                    <Chips items={webhookDomains} onRemove={(v) => setWebhookDomains((a) => a.filter((x) => x !== v))} color="#b42318" />
                </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <button onClick={publish} disabled={saving} type="button" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 9, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: saving ? 'wait' : 'pointer' }}>
                    {saving ? <Loader2 size={14} className="spin" /> : <Save size={14} />} Publish policy
                </button>
                {policyId && (
                    <button onClick={archive} disabled={saving} type="button" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: 9, border: '1px solid var(--line)', background: 'var(--card)', color: '#b42318', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                        <Trash2 size={14} /> Archive active
                    </button>
                )}
            </div>
        </div>
    );
}
