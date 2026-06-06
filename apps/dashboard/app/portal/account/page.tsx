'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

type Me = { accountId: string; tenantId: string; email: string; displayName: string | null; role: string };

const inputStyle: React.CSSProperties = {
    width: '100%', padding: '0.5rem 0.7rem', fontSize: '0.88rem',
    border: '1px solid #e2e8f0', borderRadius: 6, outline: 'none', fontFamily: 'inherit',
    background: '#fff', color: '#0f172a',
};
const labelStyle: React.CSSProperties = { display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: '0.3rem' };
const sectionStyle: React.CSSProperties = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '1.4rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' };
const sectionTitle: React.CSSProperties = { fontSize: '1rem', fontWeight: 700, color: '#111827', margin: 0 };

function StatusMsg({ text, ok }: { text: string; ok: boolean }) {
    return (
        <div style={{ padding: '0.5rem 0.7rem', borderRadius: 6, fontSize: '0.81rem', fontWeight: 600, background: ok ? '#f0fdf4' : '#fef2f2', color: ok ? '#15803d' : '#b91c1c', border: `1px solid ${ok ? '#bbf7d0' : '#fecaca'}` }}>
            {ok ? '✓ ' : '✗ '}{text}
        </div>
    );
}

export default function AccountSettingsPage() {
    const router = useRouter();
    const [me, setMe] = useState<Me | null>(null);
    const [loading, setLoading] = useState(true);

    // Profile form
    const [displayName, setDisplayName] = useState('');
    const [profileMsg, setProfileMsg] = useState<{ text: string; ok: boolean } | null>(null);
    const [profileSaving, setProfileSaving] = useState(false);

    // Password form
    const [currentPw, setCurrentPw] = useState('');
    const [newPw, setNewPw] = useState('');
    const [confirmPw, setConfirmPw] = useState('');
    const [pwMsg, setPwMsg] = useState<{ text: string; ok: boolean } | null>(null);
    const [pwSaving, setPwSaving] = useState(false);

    useEffect(() => {
        fetch('/api/portal/auth/me', { credentials: 'same-origin' })
            .then(async (r) => {
                if (!r.ok) { router.replace('/portal/login'); return; }
                const data = await r.json() as Me;
                setMe(data);
                setDisplayName(data.displayName ?? '');
            })
            .catch(() => router.replace('/portal/login'))
            .finally(() => setLoading(false));
    }, [router]);

    const saveProfile = async (e: FormEvent) => {
        e.preventDefault();
        setProfileMsg(null);
        setProfileSaving(true);
        try {
            const res = await fetch('/api/portal/auth/profile', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({ displayName: displayName.trim() || null }),
            });
            if (res.ok) {
                const data = await res.json() as { displayName: string | null };
                setMe((m) => m ? { ...m, displayName: data.displayName } : m);
                setProfileMsg({ text: 'Display name updated.', ok: true });
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
        if (newPw.length < 8) { setPwMsg({ text: 'New password must be at least 8 characters.', ok: false }); return; }
        setPwSaving(true);
        try {
            const res = await fetch('/api/portal/auth/change-password', {
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
                setPwMsg({ text: b.message ?? (b.error === 'invalid_credentials' ? 'Current password is incorrect.' : 'Password change failed.'), ok: false });
            }
        } catch { setPwMsg({ text: 'Unable to connect.', ok: false }); }
        finally { setPwSaving(false); }
    };

    const signOut = async () => {
        await fetch('/api/portal/auth/logout', { method: 'POST', credentials: 'same-origin' });
        router.push('/portal/login');
    };

    if (loading) {
        return (
            <main style={{ minHeight: 'calc(100vh - 52px)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter, system-ui, sans-serif' }}>
                <p style={{ color: '#6b7280', fontSize: '0.9rem' }}>Loading…</p>
            </main>
        );
    }

    return (
        <main style={{ minHeight: 'calc(100vh - 52px)', background: '#f8fafc', padding: '2rem 1.5rem', fontFamily: 'Inter, system-ui, sans-serif' }}>
            <div style={{ maxWidth: 560, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

                {/* Page header */}
                <div>
                    <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#111827', marginBottom: '0.2rem' }}>Account Settings</h1>
                    <p style={{ fontSize: '0.84rem', color: '#6b7280' }}>Manage your profile and security</p>
                </div>

                {/* Account info (read-only) */}
                <div style={sectionStyle}>
                    <p style={sectionTitle}>Account Info</p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                        {[
                            { label: 'Email', value: me?.email ?? '' },
                            { label: 'Tenant ID', value: me?.tenantId ?? '' },
                            { label: 'Role', value: me?.role ?? '' },
                            { label: 'Account ID', value: (me?.accountId ?? '').slice(0, 16) + '…' },
                        ].map(({ label, value }) => (
                            <div key={label}>
                                <p style={{ fontSize: '0.72rem', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.15rem' }}>{label}</p>
                                <p style={{ fontSize: '0.87rem', color: '#1e293b', fontFamily: label === 'Account ID' || label === 'Tenant ID' ? 'monospace' : 'inherit' }}>{value}</p>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Display name */}
                <div style={sectionStyle}>
                    <p style={sectionTitle}>Profile</p>
                    {profileMsg && <StatusMsg {...profileMsg} />}
                    <form onSubmit={(e) => void saveProfile(e)} style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                        <div>
                            <label style={labelStyle}>Display Name</label>
                            <input
                                type="text" value={displayName}
                                onChange={(e) => setDisplayName(e.target.value)}
                                placeholder="Your name (shown in the portal)"
                                style={inputStyle}
                            />
                        </div>
                        <button type="submit" disabled={profileSaving} style={{ alignSelf: 'flex-start', padding: '0.4rem 1rem', fontSize: '0.84rem', fontWeight: 600, background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
                            {profileSaving ? 'Saving…' : 'Save Changes'}
                        </button>
                    </form>
                </div>

                {/* Change password */}
                <div style={sectionStyle}>
                    <p style={sectionTitle}>Change Password</p>
                    {pwMsg && <StatusMsg {...pwMsg} />}
                    <form onSubmit={(e) => void changePassword(e)} style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                        <div>
                            <label style={labelStyle}>Current Password</label>
                            <input type="password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} required autoComplete="current-password" style={inputStyle} />
                        </div>
                        <div>
                            <label style={labelStyle}>New Password</label>
                            <input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} required autoComplete="new-password" minLength={8} placeholder="Min. 8 characters" style={inputStyle} />
                        </div>
                        <div>
                            <label style={labelStyle}>Confirm New Password</label>
                            <input type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} required autoComplete="new-password" style={inputStyle} />
                        </div>
                        <button type="submit" disabled={pwSaving || !currentPw || newPw.length < 8 || newPw !== confirmPw} style={{ alignSelf: 'flex-start', padding: '0.4rem 1rem', fontSize: '0.84rem', fontWeight: 600, background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', opacity: (pwSaving || !currentPw || newPw.length < 8 || newPw !== confirmPw) ? 0.5 : 1 }}>
                            {pwSaving ? 'Updating…' : 'Update Password'}
                        </button>
                    </form>
                </div>

                {/* Sign out */}
                <div style={sectionStyle}>
                    <p style={sectionTitle}>Session</p>
                    <p style={{ fontSize: '0.83rem', color: '#6b7280', margin: 0 }}>Sign out from all portal sessions on this device.</p>
                    <button type="button" onClick={() => void signOut()} style={{ alignSelf: 'flex-start', padding: '0.4rem 1rem', fontSize: '0.84rem', fontWeight: 600, background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: 6, cursor: 'pointer' }}>
                        Sign Out
                    </button>
                </div>
            </div>
        </main>
    );
}
