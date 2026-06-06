'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '../components/page-header';

type Me = {
    userId: string;
    tenantId: string;
    email: string;
    name: string;
    role: string;
};

const ROLE_DESCRIPTIONS: Record<string, { label: string; capabilities: string[] }> = {
    viewer: {
        label: 'Viewer',
        capabilities: [
            'View dashboard, agents, tasks, and audit log',
            'Read connector status and governance reports',
            'Browse knowledge base and memory patterns',
        ],
    },
    operator: {
        label: 'Operator',
        capabilities: [
            'Everything Viewers can do',
            'Approve or reject agent actions',
            'Answer agent clarification questions',
            'Trigger manual task retries',
        ],
    },
    admin: {
        label: 'Admin',
        capabilities: [
            'Everything Operators can do',
            'Invite and remove team members',
            'Change member roles (viewer / operator / admin)',
            'Manage API keys, SSO, LLM config, and billing',
        ],
    },
    owner: {
        label: 'Owner',
        capabilities: [
            'Everything Admins can do',
            'Cannot be removed or have role changed',
            'Full control over the tenant',
        ],
    },
};

function StatusMsg({ text, ok }: { text: string; ok: boolean }) {
    return (
        <div
            className={ok ? 'panel-inline-note success' : 'panel-inline-note error'}
            role="alert"
        >
            {ok ? '✓ ' : '✗ '}{text}
        </div>
    );
}

