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

type RoleCatalogEntry = {
    roleKey: string;
    displayName: string;
    description: string;
    roleVersion: string;
    active: boolean;
};

const ROLES: Role[] = ['viewer', 'operator', 'admin'];

const roleBadge: Record<Role, React.CSSProperties> = {
    viewer: { background: '#1c2b3a', color: '#7dd3fc' },
    operator: { background: '#1c2a1c', color: '#86efac' },
    admin: { background: '#2d1b3a', color: '#d8b4fe' },
};

export default function TeamPanel() {
    const [activeTab, setActiveTab] = useState<'members' | 'roles'>('members');
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

    // Roles tab state
    const [catalog, setCatalog] = useState<RoleCatalogEntry[]>([]);
    const [catalogLoading, setCatalogLoading] = useState(false);
    const [catalogError, setCatalogError] = useState<string | null>(null);
    const [assignUserId, setAssignUserId] = useState('');
    const [assignRole, setAssignRole] = useState<Role>('viewer');
    const [assigning, setAssigning] = useState(false);
    const [assignError, setAssignError] = useState<string | null>(null);
    const [assignSuccess, setAssignSuccess] = useState<string | null>(null);

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

    const fetchCatalog = async () => {
        setCatalogLoading(true);
        setCatalogError(null);
        try {
            const res = await fetch('/api/roles/catalog', { cache: 'no-store' });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = (await res.json()) as { roles: RoleCatalogEntry[] };
            setCatalog(data.roles ?? []);
        } catch {
            setCatalogError('Failed to load roles catalog.');
        } finally {
            setCatalogLoading(false);
        }
    };

    useEffect(() => { void fetchMembers(); }, []);

    useEffect(() => {
        if (activeTab === 'roles' && catalog.length === 0 && !catalogLoading) {
            void fetchCatalog();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab]);

    const handleAssignRole = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!assignUserId) {
            setAssignError('Please select a member.');
            return;
        }
        setAssigning(true);
        setAssignError(null);
        setAssignSuccess(null);
        try {
            const res = await fetch(`/api/team/members/${encodeURIComponent(assignUserId)}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ role: assignRole }),
            });
            const body = (await res.json()) as { error?: string; message?: string };
            if (!res.ok) {
                setAssignError(body.message ?? body.error ?? `Error ${res.status}`);
            } else {
                setAssignSuccess('Role updated successfully.');
                await fetchMembers();
            }
        } catch {
            setAssignError('Failed to assign role.');
        } finally {
            setAssigning(false);
        }
    };

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
                    {activeTab === 'members' && (
                        <>
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
                        </>
                    )}
                </div>
            </div>

            {/* Tab switcher */}
            <div
                style={{
                    display: 'flex',
                    gap: '4px',
                    borderBottom: '1px solid var(--line)',
                    marginBottom: '1rem',
                }}
            >
                {(['members', 'roles'] as const).map((tab) => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        style={{
                            padding: '6px 14px',
                            background: 'transparent',
                            border: 'none',
                            borderBottom: activeTab === tab ? '2px solid var(--accent)' : '2px solid transparent',
                            color: activeTab === tab ? 'var(--accent)' : 'var(--ink-muted)',
                            fontSize: '0.84rem',
                            fontWeight: activeTab === tab ? 600 : 400,
                            cursor: 'pointer',
                            marginBottom: '-1px',
                            textTransform: 'capitalize',
                        }}
                    >
                        {tab}
                    </button>
                ))}
            </div>

            {/* ── Members tab ─────────────────────────────────────── */}
            {activeTab === 'members' && (
                <>
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
                </>
            )}

            {/* ── Roles tab ────────────────────────────────────────── */}
            {activeTab === 'roles' && (
                <div>
                    {/* Part A: Catalog cards */}
                    <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--ink)', marginBottom: '0.75rem' }}>
                        Agent Role Catalog
                    </h3>
                    {catalogLoading && (
                        <p style={{ fontSize: '0.84rem', color: 'var(--ink-muted)' }}>Loading catalog…</p>
                    )}
                    {catalogError && (
                        <p style={{ fontSize: '0.84rem', color: '#fca5a5' }}>{catalogError}</p>
                    )}
                    {!catalogLoading && catalog.length > 0 && (
                        <div
                            style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(2, 1fr)',
                                gap: '0.75rem',
                                marginBottom: '1.5rem',
                            }}
                        >
                            {catalog.map((r) => (
                                <div
                                    key={r.roleKey}
                                    style={{
                                        background: 'var(--bg-raised, #0f172a)',
                                        border: '1px solid var(--line)',
                                        borderRadius: '8px',
                                        padding: '0.9rem 1rem',
                                    }}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.4rem' }}>
                                        <span style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--ink)' }}>
                                            {r.displayName}
                                        </span>
                                        {r.active && (
                                            <span style={{ fontSize: '0.7rem', padding: '0.1rem 0.4rem', background: '#14532d', color: '#86efac', borderRadius: '4px', fontWeight: 700 }}>
                                                active
                                            </span>
                                        )}
                                    </div>
                                    <p style={{ fontSize: '0.8rem', color: 'var(--ink-muted)', margin: '0 0 0.5rem' }}>
                                        {r.description}
                                    </p>
                                    <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                                        <span style={{ fontSize: '0.7rem', padding: '0.1rem 0.4rem', background: '#1c2b3a', color: '#7dd3fc', borderRadius: '4px', fontFamily: 'monospace' }}>
                                            {r.roleKey}
                                        </span>
                                        <span style={{ fontSize: '0.7rem', padding: '0.1rem 0.4rem', background: '#1e1b4b', color: '#c7d2fe', borderRadius: '4px' }}>
                                            {r.roleVersion}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Part B: Assign role form */}
                    <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--ink)', marginBottom: '0.75rem' }}>
                        Assign Access Role
                    </h3>
                    <form
                        onSubmit={e => void handleAssignRole(e)}
                        style={{
                            display: 'flex',
                            gap: '0.5rem',
                            flexWrap: 'wrap',
                            alignItems: 'flex-end',
                            background: 'var(--bg-raised, #0f172a)',
                            border: '1px solid var(--line)',
                            borderRadius: '8px',
                            padding: '1rem',
                            marginBottom: '1.5rem',
                        }}
                    >
                        <div>
                            <label style={{ fontSize: '0.78rem', color: 'var(--ink-muted)', display: 'block', marginBottom: '4px' }}>
                                Member
                            </label>
                            <select
                                value={assignUserId}
                                onChange={e => setAssignUserId(e.target.value)}
                                required
                                style={inputStyle}
                            >
                                <option value="">— select —</option>
                                {members.map(m => (
                                    <option key={m.id} value={m.id}>
                                        {m.name} ({m.email})
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label style={{ fontSize: '0.78rem', color: 'var(--ink-muted)', display: 'block', marginBottom: '4px' }}>
                                Role
                            </label>
                            <select
                                value={assignRole}
                                onChange={e => setAssignRole(e.target.value as Role)}
                                style={inputStyle}
                            >
                                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                            </select>
                        </div>
                        <button
                            type="submit"
                            disabled={assigning}
                            style={{ fontSize: '0.85rem', padding: '0.3rem 0.75rem', borderRadius: '4px', cursor: assigning ? 'not-allowed' : 'pointer', background: '#2563eb', color: '#fff', border: 'none' }}
                        >
                            {assigning ? 'Assigning…' : 'Assign'}
                        </button>
                        {assignError && <p style={{ color: '#fca5a5', fontSize: '0.82rem', margin: 0, alignSelf: 'center' }}>{assignError}</p>}
                        {assignSuccess && <p style={{ color: '#86efac', fontSize: '0.82rem', margin: 0, alignSelf: 'center' }}>{assignSuccess}</p>}
                    </form>

                    {/* Part C: Current assignments */}
                    <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--ink)', marginBottom: '0.75rem' }}>
                        Current Assignments
                    </h3>
                    {loading ? (
                        <p style={{ fontSize: '0.84rem', color: 'var(--ink-muted)' }}>Loading members…</p>
                    ) : members.length === 0 ? (
                        <p style={{ fontSize: '0.84rem', color: 'var(--ink-muted)' }}>No members found.</p>
                    ) : (
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                <thead>
                                    <tr>
                                        {['Name', 'Email', 'Role', ''].map(h => <th key={h} style={thStyle}>{h}</th>)}
                                    </tr>
                                </thead>
                                <tbody>
                                    {members.map(m => {
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
                                                <td style={{ padding: '0.5rem', textAlign: 'right' }}>
                                                    {confirmDeleteId === m.id ? (
                                                        <span style={{ display: 'inline-flex', gap: '0.4rem', alignItems: 'center' }}>
                                                            <span style={{ fontSize: '0.78rem', color: '#fca5a5' }}>Revoke?</span>
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
                                                            Revoke
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
                </div>
            )}
        </section>
    );
}
