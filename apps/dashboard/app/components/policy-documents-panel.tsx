'use client';

import { useCallback, useEffect, useState } from 'react';
import { Upload, FileText, Loader2, AlertCircle, CheckCircle2, Trash2, ShieldCheck } from 'lucide-react';

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

type Candidate = {
    id: string; actionType: string; effect: string;
    connector?: string; tool?: string; mode?: string; env?: string;
    reason?: string; confidence: number; sourceQuote?: string;
};
type DocSummary = {
    id: string; fileName: string; mimeType: string; status: string;
    candidateCount: number; appliedPolicyId?: string | null; appliedAt?: string | null;
    failureReason?: string | null; createdAt: string;
};
type DocDetail = DocSummary & { candidates: Candidate[]; extractedText?: string | null };

const card: React.CSSProperties = { background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12, padding: 16 };
const label: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' };
const mono: React.CSSProperties = { fontFamily: 'ui-monospace, monospace' };
const inputS: React.CSSProperties = { padding: '8px 11px', borderRadius: 9, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--ink)', fontSize: 13, outline: 'none' };
const btn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 9, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--ink-soft)', fontSize: 13, fontWeight: 600, cursor: 'pointer' };

const statusColor = (s: string) => (s === 'parsed' ? 'var(--accent)' : s === 'failed' ? '#e5484d' : 'var(--ink-muted)');

