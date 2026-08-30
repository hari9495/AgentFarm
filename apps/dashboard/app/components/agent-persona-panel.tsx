'use client';

import { useEffect, useState } from 'react';

type CommunicationStyle = 'professional' | 'friendly' | 'concise' | 'formal';
type ApprovalPolicy = 'all' | 'medium-high' | 'high-only';

type PersonaFormState = {
    displayName: string;
    emailAddress: string;
    avatarUrl: string;
    communicationStyle: CommunicationStyle;
    disclosureStatement: string;
    language: string;
    timezone: string;
    employeeId: string;
    department: string;
    managerId: string;
    approvalPolicy: ApprovalPolicy;
    shiftEnabled: boolean;
    shiftStart: string;
    shiftEnd: string;
    shiftDays: number[];
};

const DEFAULT_FORM: PersonaFormState = {
    displayName: '',
    emailAddress: '',
    avatarUrl: '',
    communicationStyle: 'professional',
    disclosureStatement: 'This message was sent by an AI agent.',
    language: 'en',
    timezone: 'UTC',
    employeeId: '',
    department: '',
    managerId: '',
    approvalPolicy: 'high-only',
    shiftEnabled: false,
    shiftStart: '09:00',
    shiftEnd: '18:00',
    shiftDays: [1, 2, 3, 4, 5],
};

const COMMUNICATION_STYLES: CommunicationStyle[] = ['professional', 'friendly', 'concise', 'formal'];

