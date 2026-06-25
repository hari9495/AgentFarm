'use client';

import { useCallback, useEffect, useState } from 'react';
import { ShieldBan, Plus, X, Trash2, Loader2, AlertCircle } from 'lucide-react';

// The 14 canonical roles (RoleKey → display name), mirrors ROLE_PROFILES.
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

type RoleRule = { actionType: string; effect: string };
type RolePolicy = {
    id: string;
    scopeRef: string;
    version: number;
    status: string;
    name: string;
    rulesJson: RoleRule[];
    updatedAt?: string;
};

const card: React.CSSProperties = {
    background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12, padding: 16,
};
const label: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.07em',
};
const input: React.CSSProperties = {
    padding: '8px 11px', borderRadius: 9, border: '1px solid var(--line)', background: 'var(--card)',
    color: 'var(--ink)', fontSize: 13, outline: 'none',
};

export default function RolePolicyPanel() {
    const [roleKey, setRoleKey] = useState(ROLES[0].key);
    const [policies, setPolicies] = useState<RolePolicy[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Draft state
    const [name, setName] = useState('');
    const [actions, setActions] = useState<string[]>([]);
    const [actionInput, setActionInput] = useState('');
    const [saving, setSaving] = useState(false);

    const load = useCallback(async (rk: string) => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/governance/role-policies?roleKey=${encodeURIComponent(rk)}`, { cache: 'no-store' });
            const data = await res.json();
            if (!res.ok) throw new Error(data?.error || 'Failed to load policies');
            setPolicies(Array.isArray(data.policies) ? data.policies : []);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to load policies');
            setPolicies([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { void load(roleKey); }, [roleKey, load]);

    const addAction = () => {
        const v = actionInput.trim();
        if (v && !actions.includes(v)) setActions((a) => [...a, v]);
        setActionInput('');
    };

    const publish = async () => {
        if (actions.length === 0) { setError('Add at least one blocked action type.'); return; }
        setSaving(true);
        setError(null);
        try {
            const res = await fetch('/api/governance/role-policies', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ roleKey, name: name.trim() || undefined, blockedActions: actions }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data?.error || 'Failed to publish');
            setName(''); setActions([]); setActionInput('');
            await load(roleKey);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to publish');
        } finally {
            setSaving(false);
        }
    };

    const archive = async (id: string) => {
        setError(null);
        try {
            const res = await fetch(`/api/governance/role-policies/${id}`, { method: 'DELETE' });
            const data = await res.json();
            if (!res.ok) throw new Error(data?.error || 'Failed to archive');
            await load(roleKey);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to archive');
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Tighten-only note */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '10px 14px', background: 'color-mix(in srgb, var(--accent) 5%, transparent)', border: '1px solid color-mix(in srgb, var(--accent) 18%, transparent)', borderRadius: 10 }}>
                <ShieldBan size={15} color="var(--accent)" style={{ flexShrink: 0, marginTop: 1 }} />
                <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink-soft)', lineHeight: 1.5 }}>
                    These rules <strong>tighten</strong> a role&apos;s built-in blocklist — they add hard-blocked
                    action types on top of the platform defaults. They can never <em>un</em>-block a built-in
                    action. Publishing a new version replaces the role&apos;s previous active policy.
                </p>
            </div>

            {/* Role selector */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={label}>Role</span>
                <select value={roleKey} onChange={(e) => setRoleKey(e.target.value)} style={{ ...input, minWidth: 260 }}>
                    {ROLES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
                </select>
            </div>

            {error && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', color: '#b42318', fontSize: 13, background: 'rgba(180,35,24,0.06)', border: '1px solid rgba(180,35,24,0.2)', borderRadius: 9, padding: '9px 12px' }}>
                    <AlertCircle size={14} /> {error}
                </div>
            )}

            {/* Draft editor */}
            <div style={card}>
                <div style={{ ...label, marginBottom: 12 }}>New policy for {ROLES.find((r) => r.key === roleKey)?.label}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Policy name (optional)" style={input} />
                    <div>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <input
                                value={actionInput}
                                onChange={(e) => setActionInput(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addAction(); } }}
                                placeholder="Action type to block, e.g. deploy_production"
                                style={{ ...input, flex: 1, fontFamily: 'ui-monospace, monospace' }}
                            />
                            <button onClick={addAction} type="button" style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 13px', borderRadius: 9, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--ink-soft)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                                <Plus size={13} /> Add
                            </button>
                        </div>
                        {actions.length > 0 && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                                {actions.map((a) => (
                                    <span key={a} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 8px 4px 10px', borderRadius: 9999, background: 'color-mix(in srgb, var(--accent) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--accent) 20%, transparent)', fontSize: 12, color: 'var(--accent)', fontFamily: 'ui-monospace, monospace' }}>
                                        {a}
                                        <button onClick={() => setActions((cur) => cur.filter((x) => x !== a))} type="button" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', padding: 0, display: 'flex' }}>
                                            <X size={12} />
                                        </button>
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                    <div>
                        <button onClick={publish} disabled={saving || actions.length === 0} type="button" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 9, border: 'none', background: actions.length === 0 ? 'var(--line)' : 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: actions.length === 0 ? 'not-allowed' : 'pointer' }}>
                            {saving ? <Loader2 size={14} className="spin" /> : <ShieldBan size={14} />}
                            Publish policy
                        </button>
                    </div>
                </div>
            </div>

            {/* Active policies list */}
            <div>
                <div style={{ ...label, marginBottom: 10 }}>Active policies for this role</div>
                {loading ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--ink-muted)', fontSize: 13, padding: 12 }}>
                        <Loader2 size={14} className="spin" /> Loading…
                    </div>
                ) : policies.length === 0 ? (
                    <div style={{ ...card, color: 'var(--ink-muted)', fontSize: 13, textAlign: 'center', padding: 24 }}>
                        No customer policies for this role yet. The built-in blocklist still applies.
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {policies.map((p) => (
                            <div key={p.id} style={{ ...card, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                                <div style={{ minWidth: 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>{p.name}</span>
                                        <span style={{ fontSize: 11, color: 'var(--ink-muted)', background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 6, padding: '1px 6px' }}>v{p.version}</span>
                                    </div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                        {(Array.isArray(p.rulesJson) ? p.rulesJson : []).map((r, i) => (
                                            <span key={`${r.actionType}-${i}`} style={{ fontSize: 12, color: '#b42318', background: 'rgba(180,35,24,0.06)', border: '1px solid rgba(180,35,24,0.18)', borderRadius: 7, padding: '2px 8px', fontFamily: 'ui-monospace, monospace' }}>
                                                {r.actionType}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                                <button onClick={() => archive(p.id)} type="button" title="Archive policy" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 11px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--card)', color: '#b42318', fontSize: 12, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>
                                    <Trash2 size={13} /> Archive
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
