'use client';

import { useState } from 'react';
import { SalesSectionNav } from '../../components/sales-section-nav';
import { PageHeader } from '../../components/page-header';

type ConfigState = {
    productDescription: string;
    icp: string;
    leadSourceProvider: string;
    emailProvider: string;
    crmProvider: string;
    calendarProvider: string;
    signatureProvider: string;
    emailTone: string;
    followUpDays: string;
    maxProspectsPerDay: string;
    active: boolean;
    telephonyProvider: string;
    callWebhookBaseUrl: string;
    twilioAccountSid: string;
    twilioAuthToken: string;
    twilioFromNumber: string;
    phantombusterApiKey: string;
    phantombusterLinkedInPhantomId: string;
    marketResearchEnabled: boolean;
    newsApiKey: string;
    marketResearchIntervalHours: string;
    maxDiscountPercent: string;
    discountApprovalRequired: boolean;
    discountApproverEmail: string;
    npsEnabled: boolean;
    upsellEnabled: boolean;
    upsellCheckInDays: string;
    crmSyncEnabled: boolean;
    hubspotAccessToken: string;
    salesforceInstanceUrl: string;
    salesforceAccessToken: string;
};

const EMPTY_CONFIG: ConfigState = {
    productDescription: '',
    icp: '',
    leadSourceProvider: '',
    emailProvider: '',
    crmProvider: '',
    calendarProvider: '',
    signatureProvider: '',
    emailTone: 'conversational',
    followUpDays: '3, 7, 14',
    maxProspectsPerDay: '50',
    active: true,
    telephonyProvider: '',
    callWebhookBaseUrl: '',
    twilioAccountSid: '',
    twilioAuthToken: '',
    twilioFromNumber: '',
    phantombusterApiKey: '',
    phantombusterLinkedInPhantomId: '',
    marketResearchEnabled: false,
    newsApiKey: '',
    marketResearchIntervalHours: '',
    maxDiscountPercent: '',
    discountApprovalRequired: false,
    discountApproverEmail: '',
    npsEnabled: false,
    upsellEnabled: false,
    upsellCheckInDays: '90',
    crmSyncEnabled: false,
    hubspotAccessToken: '',
    salesforceInstanceUrl: '',
    salesforceAccessToken: '',
};

const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '0.5rem 0.75rem',
    border: '1px solid var(--line)',
    borderRadius: 6,
    fontSize: '0.875rem',
    color: 'var(--ink)',
    boxSizing: 'border-box',
    background: 'var(--card)',
};

const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '0.8125rem',
    fontWeight: 600,
    color: 'var(--ink)',
    marginBottom: '0.375rem',
};

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
    return (
        <div>
            <label style={labelStyle}>{label}{required ? ' *' : ''}</label>
            {children}
        </div>
    );
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
    return (
        <section style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem', borderTop: '1px solid var(--line)', paddingTop: '1rem' }}>
            <div>
                <h3 style={{ margin: 0, fontSize: '0.9375rem', fontWeight: 700, color: 'var(--ink)' }}>{title}</h3>
                {description && <p style={{ margin: '0.25rem 0 0', fontSize: '0.8125rem', color: 'var(--ink-muted)' }}>{description}</p>}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.875rem' }}>
                {children}
            </div>
        </section>
    );
}

function parseDayList(raw: string): number[] | undefined {
    const nums = raw.split(',').map(s => Number(s.trim())).filter(n => Number.isFinite(n) && n >= 0);
    return nums.length > 0 ? nums : undefined;
}