export default function PolicyDocumentsPanel() {
    const [docs, setDocs] = useState<DocSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selected, setSelected] = useState<DocDetail | null>(null);
    const [checked, setChecked] = useState<Set<string>>(new Set());
    const [scope, setScope] = useState<'tenant' | 'role'>('role');
    const [roleKey, setRoleKey] = useState('developer');
    const [applying, setApplying] = useState(false);
    const [notice, setNotice] = useState<string | null>(null);

    const loadDocs = useCallback(async () => {
        setLoading(true); setError(null);
        try {
            const res = await fetch('/api/governance/policy-documents', { cache: 'no-store' });
            const body = await res.json();
            if (!res.ok) throw new Error(body?.message ?? body?.error ?? 'Failed to load');
            setDocs(body.documents ?? []);
        } catch (e) { setError(e instanceof Error ? e.message : 'Failed to load'); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { loadDocs(); }, [loadDocs]);

    const upload = async (file: File) => {
        setUploading(true); setError(null); setNotice(null);
        try {
            const fd = new FormData();
            fd.append('file', file);
            const res = await fetch('/api/governance/policy-documents', { method: 'POST', body: fd });
            const body = await res.json();
            if (!res.ok) throw new Error(body?.message ?? body?.error ?? 'Upload failed');
            setNotice(body.deduped ? 'Document already ingested.' : `Ingested — ${body.candidates?.length ?? 0} candidate rule(s) extracted.`);
            await loadDocs();
        } catch (e) { setError(e instanceof Error ? e.message : 'Upload failed'); }
        finally { setUploading(false); }
    };

    const openDoc = async (id: string) => {
        setNotice(null); setError(null);
        try {
            const res = await fetch(`/api/governance/policy-documents/${id}`, { cache: 'no-store' });
            const body = await res.json();
            if (!res.ok) throw new Error(body?.message ?? body?.error ?? 'Failed to load');
            const doc = body.document as DocDetail;
            setSelected(doc);
            // pre-check enforceable (deny) candidates
            setChecked(new Set(doc.candidates.filter((c) => c.effect === 'deny').map((c) => c.id)));
        } catch (e) { setError(e instanceof Error ? e.message : 'Failed to load'); }
    };

    const apply = async () => {
        if (!selected) return;
        setApplying(true); setError(null); setNotice(null);
        try {
            const res = await fetch(`/api/governance/policy-documents/${selected.id}/apply`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ scope, roleKey: scope === 'role' ? roleKey : undefined, candidateIds: [...checked] }),
            });
            const body = await res.json();
            if (!res.ok) throw new Error(body?.message ?? body?.error ?? 'Apply failed');
            setNotice(`Applied ${body.appliedCount} rule(s)${body.skipped?.length ? `, ${body.skipped.length} skipped (non-deny)` : ''} → policy v${body.policy?.version}.`);
            await loadDocs();
            await openDoc(selected.id);
        } catch (e) { setError(e instanceof Error ? e.message : 'Apply failed'); }
        finally { setApplying(false); }
    };

    const remove = async (id: string) => {
        await fetch(`/api/governance/policy-documents/${id}`, { method: 'DELETE' });
        if (selected?.id === id) setSelected(null);
        await loadDocs();
    };

    const toggle = (id: string) => {
        setChecked((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Upload */}
            <div style={card}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <Upload size={16} color="var(--accent)" />
                    <span style={{ fontWeight: 700, fontSize: 14 }}>Upload a policy document</span>
                </div>
                <p style={{ fontSize: 12.5, color: 'var(--ink-muted)', marginTop: 0, marginBottom: 12 }}>
                    PDF, DOCX, Markdown, TXT, HTML, XLSX. The document is embedded for agent grounding, and candidate
                    governance rules are extracted for your review. Nothing is enforced until you approve and apply it.
                </p>
                <label style={{ ...btn, opacity: uploading ? 0.6 : 1 }}>
                    {uploading ? <Loader2 size={14} className="spin" /> : <Upload size={14} />}
                    {uploading ? 'Ingesting…' : 'Choose file'}
                    <input type="file" hidden disabled={uploading}
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.currentTarget.value = ''; }} />
                </label>
            </div>

            {notice && <div style={{ ...card, borderColor: 'var(--accent)', display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}><CheckCircle2 size={15} color="var(--accent)" />{notice}</div>}
            {error && <div style={{ ...card, borderColor: '#e5484d', display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: '#e5484d' }}><AlertCircle size={15} />{error}</div>}

            {/* List */}
            <div style={card}>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Uploaded documents</div>
                {loading ? <div style={{ display: 'flex', gap: 8, color: 'var(--ink-muted)', fontSize: 13 }}><Loader2 size={15} className="spin" /> Loading…</div>
                    : docs.length === 0 ? <div style={{ color: 'var(--ink-muted)', fontSize: 13 }}>No documents uploaded yet.</div>
                    : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {docs.map((d) => (
                                <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 9, border: '1px solid var(--line)', cursor: 'pointer', background: selected?.id === d.id ? 'color-mix(in srgb, var(--accent) 6%, transparent)' : 'transparent' }} onClick={() => openDoc(d.id)}>
                                    <FileText size={15} color="var(--ink-muted)" />
                                    <span style={{ fontSize: 13, fontWeight: 600, ...mono }}>{d.fileName}</span>
                                    <span style={{ fontSize: 11, fontWeight: 700, color: statusColor(d.status), textTransform: 'uppercase' }}>{d.status}</span>
                                    <span style={{ fontSize: 12, color: 'var(--ink-muted)' }}>{d.candidateCount} candidate(s)</span>
                                    {d.appliedPolicyId && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--accent)' }}><ShieldCheck size={12} /> applied</span>}
                                    <button type="button" onClick={(e) => { e.stopPropagation(); remove(d.id); }} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-muted)' }}><Trash2 size={14} /></button>
                                </div>
                            ))}
                        </div>
                    )}
            </div>

            {/* Review + apply */}
            {selected && (
                <div style={card}>
                    <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>Review candidate rules — {selected.fileName}</div>
                    <p style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 0 }}>
                        Select the rules to enforce. Only <strong>deny</strong> rules are enforceable via direct policy; other
                        effects are shown for context but skipped on apply.
                    </p>
                    {selected.failureReason && <div style={{ color: '#e5484d', fontSize: 13 }}>Parse failed: {selected.failureReason}</div>}
                    {selected.candidates.length === 0 ? <div style={{ color: 'var(--ink-muted)', fontSize: 13 }}>No candidate rules extracted.</div> : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                            {selected.candidates.map((c) => {
                                const enforceable = c.effect === 'deny';
                                return (
                                    <label key={c.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 12px', borderRadius: 9, border: '1px solid var(--line)', opacity: enforceable ? 1 : 0.55, cursor: enforceable ? 'pointer' : 'not-allowed' }}>
                                        <input type="checkbox" disabled={!enforceable} checked={checked.has(c.id)} onChange={() => toggle(c.id)} style={{ marginTop: 3 }} />
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontSize: 13, ...mono }}>
                                                <strong>{c.effect}</strong> {c.actionType}
                                                {c.connector ? ` · connector=${c.connector}` : ''}{c.mode ? ` · ${c.mode}` : ''}{c.tool ? ` · tool=${c.tool}` : ''}{c.env ? ` · env=${c.env}` : ''}
                                            </div>
                                            {c.sourceQuote && <div style={{ fontSize: 11.5, color: 'var(--ink-muted)', marginTop: 3, fontStyle: 'italic' }}>“{c.sourceQuote}”</div>}
                                            <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginTop: 2 }}>confidence {(c.confidence * 100).toFixed(0)}%{enforceable ? '' : ' · not enforceable (non-deny)'}</div>
                                        </div>
                                    </label>
                                );
                            })}
                        </div>
                    )}

                    {/* Apply target */}
                    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginTop: 14, flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                            <span style={label}>Apply to scope</span>
                            <select value={scope} onChange={(e) => setScope(e.target.value as 'tenant' | 'role')} style={inputS}>
                                <option value="role">Role</option>
                                <option value="tenant">Whole tenant</option>
                            </select>
                        </div>
                        {scope === 'role' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                                <span style={label}>Role</span>
                                <select value={roleKey} onChange={(e) => setRoleKey(e.target.value)} style={inputS}>
                                    {ROLES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
                                </select>
                            </div>
                        )}
                        <button type="button" onClick={apply} disabled={applying || checked.size === 0}
                            style={{ ...btn, background: 'var(--accent)', color: '#fff', borderColor: 'var(--accent)', opacity: applying || checked.size === 0 ? 0.6 : 1 }}>
                            {applying ? <Loader2 size={14} className="spin" /> : <ShieldCheck size={14} />}
                            Apply {checked.size} rule(s)
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
