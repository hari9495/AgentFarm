'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, AlertCircle, Download, ShieldCheck, FileText, Ban } from 'lucide-react';

type Violation = {
    id: string; actionType: string; connector?: string | null; effect: string; reason: string;
    matchedPolicyId?: string | null; policyVersion?: number | null; source: string; createdAt: string;
};
type Policy = { id: string; scope: string; scopeRef: string; version: number; name: string; rules: unknown[] };
type Doc = { id: string; fileName: string; status: string; appliedPolicyId?: string | null };
type Report = {
    tenantId: string; generatedAt: string;
    activePolicies: Policy[]; policyDocuments: Doc[]; violations: Violation[];
    summary: { activePolicyCount: number; appliedDocumentCount: number; violationCount: number };
    integrity?: { chainValid: boolean; recordsChecked: number; brokenAtId?: string };
};

const card: React.CSSProperties = { background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12, padding: 16 };
const mono: React.CSSProperties = { fontFamily: 'ui-monospace, monospace' };
const btn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 9, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--ink-soft)', fontSize: 13, fontWeight: 600, cursor: 'pointer' };

function Stat({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: number }) {
    return (
        <div style={{ ...card, flex: 1, display: 'flex', alignItems: 'center', gap: 12 }}>
            <Icon size={20} color="var(--accent)" />
            <div>
                <div style={{ fontSize: 24, fontWeight: 800 }}>{value}</div>
                <div style={{ fontSize: 12, color: 'var(--ink-muted)' }}>{label}</div>
            </div>
        </div>
    );
}

export default function ComplianceExportPanel() {
    const [report, setReport] = useState<Report | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true); setError(null);
        try {
            const res = await fetch('/api/governance/compliance-export', { cache: 'no-store' });
            const body = await res.json();
            if (!res.ok) throw new Error(body?.message ?? body?.error ?? 'Failed to load');
            setReport(body);
        } catch (e) { setError(e instanceof Error ? e.message : 'Failed to load'); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { load(); }, [load]);

    const download = () => { window.open('/api/governance/compliance-export?format=download', '_blank'); };

    if (loading) return <div style={{ display: 'flex', gap: 8, color: 'var(--ink-muted)', fontSize: 13 }}><Loader2 size={15} className="spin" /> Loading compliance report…</div>;
    if (error) return <div style={{ ...card, borderColor: '#37A0A0', display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: '#37A0A0' }}><AlertCircle size={15} />{error}</div>;
    if (!report) return null;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: 12, color: 'var(--ink-muted)' }}>Generated {new Date(report.generatedAt).toLocaleString()}</div>
                <button type="button" onClick={download} style={btn}><Download size={14} /> Download JSON</button>
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
                <Stat icon={ShieldCheck} label="Active policies" value={report.summary.activePolicyCount} />
                <Stat icon={FileText} label="Applied documents" value={report.summary.appliedDocumentCount} />
                <Stat icon={Ban} label="Violations recorded" value={report.summary.violationCount} />
            </div>

            {report.integrity && (
                <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 10, borderColor: report.integrity.chainValid ? 'var(--accent)' : '#37A0A0' }}>
                    {report.integrity.chainValid
                        ? <ShieldCheck size={18} color="var(--accent)" />
                        : <Ban size={18} color="#37A0A0" />}
                    <div>
                        <div style={{ fontWeight: 700, fontSize: 13, color: report.integrity.chainValid ? 'var(--accent)' : '#37A0A0' }}>
                            {report.integrity.chainValid ? 'Audit trail verified — tamper-evident' : 'Audit trail INTEGRITY FAILURE'}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--ink-muted)' }}>
                            {report.integrity.recordsChecked} violation record(s) hash-chain checked
                            {report.integrity.brokenAtId ? ` · broken at ${report.integrity.brokenAtId}` : ''}
                        </div>
                    </div>
                </div>
            )}

            <div style={card}>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Active policies</div>
                {report.activePolicies.length === 0 ? <div style={{ color: 'var(--ink-muted)', fontSize: 13 }}>None.</div> : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {report.activePolicies.map((p) => (
                            <div key={p.id} style={{ fontSize: 13, ...mono }}>
                                <strong>{p.scope}{p.scopeRef ? `:${p.scopeRef}` : ''}</strong> v{p.version} — {(p.rules?.length ?? 0)} rule(s)
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div style={card}>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Violation history ({report.violations.length})</div>
                {report.violations.length === 0 ? <div style={{ color: 'var(--ink-muted)', fontSize: 13 }}>No violations recorded.</div> : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 360, overflowY: 'auto' }}>
                        {report.violations.map((v) => (
                            <div key={v.id} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--line)' }}>
                                <div style={{ fontSize: 13, ...mono }}>
                                    <span style={{ color: '#37A0A0', fontWeight: 700 }}>{v.effect}</span> {v.actionType}
                                    {v.connector ? ` · ${v.connector}` : ''} · <span style={{ color: 'var(--ink-muted)' }}>{v.source}</span>
                                    {v.matchedPolicyId ? ` · ${v.matchedPolicyId}@v${v.policyVersion ?? '?'}` : ''}
                                </div>
                                <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginTop: 2 }}>{new Date(v.createdAt).toLocaleString()} — {v.reason}</div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
