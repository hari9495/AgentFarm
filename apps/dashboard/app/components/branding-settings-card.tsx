'use client';

import { useCallback, useEffect, useState } from 'react';

type Branding = {
    company_name: string | null;
    logo_url: string | null;
    primary_color: string | null;
    portal_title: string | null;
    favicon_url: string | null;
    configured: boolean;
};

const PRESET_COLORS = [
    { label: 'Sky blue',    hex: '#0052cc' },
    { label: 'Indigo',      hex: '#4f46e5' },
    { label: 'Emerald',     hex: '#059669' },
    { label: 'Rose',        hex: '#e11d48' },
    { label: 'Amber',       hex: '#d97706' },
    { label: 'Slate',       hex: '#475569' },
];

export function BrandingSettingsCard() {
    const [branding, setBranding] = useState<Branding | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [removing, setRemoving] = useState(false);
    const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

    const [companyName, setCompanyName] = useState('');
    const [logoUrl, setLogoUrl] = useState('');
    const [primaryColor, setPrimaryColor] = useState('#0052cc');
    const [portalTitle, setPortalTitle] = useState('');
    const [faviconUrl, setFaviconUrl] = useState('');

    const fetchBranding = useCallback(async () => {
        try {
            const res = await fetch('/api/tenant/branding');
            if (!res.ok) return;
            const data = (await res.json()) as { branding?: Branding };
            const b = data.branding ?? null;
            setBranding(b);
            if (b) {
                setCompanyName(b.company_name ?? '');
                setLogoUrl(b.logo_url ?? '');
                setPrimaryColor(b.primary_color ?? '#0052cc');
                setPortalTitle(b.portal_title ?? '');
                setFaviconUrl(b.favicon_url ?? '');
            }
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { void fetchBranding(); }, [fetchBranding]);

    const handleSave = async () => {
        setSaving(true);
        setMessage(null);
        try {
            const res = await fetch('/api/tenant/branding', {
                method: 'PUT',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    company_name: companyName || null,
                    logo_url: logoUrl || null,
                    primary_color: primaryColor || null,
                    portal_title: portalTitle || null,
                    favicon_url: faviconUrl || null,
                }),
            });
            const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
            if (!res.ok) {
                setMessage({ text: data.message ?? data.error ?? 'Failed to save.', ok: false });
                return;
            }
            setMessage({ text: 'Branding saved. Portal will reflect changes on next load.', ok: true });
            await fetchBranding();
        } finally {
            setSaving(false);
        }
    };

    const handleRemove = async () => {
        if (!window.confirm('Reset all branding to defaults?')) return;
        setRemoving(true);
        try {
            await fetch('/api/tenant/branding', { method: 'DELETE' });
            setBranding(null);
            setCompanyName(''); setLogoUrl(''); setPrimaryColor('#0052cc');
            setPortalTitle(''); setFaviconUrl('');
            setMessage({ text: 'Branding reset to defaults.', ok: true });
        } finally {
            setRemoving(false);
        }
    };

    if (loading) {
        return (
            <section className="card">
                <h2>Portal Branding</h2>
                <p style={{ margin: 0, fontSize: '0.83rem', color: '#78716c' }}>Loading…</p>
            </section>
        );
    }

    return (
        <section className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <div>
                    <h2 style={{ margin: 0 }}>Portal Branding</h2>
                    <p style={{ margin: '0.2rem 0 0', fontSize: '0.78rem', color: '#57534e' }}>
                        Customize how the customer portal looks to your end users.
                    </p>
                </div>
                {branding?.configured && (
                    <button type="button" className="chip-button" onClick={() => void handleRemove()} disabled={removing}>
                        {removing ? '…' : 'Reset'}
                    </button>
                )}
            </div>

            {message && (
                <p style={{ margin: '0 0 0.65rem', fontSize: '0.82rem', color: message.ok ? '#1a7a4a' : '#c4161c' }}>
                    {message.ok ? '✓ ' : '⚠ '}{message.text}
                </p>
            )}

            <div style={{ display: 'grid', gap: '0.75rem' }}>
                <label style={{ display: 'grid', gap: '0.25rem', fontSize: '0.82rem', fontWeight: 600 }}>
                    Company name
                    <input type="text" value={companyName} onChange={(e) => setCompanyName(e.target.value)}
                        placeholder="e.g. Acme Corp" className="approval-input" />
                </label>

                <label style={{ display: 'grid', gap: '0.25rem', fontSize: '0.82rem', fontWeight: 600 }}>
                    Portal heading <span style={{ fontWeight: 400, color: '#78716c' }}>(shown in portal header)</span>
                    <input type="text" value={portalTitle} onChange={(e) => setPortalTitle(e.target.value)}
                        placeholder="e.g. Acme AI Agents Portal" className="approval-input" />
                </label>

                <label style={{ display: 'grid', gap: '0.25rem', fontSize: '0.82rem', fontWeight: 600 }}>
                    Logo URL <span style={{ fontWeight: 400, color: '#78716c' }}>(https:// recommended, PNG/SVG, ~32px tall)</span>
                    <input type="url" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)}
                        placeholder="https://cdn.yourcompany.com/logo.png" className="approval-input" />
                </label>

                <label style={{ display: 'grid', gap: '0.25rem', fontSize: '0.82rem', fontWeight: 600 }}>
                    Favicon URL <span style={{ fontWeight: 400, color: '#78716c' }}>(optional, 32×32 .ico or .png)</span>
                    <input type="url" value={faviconUrl} onChange={(e) => setFaviconUrl(e.target.value)}
                        placeholder="https://cdn.yourcompany.com/favicon.ico" className="approval-input" />
                </label>

                <div style={{ display: 'grid', gap: '0.25rem' }}>
                    <div style={{ fontSize: '0.82rem', fontWeight: 600 }}>Primary accent color</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                        {PRESET_COLORS.map((c) => (
                            <button
                                key={c.hex}
                                type="button"
                                title={c.label}
                                onClick={() => setPrimaryColor(c.hex)}
                                style={{
                                    width: 28, height: 28, borderRadius: '50%',
                                    background: c.hex,
                                    border: primaryColor === c.hex ? '3px solid #1d1d1f' : '2px solid transparent',
                                    cursor: 'pointer',
                                    flexShrink: 0,
                                }}
                            />
                        ))}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <input
                                type="color"
                                value={primaryColor}
                                onChange={(e) => setPrimaryColor(e.target.value)}
                                style={{ width: 32, height: 32, borderRadius: 6, border: '1px solid #d2d2d7', cursor: 'pointer', padding: 2 }}
                            />
                            <input
                                type="text"
                                value={primaryColor}
                                onChange={(e) => setPrimaryColor(e.target.value)}
                                placeholder="#0052cc"
                                className="approval-input"
                                style={{ width: 90, fontFamily: 'ui-monospace, monospace' }}
                            />
                        </div>
                    </div>
                </div>

                {/* Preview strip */}
                <div style={{ padding: '0.65rem 0.85rem', background: primaryColor, borderRadius: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {logoUrl && <img src={logoUrl} alt="logo preview" style={{ height: 24, objectFit: 'contain', borderRadius: 4 }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />}
                    <span style={{ color: '#fff', fontSize: '0.85rem', fontWeight: 600 }}>
                        {portalTitle || companyName || 'Your Portal'}
                    </span>
                </div>

                <button type="button" className="primary-action" onClick={() => void handleSave()} disabled={saving} style={{ alignSelf: 'flex-start' }}>
                    {saving ? 'Saving…' : 'Save branding'}
                </button>
            </div>
        </section>
    );
}
