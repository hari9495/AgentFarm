'use client';

import { useState } from 'react';
import { FlaskConical, Loader2, ShieldX, ShieldCheck, AlertCircle } from 'lucide-react';

const ROLES = [
    { key: '', label: 'Tenant only (no role)' },
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

const card: React.CSSProperties = { background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12, padding: 16 };
const label: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' };
const inputS: React.CSSProperties = { padding: '8px 11px', borderRadius: 9, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--ink)', fontSize: 13, outline: 'none', fontFamily: 'ui-monospace, monospace' };
const field = (w: number): React.CSSProperties => ({ display: 'flex', flexDirection: 'column', gap: 5, width: w });

type Result = { effect: 'deny' | 'allow'; reason: string; matchedRule?: Record<string, unknown>; timeDependentRules: unknown[] };

export default function PolicySimulatorPanel() {
    const [roleKey, setRoleKey] = useState('');
    const [actionType, setActionType] = useState('deploy_production');
    const [connector, setConnector] = useState('');
    const [tool, setTool] = useState('');
    const [env, setEnv] = useState('');
    const [isWrite, setIsWrite] = useState(false);
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<Result | null>(null);
    const [error, setError] = useState<string | null>(null);

    const run = async () => {
        setLoading(true); setError(null); setResult(null);
        try {
            const res = await fetch('/api/governance/policy-simulate', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ roleKey: roleKey || undefined, actionType, connector: connector || undefined, tool: tool || undefined, env: env || undefined, isWrite }),
            });
            const body = await res.json();
            if (!res.ok) throw new Error(body?.message ?? body?.error ?? 'Simulation failed');
            setResult(body.result);
        } catch (e) { setError(e instanceof Error ? e.message : 'Simulation failed'); }
        finally { setLoading(false); }
    };

    const denied = result?.effect === 'deny';

    return (
        <div style={{ ...card, marginTop: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <FlaskConical size={16} color="var(--accent)" />
                <span style={{ fontWeight: 700, fontSize: 14 }}>Simulate an action</span>
            </div>
            <p style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 0 }}>
                Check what the active customer policy would do for a sample action. The built-in role/risk
                defaults still apply on top — an “allowed” result means no customer rule blocks it.
            </p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div style={field(220)}>
                    <span style={label}>Scope / Role</span>
                    <select value={roleKey} onChange={(e) => setRoleKey(e.target.value)} style={inputS}>
                        {ROLES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
                    </select>
                </div>
                <div style={field(180)}>
                    <span style={label}>Action type</span>
                    <input value={actionType} onChange={(e) => setActionType(e.target.value)} placeholder="deploy_production" style={inputS} />
                </div>
                <div style={field(140)}>
                    <span style={label}>Connector</span>
                    <input value={connector} onChange={(e) => setConnector(e.target.value)} placeholder="(optional)" style={inputS} />
                </div>
                <div style={field(140)}>
                    <span style={label}>Tool</span>
                    <input value={tool} onChange={(e) => setTool(e.target.value)} placeholder="(optional)" style={inputS} />
                </div>
                <div style={field(120)}>
                    <span style={label}>Env</span>
                    <input value={env} onChange={(e) => setEnv(e.target.value)} placeholder="(optional)" style={inputS} />
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, paddingBottom: 8 }}>
                    <input type="checkbox" checked={isWrite} onChange={(e) => setIsWrite(e.target.checked)} /> write action
                </label>
                <button type="button" onClick={run} disabled={loading || !actionType.trim()}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 9, border: '1px solid var(--accent)', background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: loading || !actionType.trim() ? 0.6 : 1 }}>
                    {loading ? <Loader2 size={14} className="spin" /> : <FlaskConical size={14} />} Simulate
                </button>
            </div>

            {error && <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: '#e5484d' }}><AlertCircle size={15} />{error}</div>}

            {result && (
                <div style={{ marginTop: 14, padding: 12, borderRadius: 9, border: `1px solid ${denied ? '#e5484d' : 'var(--accent)'}`, background: `color-mix(in srgb, ${denied ? '#e5484d' : 'var(--accent)'} 6%, transparent)` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 14, color: denied ? '#e5484d' : 'var(--accent)' }}>
                        {denied ? <ShieldX size={16} /> : <ShieldCheck size={16} />}
                        {denied ? 'DENIED by customer policy' : 'Allowed by customer policy'}
                    </div>
                    <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginTop: 6 }}>{result.reason}</div>
                    {result.matchedRule && (
                        <div style={{ fontSize: 11.5, color: 'var(--ink-muted)', marginTop: 6, fontFamily: 'ui-monospace, monospace' }}>
                            matched: {JSON.stringify(result.matchedRule)}
                        </div>
                    )}
                    {result.timeDependentRules?.length > 0 && (
                        <div style={{ fontSize: 11.5, color: 'var(--ink-muted)', marginTop: 6 }}>
                            ⏱ {result.timeDependentRules.length} time-window rule(s) may also deny depending on the clock.
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
