'use client';

import { useCallback, useEffect, useState } from 'react';
import { ShieldBan, Plus, X, Loader2, AlertCircle, Save, Trash2, Plug } from 'lucide-react';

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

type Rule = { actionType: string; effect: string; connector?: string; tool?: string; mode?: string };
type ConnectorAccess = { connector: string; readOnly: boolean; deniedVerbs: string[] };

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

    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [savedMsg, setSavedMsg] = useState<string | null>(null);

    const parsePolicy = (rules: Rule[]) => {
        const ba: string[] = [];
        const tools: string[] = [];
        const byConnector = new Map<string, ConnectorAccess>();
        for (const r of rules) {
            if (r.effect !== 'deny') continue;
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
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to load');
        } finally { setLoading(false); }
    }, [scope, roleKey]);

    useEffect(() => { void load(); }, [load]);

    const publish = async () => {
        if (blockedActions.length === 0 && connectors.length === 0 && deniedTools.length === 0) {
            setError('Add at least one rule before publishing.'); return;
        }
        setSaving(true); setError(null); setSavedMsg(null);
        try {
            const res = await fetch('/api/governance/policies', {
                method: 'POST', headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ scope, roleKey: scope === 'role' ? roleKey : undefined, blockedActions, connectors, deniedTools }),
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
