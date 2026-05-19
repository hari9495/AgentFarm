'use client';

import { useEffect, useState } from 'react';

type CommunicationStyle = 'professional' | 'friendly' | 'concise' | 'formal';

type PersonaFormState = {
    displayName: string;
    emailAddress: string;
    avatarUrl: string;
    communicationStyle: CommunicationStyle;
    disclosureStatement: string;
    language: string;
    timezone: string;
};

const DEFAULT_FORM: PersonaFormState = {
    displayName: '',
    emailAddress: '',
    avatarUrl: '',
    communicationStyle: 'professional',
    disclosureStatement: 'This message was sent by an AI agent.',
    language: 'en',
    timezone: 'UTC',
};

const COMMUNICATION_STYLES: CommunicationStyle[] = ['professional', 'friendly', 'concise', 'formal'];

const LANGUAGES: { code: string; label: string }[] = [
    { code: 'en', label: 'English' },
    { code: 'es', label: 'Spanish' },
    { code: 'fr', label: 'French' },
    { code: 'de', label: 'German' },
    { code: 'pt', label: 'Portuguese' },
    { code: 'ja', label: 'Japanese' },
    { code: 'ko', label: 'Korean' },
    { code: 'zh', label: 'Chinese' },
    { code: 'ar', label: 'Arabic' },
    { code: 'hi', label: 'Hindi' },
];

const TIMEZONES = [
    'UTC',
    'America/New_York',
    'America/Chicago',
    'America/Denver',
    'America/Los_Angeles',
    'Europe/London',
    'Europe/Paris',
    'Europe/Berlin',
    'Asia/Tokyo',
    'Asia/Shanghai',
    'Asia/Kolkata',
    'Australia/Sydney',
];

type AgentPersonaPanelProps = {
    botId: string;
};