function toFormState(config: Record<string, unknown>): ConfigState {
    const str = (k: string, fallback = '') => (config[k] != null ? String(config[k]) : fallback);
    const numList = (k: string, fallback: string) => Array.isArray(config[k]) ? (config[k] as unknown[]).join(', ') : fallback;
    return {
        ...EMPTY_CONFIG,
        productDescription: str('productDescription'),
        icp: str('icp'),
        leadSourceProvider: str('leadSourceProvider'),
        emailProvider: str('emailProvider'),
        crmProvider: str('crmProvider'),
        calendarProvider: str('calendarProvider'),
        signatureProvider: str('signatureProvider'),
        emailTone: str('emailTone', 'conversational'),
        followUpDays: numList('followUpDays', '3, 7, 14'),
        maxProspectsPerDay: str('maxProspectsPerDay', '50'),
        active: config['active'] !== false,
        telephonyProvider: str('telephonyProvider'),
        callWebhookBaseUrl: str('callWebhookBaseUrl'),
        twilioAccountSid: str('twilioAccountSid'),
        twilioAuthToken: str('twilioAuthToken'),
        twilioFromNumber: str('twilioFromNumber'),
        phantombusterApiKey: str('phantombusterApiKey'),
        phantombusterLinkedInPhantomId: str('phantombusterLinkedInPhantomId'),
        marketResearchEnabled: Boolean(config['marketResearchEnabled']),
        newsApiKey: str('newsApiKey'),
        marketResearchIntervalHours: str('marketResearchIntervalHours'),
        maxDiscountPercent: str('maxDiscountPercent'),
        discountApprovalRequired: Boolean(config['discountApprovalRequired']),
        discountApproverEmail: str('discountApproverEmail'),
        npsEnabled: Boolean(config['npsEnabled']),
        upsellEnabled: Boolean(config['upsellEnabled']),
        upsellCheckInDays: str('upsellCheckInDays', '90'),
        crmSyncEnabled: Boolean(config['crmSyncEnabled']),
        hubspotAccessToken: str('hubspotAccessToken'),
        salesforceInstanceUrl: str('salesforceInstanceUrl'),
        salesforceAccessToken: str('salesforceAccessToken'),
    };
}

function toRequestBody(c: ConfigState): Record<string, unknown> {
    const body: Record<string, unknown> = {
        productDescription: c.productDescription.trim(),
        icp: c.icp.trim(),
        leadSourceProvider: c.leadSourceProvider.trim(),
        emailProvider: c.emailProvider.trim(),
        crmProvider: c.crmProvider.trim(),
        calendarProvider: c.calendarProvider.trim(),
        signatureProvider: c.signatureProvider.trim(),
        emailTone: c.emailTone.trim() || undefined,
        followUpDays: parseDayList(c.followUpDays),
        maxProspectsPerDay: c.maxProspectsPerDay.trim() ? Number(c.maxProspectsPerDay.trim()) : undefined,
        active: c.active,
        telephonyProvider: c.telephonyProvider.trim() || undefined,
        callWebhookBaseUrl: c.callWebhookBaseUrl.trim() || undefined,
        twilioAccountSid: c.twilioAccountSid.trim() || undefined,
        twilioAuthToken: c.twilioAuthToken.trim() || undefined,
        twilioFromNumber: c.twilioFromNumber.trim() || undefined,
        phantombusterApiKey: c.phantombusterApiKey.trim() || undefined,
        phantombusterLinkedInPhantomId: c.phantombusterLinkedInPhantomId.trim() || undefined,
        marketResearchEnabled: c.marketResearchEnabled,
        newsApiKey: c.newsApiKey.trim() || undefined,
        marketResearchIntervalHours: c.marketResearchIntervalHours.trim() ? Number(c.marketResearchIntervalHours.trim()) : undefined,
        maxDiscountPercent: c.maxDiscountPercent.trim() ? Number(c.maxDiscountPercent.trim()) : undefined,
        discountApprovalRequired: c.discountApprovalRequired,
        discountApproverEmail: c.discountApproverEmail.trim() || undefined,
        npsEnabled: c.npsEnabled,
        upsellEnabled: c.upsellEnabled,
        upsellCheckInDays: c.upsellCheckInDays.trim() ? Number(c.upsellCheckInDays.trim()) : undefined,
        crmSyncEnabled: c.crmSyncEnabled,
        hubspotAccessToken: c.hubspotAccessToken.trim() || undefined,
        salesforceInstanceUrl: c.salesforceInstanceUrl.trim() || undefined,
        salesforceAccessToken: c.salesforceAccessToken.trim() || undefined,
    };
    return body;
}

