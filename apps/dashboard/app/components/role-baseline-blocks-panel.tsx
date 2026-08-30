'use client';

import { useCallback, useEffect, useState } from 'react';
import { Lock, Loader2, AlertCircle } from 'lucide-react';

const ROLES = [
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

const card: React.CSSProperties = { background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12, padding: 16, marginTop: 16 };
const inputS: React.CSSProperties = { padding: '8px 11px', borderRadius: 9, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--ink)', fontSize: 13, outline: 'none' };
const mono: React.CSSProperties = { fontFamily: 'ui-monospace, monospace' };

export default function RoleBaselineBlocksPanel() {
    const [roleKey, setRoleKey] = useState('developer');
    const [actions, setActions] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async (rk: string) => {
        setLoading(true); setError(null);
        try {
            const res = await fetch(`/api/governance/role-baseline-blocks?roleKey=${encodeURIComponent(rk)}`, { cache: 'no-store' });
            const body = await res.json();
            if (!res.ok) throw new Error(body?.message ?? body?.error ?? 'Failed to load');
            setActions(body.blockedActions ?? []);
        } catch (e) { setError(e instanceof Error ? e.message : 'Failed to load'); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { load(roleKey); }, [roleKey, load]);

    return (
        <div style={card}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <Lock size={16} color="var(--ink-muted)" />
                <span style={{ fontWeight: 700, fontSize: 14 }}>Built-in blocks (read-only)</span>
            </div>
            <p style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 0 }}>
                These actions are always blocked for this role by the platform’s built-in RBAC. Your custom
                policies add to these — they can never remove a built-in block.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, width: 280, marginBottom: 12 }}>
                <select value={roleKey} onChange={(e) => setRoleKey(e.target.value)} style={inputS}>
                    {ROLES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
                </select>
            </div>
            {loading ? <div style={{ display: 'flex', gap: 8, color: 'var(--ink-muted)', fontSize: 13 }}><Loader2 size={15} className="spin" /> Loading…</div>
                : error ? <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: '#2563EB' }}><AlertCircle size={15} />{error}</div>
                : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {actions.length === 0 ? <span style={{ fontSize: 13, color: 'var(--ink-muted)' }}>No built-in blocks for this role.</span>
                            : actions.map((a) => (
                                <span key={a} style={{ ...mono, fontSize: 12, padding: '3px 8px', borderRadius: 9999, background: 'color-mix(in srgb, var(--ink-muted) 10%, transparent)', border: '1px solid var(--line)', color: 'var(--ink-soft)' }}>{a}</span>
                            ))}
                    </div>
                )}
            <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginTop: 10 }}>{actions.length} built-in blocked action(s)</div>
        </div>
    );
}
