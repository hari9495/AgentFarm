'use client';

import { useCallback, useEffect, useState } from 'react';
import { Shield, Copy, Check, ExternalLink, RefreshCw, AlertTriangle, CheckCircle2, Trash2 } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

type SsoConfig = {
    configured: boolean;
    enabled: boolean;
    provider?: string;
    entryPoint?: string;
    issuer?: string;
    certPreview?: string;
    spEntityId: string;
    callbackUrl: string;
    metadataUrl: string;
    loginUrl: string;
    signatureAlgo?: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function CopyField({ label, value }: { label: string; value: string }) {
    const [copied, setCopied] = useState(false);
    const copy = () => { void navigator.clipboard.writeText(value).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); };
    return (
        <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{label}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, background: 'var(--bg-deep)', border: '1px solid var(--line)' }}>
                <code style={{ flex: 1, fontSize: 12, color: 'var(--ink-soft)', fontFamily: 'monospace', wordBreak: 'break-all' }}>{value}</code>
                <button onClick={copy} style={{ flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-muted)', padding: '2px 4px' }}>
                    {copied ? <Check size={13} color="#16a34a" /> : <Copy size={13} />}
                </button>
            </div>
        </div>
    );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function SsoSettingsClient() {
    const [config, setConfig]   = useState<SsoConfig | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError]     = useState<string | null>(null);
    const [saving, setSaving]   = useState(false);
    const [saveErr, setSaveErr] = useState<string | null>(null);
    const [saveOk, setSaveOk]   = useState(false);
    const [deleting, setDeleting] = useState(false);

    // Form state
    const [entryPoint,    setEntryPoint]    = useState('');
    const [issuer,        setIssuer]        = useState('');
    const [cert,          setCert]          = useState('');
    const [sigAlgo,       setSigAlgo]       = useState('sha256');
    const [enabled,       setEnabled]       = useState(true);

    const load = useCallback(async () => {
        setLoading(true); setError(null);
        try {
            const res  = await fetch('/api/admin/sso', { cache: 'no-store' });
            const data = (await res.json()) as SsoConfig & { error?: string };
            if (!res.ok) { setError(data.error ?? 'Failed to load SSO config'); return; }
            setConfig(data);
            if (data.configured) {
                setEntryPoint(data.entryPoint ?? '');
                setIssuer(data.issuer ?? '');
                setSigAlgo(data.signatureAlgo ?? 'sha256');
                setEnabled(data.enabled);
            }
        } catch { setError('Network error.'); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { void load(); }, [load]);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!entryPoint.trim() || !issuer.trim()) { setSaveErr('IdP SSO URL and Issuer are required.'); return; }
        if (!cert.trim() && !config?.configured) { setSaveErr('IdP Certificate is required for initial setup.'); return; }
        setSaving(true); setSaveErr(null); setSaveOk(false);
        try {
            const body: Record<string, unknown> = { entryPoint: entryPoint.trim(), issuer: issuer.trim(), signatureAlgo: sigAlgo, enabled };
            if (cert.trim()) body.cert = cert.trim();
            const res  = await fetch('/api/admin/sso', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            const data = (await res.json()) as { error?: string };
            if (!res.ok) { setSaveErr(data.error ?? 'Save failed.'); return; }
            setSaveOk(true);
            setTimeout(() => setSaveOk(false), 3000);
            setCert(''); // clear cert field after save
            await load();
        } catch { setSaveErr('Network error.'); }
        finally { setSaving(false); }
    };

    const handleDelete = async () => {
        if (!window.confirm('Remove SSO configuration? Users will need passwords to log in.')) return;
        setDeleting(true);
        try {
            await fetch('/api/admin/sso', { method: 'DELETE' });
            await load();
        } finally { setDeleting(false); }
    };

    if (loading) return (
        <div style={{ padding: '40px 32px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 680 }}>
                {[200, 160, 140, 180].map((w, i) => <div key={i} style={{ height: 14, width: w, background: 'var(--bg-deep)', borderRadius: 6 }} />)}
            </div>
        </div>
    );

    return (
        <div style={{ padding: '32px', maxWidth: 720, fontFamily: 'var(--font-sans, system-ui)' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Shield size={20} color="var(--card)" />
                </div>
                <div>
                    <h1 style={{ margin: 0, fontSize: 19, fontWeight: 800, color: 'var(--ink)' }}>SSO / SAML 2.0</h1>
                    <p style={{ margin: 0, fontSize: 12, color: 'var(--ink-muted)' }}>
                        Let your team log in with your corporate identity provider (Okta, Azure AD, Google Workspace, etc.)
                    </p>
                </div>
            </div>

            {error && (
                <div style={{ display: 'flex', gap: 8, padding: '10px 14px', borderRadius: 10, background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', color: 'var(--danger)', fontSize: 13, marginBottom: 20 }}>
                    <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} /> {error}
                </div>
            )}

            {/* Current status */}
            <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 14, padding: '18px 20px', marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: config?.configured ? 16 : 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {config?.configured && config.enabled
                            ? <CheckCircle2 size={16} color="var(--ok)" />
                            : <AlertTriangle size={16} color={config?.configured ? 'var(--warn)' : 'var(--ink-muted)'} />}
                        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>
                            {config?.configured
                                ? (config.enabled ? 'SSO Active' : 'SSO Configured but Disabled')
                                : 'SSO Not Configured'}
                        </span>
                    </div>
                    {config?.configured && (
                        <div style={{ display: 'flex', gap: 8 }}>
                            <a href={config.loginUrl} target="_blank" rel="noopener noreferrer"
                                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600, color: 'var(--accent)', textDecoration: 'none' }}>
                                Test login <ExternalLink size={11} />
                            </a>
                            <button onClick={() => void handleDelete()} disabled={deleting}
                                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 8px', fontSize: 11, borderRadius: 6, border: '1px solid var(--danger-border)', background: 'var(--card)', color: 'var(--danger)', cursor: 'pointer' }}>
                                <Trash2 size={11} /> {deleting ? '…' : 'Remove'}
                            </button>
                        </div>
                    )}
                </div>

                {config?.configured && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 12, color: 'var(--ink-soft)' }}>
                        <div><span style={{ color: 'var(--ink-muted)' }}>Provider:</span> {config.provider ?? 'SAML 2.0'}</div>
                        <div><span style={{ color: 'var(--ink-muted)' }}>Signature:</span> {config.signatureAlgo ?? 'sha256'}</div>
                        <div style={{ gridColumn: '1/-1' }}><span style={{ color: 'var(--ink-muted)' }}>Issuer:</span> {config.issuer}</div>
                        <div style={{ gridColumn: '1/-1' }}><span style={{ color: 'var(--ink-muted)' }}>Certificate:</span> <code style={{ fontFamily: 'monospace', fontSize: 11 }}>{config.certPreview}</code></div>
                    </div>
                )}
            </div>

            {/* SP details for the IdP */}
            {config && (
                <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 14, padding: '18px 20px', marginBottom: 24 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', marginBottom: 14 }}>
                        Service Provider (SP) Details — add these to your IdP
                    </div>
                    <CopyField label="ACS / Callback URL" value={config.callbackUrl} />
                    <CopyField label="SP Entity ID" value={config.spEntityId} />
                    <CopyField label="SP Metadata URL" value={config.metadataUrl} />
                </div>
            )}

            {/* Configuration form */}
            <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 14, padding: '20px 22px' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', marginBottom: 18 }}>
                    {config?.configured ? 'Update IdP Configuration' : 'Configure Identity Provider'}
                </div>

                <form onSubmit={e => void handleSave(e)}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <div>
                            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }}>
                                IdP SSO URL (Entry Point) <span style={{ color: 'var(--danger)' }}>*</span>
                            </label>
                            <input type="url" value={entryPoint} onChange={e => setEntryPoint(e.target.value)} required
                                placeholder="https://your-idp.okta.com/app/xxx/sso/saml"
                                style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--bg)', color: 'var(--ink)', fontSize: 13, boxSizing: 'border-box' }} />
                        </div>

                        <div>
                            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }}>
                                Issuer / Entity ID <span style={{ color: 'var(--danger)' }}>*</span>
                            </label>
                            <input type="text" value={issuer} onChange={e => setIssuer(e.target.value)} required
                                placeholder="http://www.okta.com/exkXXXXXXXX"
                                style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--bg)', color: 'var(--ink)', fontSize: 13, boxSizing: 'border-box' }} />
                        </div>

                        <div>
                            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }}>
                                IdP X.509 Certificate{config?.configured ? ' (leave blank to keep existing)' : <span style={{ color: 'var(--danger)' }}> *</span>}
                            </label>
                            <textarea rows={5} value={cert} onChange={e => setCert(e.target.value)}
                                placeholder="-----BEGIN CERTIFICATE-----&#10;MIIC...&#10;-----END CERTIFICATE-----"
                                style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--bg)', color: 'var(--ink)', fontSize: 12, fontFamily: 'monospace', resize: 'vertical', boxSizing: 'border-box' }} />
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                            <div>
                                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }}>Signature Algorithm</label>
                                <select value={sigAlgo} onChange={e => setSigAlgo(e.target.value)}
                                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--bg)', color: 'var(--ink)', fontSize: 13 }}>
                                    <option value="sha256">SHA-256 (recommended)</option>
                                    <option value="sha512">SHA-512</option>
                                </select>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 2 }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>
                                    <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} style={{ width: 16, height: 16 }} />
                                    Enable SSO for this tenant
                                </label>
                            </div>
                        </div>

                        {saveErr && (
                            <div style={{ display: 'flex', gap: 7, padding: '8px 12px', borderRadius: 8, background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', color: 'var(--danger)', fontSize: 12 }}>
                                <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} /> {saveErr}
                            </div>
                        )}
                        {saveOk && (
                            <div style={{ display: 'flex', gap: 7, padding: '8px 12px', borderRadius: 8, background: 'var(--ok-bg)', border: '1px solid var(--ok-border)', color: 'var(--ok)', fontSize: 12 }}>
                                <CheckCircle2 size={13} style={{ flexShrink: 0, marginTop: 1 }} /> SSO configuration saved.
                            </div>
                        )}

                        <div style={{ display: 'flex', gap: 10 }}>
                            <button type="submit" disabled={saving}
                                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 20px', borderRadius: 10, background: saving ? 'var(--line)' : 'var(--accent)', color: saving ? 'var(--ink-muted)' : 'var(--card)', border: 'none', fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer' }}>
                                {saving ? <><RefreshCw size={13} className="animate-spin" /> Saving…</> : (config?.configured ? 'Update Config' : 'Save & Enable SSO')}
                            </button>
                            <a href="/settings" style={{ display: 'inline-flex', alignItems: 'center', padding: '9px 16px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--ink-soft)', fontSize: 13, textDecoration: 'none' }}>
                                Back to Settings
                            </a>
                        </div>
                    </div>
                </form>
            </div>

            {/* Guide */}
            <div style={{ marginTop: 20, padding: '14px 18px', borderRadius: 12, background: 'var(--bg-deep)', border: '1px solid var(--line)', fontSize: 12, color: 'var(--ink-soft)', lineHeight: 1.7 }}>
                <strong style={{ color: 'var(--ink)' }}>Setup guide:</strong>
                {' '}1. In your IdP, create a new SAML 2.0 application.
                {' '}2. Enter the <strong>ACS URL</strong> as the reply / callback URL.
                {' '}3. Set the <strong>SP Entity ID</strong> as the audience / entity ID.
                {' '}4. Copy the <strong>IdP SSO URL</strong>, <strong>Issuer</strong>, and <strong>X.509 Certificate</strong> from your IdP and paste them above.
                {' '}5. Click <em>Save &amp; Enable SSO</em>. Users can now sign in via <strong>Test login</strong>.
            </div>
        </div>
    );
}