const APPROVAL_POLICIES: { value: ApprovalPolicy; label: string; description: string }[] = [
    { value: 'high-only', label: 'High-only (relaxed)', description: 'Low and medium-risk actions auto-execute. Only high-risk actions require approval.' },
    { value: 'medium-high', label: 'Medium & high (strict)', description: 'Low-risk actions auto-execute. Medium and high-risk actions require approval.' },
    { value: 'all', label: 'All actions', description: 'Every action this agent takes — regardless of risk — requires human approval.' },
];

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

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
                    const data = (await res.json()) as {
                        persona: PersonaFormState & {
                            avatarUrl?: string | null;
                            workingHours?: { start: string; end: string; days: number[] } | null;
                        };
                    };
                    if (!cancelled) {
                        setExists(true);
                        const wh = data.persona.workingHours ?? null;
                        setForm({
                            displayName: data.persona.displayName ?? '',
                            emailAddress: data.persona.emailAddress ?? '',
                            avatarUrl: data.persona.avatarUrl ?? '',
                            communicationStyle: (data.persona.communicationStyle as CommunicationStyle) ?? 'professional',
                            disclosureStatement: data.persona.disclosureStatement ?? DEFAULT_FORM.disclosureStatement,
                            language: data.persona.language ?? 'en',
                            timezone: data.persona.timezone ?? 'UTC',
                            employeeId: (data.persona as { employeeId?: string | null }).employeeId ?? '',
                            department: (data.persona as { department?: string | null }).department ?? '',
                            managerId: (data.persona as { managerId?: string | null }).managerId ?? '',
                            approvalPolicy: (data.persona.approvalPolicy as ApprovalPolicy) ?? 'high-only',
                            shiftEnabled: wh !== null,
                            shiftStart: wh?.start ?? DEFAULT_FORM.shiftStart,
                            shiftEnd: wh?.end ?? DEFAULT_FORM.shiftEnd,
                            shiftDays: wh?.days ?? DEFAULT_FORM.shiftDays,
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
        // Org identity (H2) — send (possibly empty → clears the field).
        payload['employeeId'] = form.employeeId.trim() || null;
        payload['department'] = form.department.trim() || null;
        payload['managerId'] = form.managerId.trim() || null;

        payload['approvalPolicy'] = form.approvalPolicy;
        payload['workingHours'] = form.shiftEnabled
            ? { start: form.shiftStart, end: form.shiftEnd, days: form.shiftDays }
            : null;

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

                {/* Org identity (H2) — places the agent in the org chart like a human employee. */}
                <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                    <div style={{ flex: 1 }}>
                        <label htmlFor="persona-employeeId" style={labelStyle}>Employee ID</label>
                        <input
                            id="persona-employeeId"
                            style={inputStyle}
                            placeholder="E-1001"
                            value={form.employeeId}
                            onChange={(e) => setForm((f) => ({ ...f, employeeId: e.target.value }))}
                        />
                    </div>
                    <div style={{ flex: 1 }}>
                        <label htmlFor="persona-department" style={labelStyle}>Department</label>
                        <input
                            id="persona-department"
                            style={inputStyle}
                            placeholder="Engineering"
                            value={form.department}
                            onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}
                        />
                    </div>
                    <div style={{ flex: 1 }}>
                        <label htmlFor="persona-managerId" style={labelStyle}>Manager (bot ID)</label>
                        <input
                            id="persona-managerId"
                            style={inputStyle}
                            placeholder="bot_..."
                            value={form.managerId}
                            onChange={(e) => setForm((f) => ({ ...f, managerId: e.target.value }))}
                        />
                    </div>
                </div>

                <div style={fieldStyle}>
                    <label htmlFor="persona-approvalPolicy" style={labelStyle}>Approval Policy</label>
                    <select
                        id="persona-approvalPolicy"
                        style={inputStyle}
                        value={form.approvalPolicy}
                        onChange={(e) => setForm((f) => ({ ...f, approvalPolicy: e.target.value as ApprovalPolicy }))}
                    >
                        {APPROVAL_POLICIES.map((p) => (
                            <option key={p.value} value={p.value}>{p.label}</option>
                        ))}
                    </select>
                    <p style={{ fontSize: '0.75rem', color: 'var(--ink-muted)', marginTop: '0.25rem' }}>
                        {APPROVAL_POLICIES.find((p) => p.value === form.approvalPolicy)?.description}
                    </p>
                </div>

                <div style={fieldStyle}>
                    <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: '0.5rem', textTransform: 'none', letterSpacing: 'normal' }}>
                        <input
                            type="checkbox"
                            checked={form.shiftEnabled}
                            onChange={(e) => setForm((f) => ({ ...f, shiftEnabled: e.target.checked }))}
                        />
                        Restrict to working hours (unchecked = always on, 24/7)
                    </label>
                    {form.shiftEnabled && (
                        <div style={{ marginTop: '0.6rem' }}>
                            <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.6rem' }}>
                                <div style={{ flex: 1 }}>
                                    <label htmlFor="persona-shiftStart" style={labelStyle}>Start</label>
                                    <input
                                        id="persona-shiftStart"
                                        type="time"
                                        style={inputStyle}
                                        value={form.shiftStart}
                                        onChange={(e) => setForm((f) => ({ ...f, shiftStart: e.target.value }))}
                                    />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <label htmlFor="persona-shiftEnd" style={labelStyle}>End</label>
                                    <input
                                        id="persona-shiftEnd"
                                        type="time"
                                        style={inputStyle}
                                        value={form.shiftEnd}
                                        onChange={(e) => setForm((f) => ({ ...f, shiftEnd: e.target.value }))}
                                    />
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                                {WEEKDAY_LABELS.map((label, day) => {
                                    const active = form.shiftDays.includes(day);
                                    return (
                                        <button
                                            key={day}
                                            type="button"
                                            onClick={() => setForm((f) => ({
                                                ...f,
                                                shiftDays: active ? f.shiftDays.filter((d) => d !== day) : [...f.shiftDays, day].sort(),
                                            }))}
                                            style={{
                                                padding: '0.3rem 0.65rem',
                                                borderRadius: '99px',
                                                fontSize: '0.78rem',
                                                fontWeight: 500,
                                                border: '1px solid var(--border, #d1d5db)',
                                                background: active ? 'var(--accent, #2563EB)' : 'transparent',
                                                color: active ? '#fff' : 'var(--ink)',
                                                cursor: 'pointer',
                                            }}
                                        >
                                            {label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}
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
                        background: 'var(--accent, #2563EB)',
                        color: 'var(--card)',
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