export default function AgentPersonaPanel({ botId }: AgentPersonaPanelProps) {
    const [loading, setLoading] = useState(true);
    const [exists, setExists] = useState(false);
    const [form, setForm] = useState<PersonaFormState>(DEFAULT_FORM);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [saveSuccess, setSaveSuccess] = useState(false);

    useEffect(() => {
        let cancelled = false;
        async function load() {
            setLoading(true);
            try {
                const res = await fetch(`/api/settings/personas/${encodeURIComponent(botId)}`, {
                    cache: 'no-store',
                });
                if (res.status === 404) {
                    if (!cancelled) setExists(false);
                    return;
                }
                if (res.ok) {
                    const data = (await res.json()) as { persona: PersonaFormState & { avatarUrl?: string | null } };
                    if (!cancelled) {
                        setExists(true);
                        setForm({
                            displayName: data.persona.displayName ?? '',
                            emailAddress: data.persona.emailAddress ?? '',
                            avatarUrl: data.persona.avatarUrl ?? '',
                            communicationStyle: (data.persona.communicationStyle as CommunicationStyle) ?? 'professional',
                            disclosureStatement: data.persona.disclosureStatement ?? DEFAULT_FORM.disclosureStatement,
                            language: data.persona.language ?? 'en',
                            timezone: data.persona.timezone ?? 'UTC',
                        });
                    }
                }
            } catch {
                // graceful — shows empty form
            } finally {
                if (!cancelled) setLoading(false);
            }
        }
        void load();
        return () => { cancelled = true; };
    }, [botId]);

    async function handleSave(e: React.FormEvent) {
        e.preventDefault();
        setSaving(true);
        setSaveError(null);
        setSaveSuccess(false);

        const payload: Record<string, unknown> = {
            displayName: form.displayName.trim(),
            emailAddress: form.emailAddress.trim(),
            communicationStyle: form.communicationStyle,
            disclosureStatement: form.disclosureStatement,
            language: form.language,
            timezone: form.timezone,
        };
        if (form.avatarUrl.trim()) {
            payload['avatarUrl'] = form.avatarUrl.trim();
        }

        try {
            const method = exists ? 'PATCH' : 'POST';
            const res = await fetch(`/api/settings/personas/${encodeURIComponent(botId)}`, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const data = (await res.json()) as { error?: string; message?: string };
            if (!res.ok) {
                setSaveError(data.message ?? data.error ?? 'Save failed.');
            } else {
                setExists(true);
                setSaveSuccess(true);
            }
        } catch {
            setSaveError('Network error. Please try again.');
        } finally {
            setSaving(false);
        }
    }

    const inputStyle: React.CSSProperties = {
        width: '100%',
        padding: '0.5rem 0.75rem',
        borderRadius: '0.375rem',
        border: '1px solid var(--border, #d1d5db)',
        fontSize: '0.9rem',
        background: 'var(--surface, #fff)',
        color: 'var(--ink, #111)',
        boxSizing: 'border-box',
    };

    const labelStyle: React.CSSProperties = {
        display: 'block',
        fontSize: '0.8rem',
        fontWeight: 600,
        marginBottom: '0.3rem',
        color: 'var(--ink-muted, #6b7280)',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
    };

    const fieldStyle: React.CSSProperties = { marginBottom: '1.25rem' };

    if (loading) {
        return (
            <section style={{ padding: '1.5rem 0' }}>
                <p style={{ color: 'var(--ink-muted)', fontSize: '0.9rem' }}>Loading persona…</p>
            </section>
        );
    }

    return (
        <section style={{ padding: '1.5rem 0' }}>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: '0.35rem', color: 'var(--ink)' }}>
                Agent Persona
            </h2>
            <p style={{ fontSize: '0.875rem', color: 'var(--ink-muted)', marginBottom: '1.5rem' }}>
                {exists
                    ? 'Manage the public identity your agent uses when communicating externally.'
                    : 'No persona configured yet. Set up a public identity for your agent.'}
            </p>

            <form onSubmit={(e) => { void handleSave(e); }} style={{ maxWidth: '520px' }}>
                <div style={fieldStyle}>
                    <label htmlFor="persona-displayName" style={labelStyle}>Display Name</label>
                    <input
                        id="persona-displayName"
                        type="text"
                        style={inputStyle}
                        value={form.displayName}
                        onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
                        placeholder="e.g. Alex"
                        maxLength={100}
                        required
                    />
                </div>

                <div style={fieldStyle}>
                    <label htmlFor="persona-emailAddress" style={labelStyle}>Email Address</label>
                    <input
                        id="persona-emailAddress"
                        type="email"
                        style={inputStyle}
                        value={form.emailAddress}
                        onChange={(e) => setForm((f) => ({ ...f, emailAddress: e.target.value }))}
                        placeholder="e.g. alex@yourcompany.ai"
                        maxLength={255}
                        required
                    />
                </div>

                <div style={fieldStyle}>
                    <label htmlFor="persona-avatarUrl" style={labelStyle}>Avatar URL (optional)</label>
                    <input
                        id="persona-avatarUrl"
                        type="url"
                        style={inputStyle}
                        value={form.avatarUrl}
                        onChange={(e) => setForm((f) => ({ ...f, avatarUrl: e.target.value }))}
                        placeholder="https://…"
                    />
                </div>

                <div style={fieldStyle}>
                    <label htmlFor="persona-communicationStyle" style={labelStyle}>Communication Style</label>
                    <select
                        id="persona-communicationStyle"
                        style={inputStyle}
                        value={form.communicationStyle}
                        onChange={(e) => setForm((f) => ({ ...f, communicationStyle: e.target.value as CommunicationStyle }))}
                    >
                        {COMMUNICATION_STYLES.map((s) => (
                            <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                        ))}
                    </select>
                </div>

                <div style={fieldStyle}>
                    <label htmlFor="persona-disclosureStatement" style={labelStyle}>Disclosure Statement</label>
                    <textarea
                        id="persona-disclosureStatement"
                        style={{ ...inputStyle, minHeight: '72px', resize: 'vertical' }}
                        value={form.disclosureStatement}
                        onChange={(e) => setForm((f) => ({ ...f, disclosureStatement: e.target.value }))}
                    />
                    <p style={{ fontSize: '0.75rem', color: 'var(--ink-muted)', marginTop: '0.25rem' }}>
                        Appended to all external-facing messages.
                    </p>
                </div>

                <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.25rem' }}>
                    <div style={{ flex: 1 }}>
                        <label htmlFor="persona-language" style={labelStyle}>Language</label>
                        <select
                            id="persona-language"
                            style={inputStyle}
                            value={form.language}
                            onChange={(e) => setForm((f) => ({ ...f, language: e.target.value }))}
                        >
                            {LANGUAGES.map((l) => (
                                <option key={l.code} value={l.code}>{l.label}</option>
                            ))}
                        </select>
                    </div>
                    <div style={{ flex: 1 }}>
                        <label htmlFor="persona-timezone" style={labelStyle}>Timezone</label>
                        <select
                            id="persona-timezone"
                            style={inputStyle}
                            value={form.timezone}
                            onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))}
                        >
                            {TIMEZONES.map((tz) => (
                                <option key={tz} value={tz}>{tz}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {saveError && (
                    <p style={{ color: 'var(--status-error, #dc2626)', fontSize: '0.875rem', marginBottom: '0.75rem' }}>
                        {saveError}
                    </p>
                )}
                {saveSuccess && (
                    <p style={{ color: 'var(--status-ok, #16a34a)', fontSize: '0.875rem', marginBottom: '0.75rem' }}>
                        Persona saved successfully.
                    </p>
                )}

                <button
                    type="submit"
                    disabled={saving}
                    style={{
                        padding: '0.55rem 1.25rem',
                        borderRadius: '0.375rem',
                        background: 'var(--accent, #2563eb)',
                        color: '#fff',
                        fontWeight: 600,
                        fontSize: '0.9rem',
                        border: 'none',
                        cursor: saving ? 'not-allowed' : 'pointer',
                        opacity: saving ? 0.7 : 1,
                    }}
                >
                    {saving ? 'Saving…' : exists ? 'Save Changes' : 'Set Up Persona'}
                </button>
            </form>
        </section>
    );
}
