'use client';

import { useState } from 'react';
import { SalesSectionNav } from '../../components/sales-section-nav';
import { PageHeader } from '../../components/page-header';

interface Activity {
    id: string;
    activityType: string;
    subject: string;
    body?: string;
    outcome?: string;
    completedAt?: string;
    createdAt: string;
}

interface OutreachResult {
    success?: boolean;
    [key: string]: unknown;
}

interface ClassifyResult {
    intent?: string;
    [key: string]: unknown;
}

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

const cardStyle: React.CSSProperties = {
    background: 'var(--card)',
    border: '1px solid var(--line)',
    borderRadius: 12,
    padding: '1.25rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.875rem',
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div>
            <label style={labelStyle}>{label}</label>
            {children}
        </div>
    );
}

export default function OutreachPage() {
    // Send outreach
    const [sendBotId, setSendBotId] = useState('');
    const [sendProspectId, setSendProspectId] = useState('');
    const [sequenceStep, setSequenceStep] = useState('');
    const [previousSubject, setPreviousSubject] = useState('');
    const [showEmailConfig, setShowEmailConfig] = useState(false);
    const [emailConfig, setEmailConfig] = useState({
        fromEmail: '', fromName: '', host: '', port: '', user: '', pass: '', apiKey: '', secure: false,
    });
    const [sending, setSending] = useState(false);
    const [sendResult, setSendResult] = useState<OutreachResult | null>(null);
    const [sendError, setSendError] = useState('');

    // Classify reply
    const [classifyProspectId, setClassifyProspectId] = useState('');
    const [originalSubject, setOriginalSubject] = useState('');
    const [replyText, setReplyText] = useState('');
    const [classifying, setClassifying] = useState(false);
    const [classifyResult, setClassifyResult] = useState<ClassifyResult | null>(null);
    const [classifyError, setClassifyError] = useState('');

    // Activity lookup
    const [lookupProspectId, setLookupProspectId] = useState('');
    const [activities, setActivities] = useState<Activity[]>([]);
    const [activitiesLoading, setActivitiesLoading] = useState(false);
    const [activitiesError, setActivitiesError] = useState('');

    async function handleSend(e: React.FormEvent) {
        e.preventDefault();
        if (!sendBotId.trim() || !sendProspectId.trim()) return;
        setSending(true);
        setSendError('');
        setSendResult(null);
        try {
            const cfg: Record<string, unknown> = {};
            if (emailConfig.fromEmail.trim()) cfg.fromEmail = emailConfig.fromEmail.trim();
            if (emailConfig.fromName.trim()) cfg.fromName = emailConfig.fromName.trim();
            if (emailConfig.host.trim()) cfg.host = emailConfig.host.trim();
            if (emailConfig.port.trim()) cfg.port = Number(emailConfig.port.trim());
            if (emailConfig.user.trim()) cfg.user = emailConfig.user.trim();
            if (emailConfig.pass.trim()) cfg.pass = emailConfig.pass.trim();
            if (emailConfig.apiKey.trim()) cfg.apiKey = emailConfig.apiKey.trim();
            if (emailConfig.secure) cfg.secure = true;

            const res = await fetch('/api/sales/outreach/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    botId: sendBotId.trim(),
                    prospectId: sendProspectId.trim(),
                    sequenceStep: sequenceStep.trim() ? Number(sequenceStep.trim()) : undefined,
                    previousSubject: previousSubject.trim() || undefined,
                    emailConfig: cfg,
                }),
            });
            const data = await res.json() as OutreachResult & { error?: string; code?: string };
            if (!res.ok) throw new Error(data.error ?? data.code ?? 'Failed to send outreach');
            setSendResult(data);
        } catch (err) {
            setSendError(err instanceof Error ? err.message : 'Failed to send outreach');
        } finally {
            setSending(false);
        }
    }

    async function handleClassify(e: React.FormEvent) {
        e.preventDefault();
        if (!classifyProspectId.trim() || !replyText.trim() || !originalSubject.trim()) return;
        setClassifying(true);
        setClassifyError('');
        setClassifyResult(null);
        try {
            const res = await fetch('/api/sales/outreach/classify-reply', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prospectId: classifyProspectId.trim(),
                    replyText: replyText.trim(),
                    originalSubject: originalSubject.trim(),
                }),
            });
            const data = await res.json() as ClassifyResult & { error?: string; code?: string };
            if (!res.ok) throw new Error(data.error ?? data.code ?? 'Failed to classify reply');
            setClassifyResult(data);
        } catch (err) {
            setClassifyError(err instanceof Error ? err.message : 'Failed to classify reply');
        } finally {
            setClassifying(false);
        }
    }

    async function handleLookup(e: React.FormEvent) {
        e.preventDefault();
        if (!lookupProspectId.trim()) return;
        setActivitiesLoading(true);
        setActivitiesError('');
        try {
            const res = await fetch(`/api/sales/outreach/activities/${encodeURIComponent(lookupProspectId.trim())}`);
            const data = await res.json() as { activities?: Activity[]; error?: string; code?: string };
            if (!res.ok) throw new Error(data.error ?? data.code ?? 'Failed to load activities');
            setActivities(data.activities ?? []);
        } catch (err) {
            setActivitiesError(err instanceof Error ? err.message : 'Failed to load activities');
            setActivities([]);
        } finally {
            setActivitiesLoading(false);
        }
    }

    return (
        <div>
            <PageHeader
                eyebrow="Sales"
                title="Outreach"
                description="Trigger AI-driven outreach emails, classify inbound replies, and review the resulting activity trail per prospect."
                backHref="/sales"
                backLabel="← Sales"
            />
            <SalesSectionNav />

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1.25rem' }}>
                {/* Send outreach */}
                <form style={cardStyle} onSubmit={e => { void handleSend(e); }}>
                    <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--ink)' }}>Send outreach email</h2>
                    <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--ink-muted)' }}>
                        Sends a sequenced outreach email from the sales bot's configured provider and schedules follow-ups on success.
                    </p>
                    <Field label="Bot ID *">
                        <input style={inputStyle} value={sendBotId} onChange={e => setSendBotId(e.target.value)} placeholder="e.g. sales-bot-1" required />
                    </Field>
                    <Field label="Prospect ID *">
                        <input style={inputStyle} value={sendProspectId} onChange={e => setSendProspectId(e.target.value)} placeholder="prospect record id" required />
                    </Field>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.875rem' }}>
                        <Field label="Sequence step">
                            <input style={inputStyle} type="number" min={0} value={sequenceStep} onChange={e => setSequenceStep(e.target.value)} placeholder="0" />
                        </Field>
                        <Field label="Previous subject">
                            <input style={inputStyle} value={previousSubject} onChange={e => setPreviousSubject(e.target.value)} placeholder="optional — for follow-ups" />
                        </Field>
                    </div>
                    <button
                        type="button"
                        onClick={() => setShowEmailConfig(s => !s)}
                        style={{ alignSelf: 'flex-start', background: 'transparent', border: 'none', color: 'var(--info)', fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer', padding: 0 }}
                    >
                        {showEmailConfig ? '− Hide' : '+ Show'} email connection overrides (optional)
                    </button>
                    {showEmailConfig && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', borderLeft: '2px solid var(--line)', paddingLeft: '0.875rem' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                                <Field label="From email">
                                    <input style={inputStyle} value={emailConfig.fromEmail} onChange={e => setEmailConfig(c => ({ ...c, fromEmail: e.target.value }))} />
                                </Field>
                                <Field label="From name">
                                    <input style={inputStyle} value={emailConfig.fromName} onChange={e => setEmailConfig(c => ({ ...c, fromName: e.target.value }))} />
                                </Field>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                                <Field label="SMTP host">
                                    <input style={inputStyle} value={emailConfig.host} onChange={e => setEmailConfig(c => ({ ...c, host: e.target.value }))} />
                                </Field>
                                <Field label="Port">
                                    <input style={inputStyle} type="number" value={emailConfig.port} onChange={e => setEmailConfig(c => ({ ...c, port: e.target.value }))} />
                                </Field>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                                <Field label="Username">
                                    <input style={inputStyle} value={emailConfig.user} onChange={e => setEmailConfig(c => ({ ...c, user: e.target.value }))} />
                                </Field>
                                <Field label="Password">
                                    <input style={inputStyle} type="password" value={emailConfig.pass} onChange={e => setEmailConfig(c => ({ ...c, pass: e.target.value }))} />
                                </Field>
                            </div>
                            <Field label="Provider API key">
                                <input style={inputStyle} type="password" value={emailConfig.apiKey} onChange={e => setEmailConfig(c => ({ ...c, apiKey: e.target.value }))} />
                            </Field>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem', color: 'var(--ink)' }}>
                                <input type="checkbox" checked={emailConfig.secure} onChange={e => setEmailConfig(c => ({ ...c, secure: e.target.checked }))} />
                                Use TLS (secure connection)
                            </label>
                        </div>
                    )}
                    <button
                        type="submit"
                        disabled={sending || !sendBotId.trim() || !sendProspectId.trim()}
                        style={{ alignSelf: 'flex-start', padding: '0.5rem 1.25rem', borderRadius: 8, border: 'none', background: 'var(--info)', color: '#fff', fontSize: '0.875rem', fontWeight: 600, cursor: sending ? 'wait' : 'pointer', opacity: sending ? 0.7 : 1 }}
                    >
                        {sending ? 'Sending…' : 'Send outreach'}
                    </button>
                    {sendError && <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--danger)' }}>{sendError}</p>}
                    {sendResult && (
                        <pre style={{ margin: 0, fontSize: '0.75rem', background: 'var(--bg)', borderRadius: 6, padding: '0.625rem', overflowX: 'auto', color: 'var(--ink-muted)' }}>
                            {JSON.stringify(sendResult, null, 2)}
                        </pre>
                    )}
                </form>

                {/* Classify reply */}
                <form style={cardStyle} onSubmit={e => { void handleClassify(e); }}>
                    <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--ink)' }}>Classify inbound reply</h2>
                    <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--ink-muted)' }}>
                        Runs the AI reply classifier, updates the prospect's status, and (when interested) advances deals and triggers booking/contract invites automatically.
                    </p>
                    <Field label="Prospect ID *">
                        <input style={inputStyle} value={classifyProspectId} onChange={e => setClassifyProspectId(e.target.value)} placeholder="prospect record id" required />
                    </Field>
                    <Field label="Original subject *">
                        <input style={inputStyle} value={originalSubject} onChange={e => setOriginalSubject(e.target.value)} placeholder="subject of the email they replied to" required />
                    </Field>
                    <Field label="Reply text *">
                        <textarea
                            style={{ ...inputStyle, minHeight: 120, resize: 'vertical', fontFamily: 'inherit' }}
                            value={replyText}
                            onChange={e => setReplyText(e.target.value)}
                            placeholder="Paste the prospect's reply here…"
                            required
                        />
                    </Field>
                    <button
                        type="submit"
                        disabled={classifying || !classifyProspectId.trim() || !replyText.trim() || !originalSubject.trim()}
                        style={{ alignSelf: 'flex-start', padding: '0.5rem 1.25rem', borderRadius: 8, border: 'none', background: 'var(--info)', color: '#fff', fontSize: '0.875rem', fontWeight: 600, cursor: classifying ? 'wait' : 'pointer', opacity: classifying ? 0.7 : 1 }}
                    >
                        {classifying ? 'Classifying…' : 'Classify reply'}
                    </button>
                    {classifyError && <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--danger)' }}>{classifyError}</p>}
                    {classifyResult && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            {classifyResult.intent && (
                                <span style={{ alignSelf: 'flex-start', padding: '0.25rem 0.625rem', borderRadius: 999, fontSize: '0.75rem', fontWeight: 700, background: 'var(--info-bg, var(--line))', color: 'var(--info)' }}>
                                    Intent: {classifyResult.intent}
                                </span>
                            )}
                            <pre style={{ margin: 0, fontSize: '0.75rem', background: 'var(--bg)', borderRadius: 6, padding: '0.625rem', overflowX: 'auto', color: 'var(--ink-muted)' }}>
                                {JSON.stringify(classifyResult, null, 2)}
                            </pre>
                        </div>
                    )}
                </form>

                {/* Activity lookup */}
                <div style={{ ...cardStyle, gridColumn: '1 / -1' }}>
                    <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--ink)' }}>Outreach activity by prospect</h2>
                    <form onSubmit={e => { void handleLookup(e); }} style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                        <div style={{ flex: '1 1 280px' }}>
                            <Field label="Prospect ID">
                                <input style={inputStyle} value={lookupProspectId} onChange={e => setLookupProspectId(e.target.value)} placeholder="prospect record id" />
                            </Field>
                        </div>
                        <button
                            type="submit"
                            disabled={activitiesLoading || !lookupProspectId.trim()}
                            style={{ padding: '0.5rem 1.25rem', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--ink)', fontSize: '0.875rem', fontWeight: 600, cursor: activitiesLoading ? 'wait' : 'pointer' }}
                        >
                            {activitiesLoading ? 'Loading…' : 'Load activity'}
                        </button>
                    </form>
                    {activitiesError && <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--danger)' }}>{activitiesError}</p>}
                    {activities.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            {activities.map(a => (
                                <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', padding: '0.625rem 0.75rem', borderRadius: 8, background: 'var(--bg)', fontSize: '0.8125rem' }}>
                                    <div>
                                        <strong style={{ color: 'var(--ink)' }}>{a.subject || a.activityType}</strong>
                                        <span style={{ color: 'var(--ink-muted)', marginLeft: '0.5rem' }}>{a.activityType}{a.outcome ? ` · ${a.outcome}` : ''}</span>
                                    </div>
                                    <span style={{ color: 'var(--ink-muted)', whiteSpace: 'nowrap' }}>
                                        {new Date(a.completedAt ?? a.createdAt).toLocaleString()}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                    {!activitiesLoading && !activitiesError && activities.length === 0 && (
                        <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--ink-muted)' }}>
                            Enter a prospect ID to view its outreach activity trail.
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}