export default function SalesConfigPage() {
    const [botId, setBotId] = useState('');
    const [loadedBotId, setLoadedBotId] = useState<string | null>(null);
    const [exists, setExists] = useState(false);
    const [config, setConfig] = useState<ConfigState>(EMPTY_CONFIG);
    const [loading, setLoading] = useState(false);
    const [loadError, setLoadError] = useState('');
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState('');
    const [saveOk, setSaveOk] = useState(false);

    function set<K extends keyof ConfigState>(key: K, value: ConfigState[K]) {
        setConfig(c => ({ ...c, [key]: value }));
        setSaveOk(false);
    }

    async function handleLoad(e: React.FormEvent) {
        e.preventDefault();
        const id = botId.trim();
        if (!id) return;
        setLoading(true);
        setLoadError('');
        setSaveError('');
        setSaveOk(false);
        try {
            const res = await fetch(`/api/sales/config/${encodeURIComponent(id)}`);
            if (res.status === 404) {
                setExists(false);
                setConfig(EMPTY_CONFIG);
                setLoadedBotId(id);
                return;
            }
            const data = await res.json() as { config?: Record<string, unknown>; error?: string };
            if (!res.ok) throw new Error(data.error ?? 'Failed to load configuration');
            setExists(true);
            setConfig(toFormState(data.config ?? {}));
            setLoadedBotId(id);
        } catch (err) {
            setLoadError(err instanceof Error ? err.message : 'Failed to load configuration');
            setLoadedBotId(null);
        } finally {
            setLoading(false);
        }
    }

    async function handleSave(e: React.FormEvent) {
        e.preventDefault();
        if (!loadedBotId) return;
        setSaving(true);
        setSaveError('');
        setSaveOk(false);
        try {
            const body = toRequestBody(config);
            const res = exists
                ? await fetch(`/api/sales/config/${encodeURIComponent(loadedBotId)}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                })
                : await fetch('/api/sales/config', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ botId: loadedBotId, ...body }),
                });
            const data = await res.json() as { error?: string };
            if (!res.ok) throw new Error(data.error ?? 'Failed to save configuration');
            setExists(true);
            setSaveOk(true);
        } catch (err) {
            setSaveError(err instanceof Error ? err.message : 'Failed to save configuration');
        } finally {
            setSaving(false);
        }
    }

    return (
        <div>
            <PageHeader
                eyebrow="Sales"
                title="Agent Config"
                description="Configure how a sales_rep bot prospects, emails, calls, and negotiates — provider connections, automation cadence, and guardrails."
                backHref="/sales"
                backLabel="← Sales"
            />
            <SalesSectionNav />

            <form onSubmit={e => { void handleLoad(e); }} style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 320px' }}>
                    <Field label="Bot ID" required>
                        <input style={inputStyle} value={botId} onChange={e => setBotId(e.target.value)} placeholder="e.g. sales-bot-1 (must have role sales_rep)" required />
                    </Field>
                </div>
                <button
                    type="submit"
                    disabled={loading || !botId.trim()}
                    style={{ padding: '0.5rem 1.25rem', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--ink)', fontSize: '0.875rem', fontWeight: 600, cursor: loading ? 'wait' : 'pointer' }}
                >
                    {loading ? 'Loading…' : 'Load configuration'}
                </button>
            </form>
            {loadError && <p style={{ fontSize: '0.8125rem', color: 'var(--danger)' }}>{loadError}</p>}

            {loadedBotId && (
                <form onSubmit={e => { void handleSave(e); }} style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12, padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                        <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--ink)' }}>
                            {exists ? `Editing config for ${loadedBotId}` : `Create config for ${loadedBotId}`}
                        </h2>
                        {!exists && (
                            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--ink-muted)', background: 'var(--bg)', borderRadius: 999, padding: '0.25rem 0.625rem' }}>
                                No existing config — this will create one
                            </span>
                        )}
                    </div>

                    <Section title="Basics" description="Required — describes the product, ideal customer, and channel providers this bot uses.">
                        <Field label="Product description" required>
                            <input style={inputStyle} value={config.productDescription} onChange={e => set('productDescription', e.target.value)} required />
                        </Field>
                        <Field label="Ideal customer profile (ICP)" required>
                            <input style={inputStyle} value={config.icp} onChange={e => set('icp', e.target.value)} required />
                        </Field>
                        <Field label="Lead source provider" required>
                            <input style={inputStyle} value={config.leadSourceProvider} onChange={e => set('leadSourceProvider', e.target.value)} required />
                        </Field>
                        <Field label="Email provider" required>
                            <input style={inputStyle} value={config.emailProvider} onChange={e => set('emailProvider', e.target.value)} required />
                        </Field>
                        <Field label="CRM provider" required>
                            <input style={inputStyle} value={config.crmProvider} onChange={e => set('crmProvider', e.target.value)} required />
                        </Field>
                        <Field label="Calendar provider" required>
                            <input style={inputStyle} value={config.calendarProvider} onChange={e => set('calendarProvider', e.target.value)} required />
                        </Field>
                        <Field label="Signature provider" required>
                            <input style={inputStyle} value={config.signatureProvider} onChange={e => set('signatureProvider', e.target.value)} required />
                        </Field>
                        <Field label="Email tone">
                            <input style={inputStyle} value={config.emailTone} onChange={e => set('emailTone', e.target.value)} placeholder="conversational" />
                        </Field>
                    </Section>

                    <Section title="Automation cadence" description="Controls how aggressively the bot prospects and follows up.">
                        <Field label="Follow-up days (comma-separated)">
                            <input style={inputStyle} value={config.followUpDays} onChange={e => set('followUpDays', e.target.value)} placeholder="3, 7, 14" />
                        </Field>
                        <Field label="Max prospects per day">
                            <input style={inputStyle} type="number" min={0} value={config.maxProspectsPerDay} onChange={e => set('maxProspectsPerDay', e.target.value)} />
                        </Field>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem', color: 'var(--ink)', alignSelf: 'end' }}>
                            <input type="checkbox" checked={config.active} onChange={e => set('active', e.target.checked)} />
                            Agent active
                        </label>
                    </Section>

                    <Section title="Telephony (cold calling)" description="Optional — enables outbound calling via Twilio. Other providers (SignalWire, Plivo, Vonage) can be added via the API.">
                        <Field label="Telephony provider">
                            <input style={inputStyle} value={config.telephonyProvider} onChange={e => set('telephonyProvider', e.target.value)} placeholder="twilio" />
                        </Field>
                        <Field label="Call webhook base URL">
                            <input style={inputStyle} value={config.callWebhookBaseUrl} onChange={e => set('callWebhookBaseUrl', e.target.value)} />
                        </Field>
                        <Field label="Twilio account SID">
                            <input style={inputStyle} value={config.twilioAccountSid} onChange={e => set('twilioAccountSid', e.target.value)} />
                        </Field>
                        <Field label="Twilio auth token">
                            <input style={inputStyle} type="password" value={config.twilioAuthToken} onChange={e => set('twilioAuthToken', e.target.value)} />
                        </Field>
                        <Field label="Twilio from number">
                            <input style={inputStyle} value={config.twilioFromNumber} onChange={e => set('twilioFromNumber', e.target.value)} placeholder="+1…" />
                        </Field>
                    </Section>

                    <Section title="LinkedIn & market research" description="Optional — enables LinkedIn outbound via PhantomBuster and automated market-research briefings.">
                        <Field label="PhantomBuster API key">
                            <input style={inputStyle} type="password" value={config.phantombusterApiKey} onChange={e => set('phantombusterApiKey', e.target.value)} />
                        </Field>
                        <Field label="PhantomBuster LinkedIn phantom ID">
                            <input style={inputStyle} value={config.phantombusterLinkedInPhantomId} onChange={e => set('phantombusterLinkedInPhantomId', e.target.value)} />
                        </Field>
                        <Field label="News API key">
                            <input style={inputStyle} type="password" value={config.newsApiKey} onChange={e => set('newsApiKey', e.target.value)} />
                        </Field>
                        <Field label="Market research interval (hours)">
                            <input style={inputStyle} type="number" min={0} value={config.marketResearchIntervalHours} onChange={e => set('marketResearchIntervalHours', e.target.value)} />
                        </Field>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem', color: 'var(--ink)', alignSelf: 'end' }}>
                            <input type="checkbox" checked={config.marketResearchEnabled} onChange={e => set('marketResearchEnabled', e.target.checked)} />
                            Market research enabled
                        </label>
                    </Section>

                    <Section title="Negotiation, NPS & upsell" description="Guardrails for discounting, plus relationship-management automations.">
                        <Field label="Max discount %">
                            <input style={inputStyle} type="number" min={0} max={100} value={config.maxDiscountPercent} onChange={e => set('maxDiscountPercent', e.target.value)} />
                        </Field>
                        <Field label="Discount approver email">
                            <input style={inputStyle} type="email" value={config.discountApproverEmail} onChange={e => set('discountApproverEmail', e.target.value)} />
                        </Field>
                        <Field label="Upsell check-in days">
                            <input style={inputStyle} type="number" min={0} value={config.upsellCheckInDays} onChange={e => set('upsellCheckInDays', e.target.value)} />
                        </Field>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', justifyContent: 'center' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem', color: 'var(--ink)' }}>
                                <input type="checkbox" checked={config.discountApprovalRequired} onChange={e => set('discountApprovalRequired', e.target.checked)} />
                                Discount approval required
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem', color: 'var(--ink)' }}>
                                <input type="checkbox" checked={config.npsEnabled} onChange={e => set('npsEnabled', e.target.checked)} />
                                NPS surveys enabled
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem', color: 'var(--ink)' }}>
                                <input type="checkbox" checked={config.upsellEnabled} onChange={e => set('upsellEnabled', e.target.checked)} />
                                Upsell check-ins enabled
                            </label>
                        </div>
                    </Section>

                    <Section title="External CRM sync" description="Optional — syncs prospects/deals to HubSpot or Salesforce.">
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem', color: 'var(--ink)', alignSelf: 'end' }}>
                            <input type="checkbox" checked={config.crmSyncEnabled} onChange={e => set('crmSyncEnabled', e.target.checked)} />
                            CRM sync enabled
                        </label>
                        <Field label="HubSpot access token">
                            <input style={inputStyle} type="password" value={config.hubspotAccessToken} onChange={e => set('hubspotAccessToken', e.target.value)} />
                        </Field>
                        <Field label="Salesforce instance URL">
                            <input style={inputStyle} value={config.salesforceInstanceUrl} onChange={e => set('salesforceInstanceUrl', e.target.value)} />
                        </Field>
                        <Field label="Salesforce access token">
                            <input style={inputStyle} type="password" value={config.salesforceAccessToken} onChange={e => set('salesforceAccessToken', e.target.value)} />
                        </Field>
                    </Section>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', borderTop: '1px solid var(--line)', paddingTop: '1rem' }}>
                        <button
                            type="submit"
                            disabled={saving || !config.productDescription.trim() || !config.icp.trim() || !config.leadSourceProvider.trim() || !config.emailProvider.trim() || !config.crmProvider.trim() || !config.calendarProvider.trim() || !config.signatureProvider.trim()}
                            style={{ padding: '0.5rem 1.5rem', borderRadius: 8, border: 'none', background: 'var(--info)', color: '#fff', fontSize: '0.875rem', fontWeight: 600, cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1 }}
                        >
                            {saving ? 'Saving…' : exists ? 'Save changes' : 'Create configuration'}
                        </button>
                        {saveError && <span style={{ fontSize: '0.8125rem', color: 'var(--danger)' }}>{saveError}</span>}
                        {saveOk && <span style={{ fontSize: '0.8125rem', color: 'var(--ok)', fontWeight: 600 }}>Saved.</span>}
                    </div>
                </form>
            )}
        </div>
    );
}
