'use client';

import { useEffect, useState } from 'react';

type Role = 'viewer' | 'operator' | 'admin';

type Member = {
    id: string;
    email: string;
    name: string;
    role: Role;
    createdAt: string;
};

const ROLES: Role[] = ['viewer', 'operator', 'admin'];

const roleBadge: Record<Role, React.CSSProperties> = {
    viewer: { background: '#1c2b3a', color: '#7dd3fc' },
    operator: { background: '#1c2a1c', color: '#86efac' },
    admin: { background: '#2d1b3a', color: '#d8b4fe' },
};

export default function TeamPanel() {
    const [members, setMembers] = useState<Member[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Invite form state
    const [showInvite, setShowInvite] = useState(false);
    const [inviteEmail, setInviteEmail] = useState('');
    const [inviteName, setInviteName] = useState('');
    const [invitePassword, setInvitePassword] = useState('');
    const [inviteRole, setInviteRole] = useState<Role>('viewer');
    const [inviting, setInviting] = useState(false);
    const [inviteError, setInviteError] = useState<string | null>(null);

    // Delete confirmation state
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

    const fetchMembers = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/team/members', { cache: 'no-store' });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = (await res.json()) as { members: Member[] };
            setMembers(data.members ?? []);
        } catch {
            setError('Failed to load team members.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { void fetchMembers(); }, []);

    const handleInvite = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!inviteEmail.trim() || !inviteName.trim() || !invitePassword.trim()) {
            setInviteError('All fields are required.');
            return;
        }
        setInviting(true);
        setInviteError(null);
        try {
            const res = await fetch('/api/team/members', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: inviteEmail.trim(), name: inviteName.trim(), password: invitePassword, role: inviteRole }),
            });
            const body = await res.json() as { error?: string; message?: string };
            if (!res.ok) {
                setInviteError(body.message ?? body.error ?? `Error ${res.status}`);
                return;
            }
            setShowInvite(false);
            setInviteEmail('');
            setInviteName('');
            setInvitePassword('');
            setInviteRole('viewer');
            await fetchMembers();
        } catch {
            setInviteError('Failed to invite member.');
        } finally {
            setInviting(false);
        }
    };

    const handleDelete = async (userId: string) => {
        setDeletingId(userId);
        setConfirmDeleteId(null);
        try {
            const res = await fetch(`/api/team/members/${encodeURIComponent(userId)}`, { method: 'DELETE' });
            if (!res.ok && res.status !== 204) {
                const body = await res.json() as { message?: string; error?: string };
                setError(body.message ?? body.error ?? `Error ${res.status}`);
                return;
            }
            await fetchMembers();
        } catch {
            setError('Failed to remove member.');
        } finally {
            setDeletingId(null);
        }
    };

    const inputStyle: React.CSSProperties = {
        fontSize: '0.85rem',
        padding: '0.3rem 0.5rem',
        borderRadius: '4px',
        border: '1px solid var(--line)',
        background: 'var(--bg)',
        color: 'var(--ink)',
        minWidth: '10rem',
    };

    const thStyle: React.CSSProperties = {
        padding: '0.4rem 0.5rem',
        color: 'var(--ink-muted)',
        fontWeight: 600,
        textAlign: 'left',
        borderBottom: '1px solid var(--line)',
    };

    return (
        <section className="card" style={{ marginTop: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <div>
                    <h2 style={{ marginBottom: '0.2rem' }}>Team Members</h2>
                    <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--ink-muted)' }}>
                        Manage users and roles for this tenant.
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                        onClick={() => void fetchMembers()}
                        disabled={loading}
                        style={{ fontSize: '0.85rem', padding: '0.3rem 0.75rem', borderRadius: '4px', cursor: 'pointer' }}
                    >
                        {loading ? 'Loading…' : 'Refresh'}
                    </button>
                    <button
                        onClick={() => { setShowInvite(v => !v); setInviteError(null); }}
                        style={{ fontSize: '0.85rem', padding: '0.3rem 0.75rem', borderRadius: '4px', cursor: 'pointer', background: 'var(--accent)', color: '#fff', border: 'none' }}
                    >
                        {showInvite ? 'Cancel' : '+ Invite'}
                    </button>
                </div>
            </div>

            {/* Error banner */}
            {error && (
                <p style={{ padding: '0.6rem 0.8rem', background: '#450a0a', border: '1px solid #991b1b', borderRadius: '6px', color: '#fca5a5', fontSize: '0.84rem', marginBottom: '0.75rem' }}>
                    {error}
                </p>
            )}

            {/* Invite form */}
            {showInvite && (
                <form onSubmit={e => void handleInvite(e)} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', background: 'var(--bg-raised, #0f172a)', border: '1px solid var(--line)', borderRadius: '8px', padding: '1rem', marginBottom: '1rem' }}>
                    <p style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--ink)', margin: '0 0 0.25rem' }}>Invite new member</p>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <input type="text" placeholder="Full name" value={inviteName} onChange={e => setInviteName(e.target.value)} required style={inputStyle} />
                        <input type="email" placeholder="Email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} required style={inputStyle} />
                        <input type="password" placeholder="Temporary password" value={invitePassword} onChange={e => setInvitePassword(e.target.value)} required style={inputStyle} />
                        <select value={inviteRole} onChange={e => setInviteRole(e.target.value as Role)} style={inputStyle}>
                            {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                        <button type="submit" disabled={inviting} style={{ fontSize: '0.85rem', padding: '0.3rem 0.75rem', borderRadius: '4px', cursor: 'pointer', background: '#2563eb', color: '#fff', border: 'none' }}>
                            {inviting ? 'Inviting…' : 'Send invite'}
                        </button>
                    </div>
                    {inviteError && (
                        <p style={{ color: '#fca5a5', fontSize: '0.82rem', margin: 0 }}>{inviteError}</p>
                    )}
                </form>
            )}

            {/* Loading skeleton */}
            {loading && (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                    <thead>
                        <tr>{['Name', 'Email', 'Role', 'Joined', ''].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr>
                    </thead>
                    <tbody>
                        {[0, 1, 2].map(i => (
                            <tr key={i} style={{ borderBottom: '1px solid var(--line)', opacity: 0.4 }}>
                                {[0, 1, 2, 3, 4].map(j => (
                                    <td key={j} style={{ padding: '0.5rem' }}>
                                        <div style={{ height: '0.8rem', background: 'var(--line)', borderRadius: '3px', width: '70%' }} />
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}

            {/* Empty state */}
            {!loading && members.length === 0 && !error && (
                <p style={{ color: 'var(--ink-muted)', fontSize: '0.86rem', textAlign: 'center', padding: '1.5rem 0' }}>
                    No team members found.
                </p>
            )}

            {/* Members table */}
            {!loading && members.length > 0 && (
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                        <thead>
                            <tr>{['Name', 'Email', 'Role', 'Joined', ''].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr>
                        </thead>
                        <tbody>
                            {members.map(m => {
                                const joined = new Date(m.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
                                const badgeStyle = roleBadge[m.role] ?? roleBadge.viewer;
                                return (
                                    <tr key={m.id} style={{ borderBottom: '1px solid var(--line)' }}>
                                        <td style={{ padding: '0.5rem', color: 'var(--ink)' }}>{m.name}</td>
                                        <td style={{ padding: '0.5rem', color: 'var(--ink-muted)' }}>{m.email}</td>
                                        <td style={{ padding: '0.5rem' }}>
                                            <span style={{ ...badgeStyle, padding: '0.15rem 0.5rem', borderRadius: '4px', fontSize: '0.78rem', fontWeight: 600 }}>
                                                {m.role}
                                            </span>
                                        </td>
                                        <td style={{ padding: '0.5rem', color: 'var(--ink-muted)' }}>{joined}</td>
                                        <td style={{ padding: '0.5rem', textAlign: 'right' }}>
                                            {confirmDeleteId === m.id ? (
                                                <span style={{ display: 'inline-flex', gap: '0.4rem', alignItems: 'center' }}>
                                                    <span style={{ fontSize: '0.78rem', color: '#fca5a5' }}>Remove?</span>
                                                    <button
                                                        onClick={() => void handleDelete(m.id)}
                                                        disabled={deletingId === m.id}
                                                        style={{ fontSize: '0.78rem', padding: '0.2rem 0.5rem', borderRadius: '4px', cursor: 'pointer', background: '#991b1b', color: '#fff', border: 'none' }}
                                                    >
                                                        {deletingId === m.id ? '…' : 'Yes'}
                                                    </button>
                                                    <button
                                                        onClick={() => setConfirmDeleteId(null)}
                                                        style={{ fontSize: '0.78rem', padding: '0.2rem 0.5rem', borderRadius: '4px', cursor: 'pointer' }}
                                                    >
                                                        No
                                                    </button>
                                                </span>
                                            ) : (
                                                <button
                                                    onClick={() => setConfirmDeleteId(m.id)}
                                                    style={{ fontSize: '0.78rem', padding: '0.2rem 0.5rem', borderRadius: '4px', cursor: 'pointer', color: '#fca5a5', background: 'transparent', border: '1px solid #991b1b' }}
                                                >
                                                    Remove
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    );
}