export default function AccountPage() {
    const router = useRouter();
    const [me, setMe] = useState<Me | null>(null);
    const [loading, setLoading] = useState(true);

    // Profile form
    const [name, setName] = useState('');
    const [profileMsg, setProfileMsg] = useState<{ text: string; ok: boolean } | null>(null);
    const [profileSaving, setProfileSaving] = useState(false);

    // Password form
    const [currentPw, setCurrentPw] = useState('');
    const [newPw, setNewPw] = useState('');
    const [confirmPw, setConfirmPw] = useState('');
    const [pwMsg, setPwMsg] = useState<{ text: string; ok: boolean } | null>(null);
    const [pwSaving, setPwSaving] = useState(false);

    useEffect(() => {
        fetch('/api/auth/me', { credentials: 'same-origin' })
            .then(async (r) => {
                if (!r.ok) { router.replace('/login?next=/account'); return; }
                const data = await r.json() as Me;
                setMe(data);
                setName(data.name ?? '');
            })
            .catch(() => router.replace('/login?next=/account'))
            .finally(() => setLoading(false));
    }, [router]);

    const saveProfile = async (e: FormEvent) => {
        e.preventDefault();
        setProfileMsg(null);
        const trimmed = name.trim();
        if (!trimmed) { setProfileMsg({ text: 'Name cannot be empty.', ok: false }); return; }
        setProfileSaving(true);
        try {
            const res = await fetch('/api/auth/profile', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({ name: trimmed }),
            });
            if (res.ok) {
                const data = await res.json() as { name: string };
                setMe((m) => m ? { ...m, name: data.name } : m);
                setName(data.name);
                setProfileMsg({ text: 'Name updated successfully.', ok: true });
            } else {
                const b = await res.json() as { message?: string };
                setProfileMsg({ text: b.message ?? 'Update failed.', ok: false });
            }
        } catch { setProfileMsg({ text: 'Unable to connect.', ok: false }); }
        finally { setProfileSaving(false); }
    };

    const changePassword = async (e: FormEvent) => {
        e.preventDefault();
        setPwMsg(null);
        if (newPw !== confirmPw) { setPwMsg({ text: 'Passwords do not match.', ok: false }); return; }
        if (newPw.length < 10) { setPwMsg({ text: 'New password must be at least 10 characters.', ok: false }); return; }
        setPwSaving(true);
        try {
            const res = await fetch('/api/auth/change-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }),
            });
            if (res.ok) {
                setPwMsg({ text: 'Password changed successfully.', ok: true });
                setCurrentPw(''); setNewPw(''); setConfirmPw('');
            } else {
                const b = await res.json() as { error?: string; message?: string };
                const msg = b.error === 'invalid_credentials'
                    ? 'Current password is incorrect.'
                    : b.error === 'sso_account'
                        ? 'Password changes are not available for SSO accounts.'
                        : (b.message ?? 'Password change failed.');
                setPwMsg({ text: msg, ok: false });
            }
        } catch { setPwMsg({ text: 'Unable to connect.', ok: false }); }
        finally { setPwSaving(false); }
    };

    if (loading) {
        return (
            <main className="page-shell">
                <p className="panel-muted" style={{ padding: '2rem' }}>Loading…</p>
            </main>
        );
    }

    const roleInfo = me ? (ROLE_DESCRIPTIONS[me.role] ?? null) : null;

    return (
        <main className="page-shell">
            <PageHeader
                eyebrow="Administration"
                title="My Account"
                description="Manage your profile, password, and view your access level."
            />

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', maxWidth: 620 }}>

                {/* Account info */}
                <section className="card">
                    <h2 style={{ marginBottom: '1rem' }}>Account Info</h2>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.9rem' }}>
                        {[
                            { label: 'Email', value: me?.email ?? '' },
                            { label: 'Role', value: me?.role ?? '' },
                            { label: 'Tenant ID', value: me?.tenantId ?? '', mono: true },
                            { label: 'User ID', value: (me?.userId ?? '').slice(0, 16) + '…', mono: true },
                        ].map(({ label, value, mono }) => (
                            <div key={label}>
                                <p style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.15rem' }}>{label}</p>
                                <p style={{ fontSize: '0.87rem', color: 'var(--ink)', fontFamily: mono ? 'var(--font-mono, monospace)' : 'inherit' }}>{value}</p>
                            </div>
                        ))}
                    </div>
                </section>

                {/* Role capabilities */}
                {roleInfo && (
                    <section className="card">
                        <h2 style={{ marginBottom: '0.5rem' }}>
                            Access Level: <span style={{ color: 'var(--brand)' }}>{roleInfo.label}</span>
                        </h2>
                        <p className="panel-subtitle" style={{ marginBottom: '0.9rem' }}>
                            What you can do with this role:
                        </p>
                        <ul style={{ margin: 0, padding: '0 0 0 1.2rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                            {roleInfo.capabilities.map((cap) => (
                                <li key={cap} style={{ fontSize: '0.85rem', color: 'var(--ink)' }}>{cap}</li>
                            ))}
                        </ul>
                        {(me?.role === 'viewer' || me?.role === 'operator') && (
                            <p className="panel-muted" style={{ marginTop: '0.75rem', fontSize: '0.8rem' }}>
                                Contact an admin or owner to request a role change.
                            </p>
                        )}
                    </section>
                )}

                {/* Edit name */}
                <section className="card">
                    <h2 style={{ marginBottom: '1rem' }}>Profile</h2>
                    {profileMsg && <StatusMsg {...profileMsg} />}
                    <form onSubmit={(e) => void saveProfile(e)} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', marginTop: profileMsg ? '0.75rem' : 0 }}>
                        <label className="panel-field">
                            <span className="panel-field-label">Full Name <span className="required">*</span></span>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                required
                                maxLength={100}
                                className="panel-control"
                                placeholder="Your full name"
                            />
                        </label>
                        <div className="panel-actions-end">
                            <button type="submit" disabled={profileSaving || !name.trim()} className="primary-action">
                                {profileSaving ? 'Saving…' : 'Save Name'}
                            </button>
                        </div>
                    </form>
                </section>

                {/* Change password */}
                <section className="card">
                    <h2 style={{ marginBottom: '1rem' }}>Change Password</h2>
                    {pwMsg && <StatusMsg {...pwMsg} />}
                    <form onSubmit={(e) => void changePassword(e)} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', marginTop: pwMsg ? '0.75rem' : 0 }}>
                        <label className="panel-field">
                            <span className="panel-field-label">Current Password <span className="required">*</span></span>
                            <input
                                type="password"
                                value={currentPw}
                                onChange={(e) => setCurrentPw(e.target.value)}
                                required
                                autoComplete="current-password"
                                className="panel-control"
                            />
                        </label>
                        <label className="panel-field">
                            <span className="panel-field-label">New Password <span className="required">*</span></span>
                            <input
                                type="password"
                                value={newPw}
                                onChange={(e) => setNewPw(e.target.value)}
                                required
                                autoComplete="new-password"
                                minLength={10}
                                placeholder="Min. 10 characters"
                                className="panel-control"
                            />
                        </label>
                        <label className="panel-field">
                            <span className="panel-field-label">Confirm New Password <span className="required">*</span></span>
                            <input
                                type="password"
                                value={confirmPw}
                                onChange={(e) => setConfirmPw(e.target.value)}
                                required
                                autoComplete="new-password"
                                className="panel-control"
                            />
                        </label>
                        <div className="panel-actions-end">
                            <button
                                type="submit"
                                disabled={pwSaving || !currentPw || newPw.length < 10 || newPw !== confirmPw}
                                className="primary-action"
                            >
                                {pwSaving ? 'Updating…' : 'Update Password'}
                            </button>
                        </div>
                    </form>
                </section>

                {/* Sign out */}
                <section className="card">
                    <h2 style={{ marginBottom: '0.5rem' }}>Session</h2>
                    <p className="panel-muted" style={{ marginBottom: '0.9rem' }}>Sign out from this operator dashboard session.</p>
                    <button
                        type="button"
                        onClick={async () => {
                            await fetch('/api/auth/logout', { method: 'POST' });
                            document.cookie = 'agentfarm_internal_session=; path=/; max-age=0; samesite=strict';
                            window.location.href = '/login';
                        }}
                        className="danger-action"
                    >
                        Sign Out
                    </button>
                </section>

            </div>
        </main>
    );
}
