'use client';

import { useEffect, useState } from 'react';

type InviteRole = 'viewer' | 'operator' | 'admin';
type Role = InviteRole | 'owner';

type Member = {
    id: string;
    email: string;
    name: string;
    role: Role;
    createdAt: string;
};

const INVITE_ROLES: InviteRole[] = ['viewer', 'operator', 'admin'];

const roleBadgeClass: Record<Role, string> = {
    viewer: 'badge neutral',
    operator: 'badge low',
    admin: 'badge warn',
    owner: 'badge high',
};

const ROLE_LABEL: Record<Role, string> = {
    viewer: 'Viewer',
    operator: 'Operator',
    admin: 'Admin',
    owner: 'Owner (Superadmin)',
};

export default function TeamPanel() {
    const [activeTab, setActiveTab] = useState<'members' | 'roles'>('members');
    const [members, setMembers] = useState<Member[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Invite form
    const [showInvite, setShowInvite] = useState(false);
    const [inviteEmail, setInviteEmail] = useState('');
    const [inviteName, setInviteName] = useState('');
    const [invitePassword, setInvitePassword] = useState('');
    const [inviteRole, setInviteRole] = useState<InviteRole>('viewer');
    const [inviting, setInviting] = useState(false);
    const [inviteError, setInviteError] = useState<string | null>(null);

    // Delete confirmation
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

    // Inline role change
    const [changingRoleId, setChangingRoleId] = useState<string | null>(null);

    // Roles tab (kept for backwards compat)
    const [assignUserId, setAssignUserId] = useState('');
    const [assignRole, setAssignRole] = useState<InviteRole>('viewer');
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

    useEffect(() => { void fetchMembers(); }, []);

    const handleAssignRole = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!assignUserId) { setAssignError('Please select a member.'); return; }
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

    const handleRoleChange = async (userId: string, newRole: InviteRole) => {
        setChangingRoleId(userId);
        try {
            const res = await fetch(`/api/team/members/${encodeURIComponent(userId)}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ role: newRole }),
            });
            if (!res.ok) {
                const body = (await res.json()) as { message?: string };
                window.alert(body.message ?? 'Failed to update role.');
                return;
            }
            await fetchMembers();
        } catch {
            window.alert('Network error updating role.');
        } finally {
            setChangingRoleId(null);
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
            setInviteEmail(''); setInviteName(''); setInvitePassword(''); setInviteRole('viewer' as InviteRole);
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

    return (
        <section className="card" style={{ marginTop: '1rem' }}>
            {/* Header row */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <div>
                    <h2>Team Members</h2>
                    <p className="panel-subtitle">Manage users and dashboard access roles for this tenant.</p>
                </div>
                {activeTab === 'members' && (
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                            type="button"
                            onClick={() => void fetchMembers()}
                            disabled={loading}
                            className="secondary-action"
                        >
                            {loading ? 'Loading…' : 'Refresh'}
                        </button>
                        <button
                            type="button"
                            onClick={() => { setShowInvite(v => !v); setInviteError(null); }}
                            className="primary-action"
                        >
                            {showInvite ? 'Cancel' : '+ Invite'}
                        </button>
                    </div>
                )}
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: '4px', borderBottom: '1px solid var(--line)', marginBottom: '1.25rem' }}>
                {(['members', 'roles'] as const).map((tab) => (
                    <button
                        key={tab}
                        type="button"
                        onClick={() => setActiveTab(tab)}
                        style={{
                            padding: '6px 16px',
                            background: 'transparent',
                            border: 'none',
                            borderBottom: activeTab === tab ? '2px solid var(--brand)' : '2px solid transparent',
                            color: activeTab === tab ? 'var(--brand)' : 'var(--ink-muted)',
                            fontSize: '0.84rem',
                            fontWeight: activeTab === tab ? 600 : 400,
                            cursor: 'pointer',
                            marginBottom: '-1px',
                            textTransform: 'capitalize',
                        }}
                    >
                        {tab === 'members' ? 'Members' : 'Roles'}
                    </button>
                ))}
            </div>

            {/* ── Members tab ─────────────────────────────────────── */}
            {activeTab === 'members' && (
                <>
                    {error && (
                        <p className="panel-inline-note error" style={{ marginBottom: '0.75rem' }}>{error}</p>
                    )}

                    {/* Invite form */}
                    {showInvite && (
                        <form
                            onSubmit={e => void handleInvite(e)}
                            className="panel-group"
                            style={{ marginBottom: '1.25rem' }}
                        >
                            <h3 className="panel-group-title">Invite new member</h3>
                            <p className="panel-muted" style={{ marginBottom: '0.75rem', fontSize: '0.8rem' }}>
                                Invited members can be assigned <strong>Viewer</strong>, <strong>Operator</strong>, or <strong>Admin</strong> access.
                                The <strong>Owner (Superadmin)</strong> role is assigned automatically to the person who first signs up — it cannot be granted via invite.
                            </p>
                            <div className="panel-form-grid">
                                <label className="panel-field">
                                    <span className="panel-field-label">Full name <span className="required">*</span></span>
                                    <input
                                        type="text"
                                        placeholder="Jane Smith"
                                        value={inviteName}
                                        onChange={e => setInviteName(e.target.value)}
                                        required
                                        className="panel-control"
                                    />
                                </label>
                                <label className="panel-field">
                                    <span className="panel-field-label">Email <span className="required">*</span></span>
                                    <input
                                        type="email"
                                        placeholder="jane@company.com"
                                        value={inviteEmail}
                                        onChange={e => setInviteEmail(e.target.value)}
                                        required
                                        className="panel-control"
                                    />
                                </label>
                                <label className="panel-field">
                                    <span className="panel-field-label">Temporary password <span className="required">*</span></span>
                                    <input
                                        type="password"
                                        placeholder="Set a temporary password"
                                        value={invitePassword}
                                        onChange={e => setInvitePassword(e.target.value)}
                                        required
                                        className="panel-control"
                                    />
                                </label>
                                <label className="panel-field">
                                    <span className="panel-field-label">Access role</span>
                                    <select
                                        value={inviteRole}
                                        onChange={e => setInviteRole(e.target.value as InviteRole)}
                                        className="panel-control"
                                    >
                                        {INVITE_ROLES.map(r => (
                                            <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                                        ))}
                                    </select>
                                </label>
                            </div>
                            {inviteError && (
                                <p className="panel-inline-note error">{inviteError}</p>
                            )}
                            <div className="panel-actions-end">
                                <button type="submit" disabled={inviting} className="primary-action">
                                    {inviting ? 'Inviting…' : 'Send invite'}
                                </button>
                            </div>
                        </form>
                    )}

                    {/* Loading skeleton */}
                    {loading && (
                        <div style={{ overflowX: 'auto' }}>
                            <table className="panel-table" style={{ width: '100%' }}>
                                <thead>
                                    <tr>{['Name', 'Email', 'Role', 'Joined', ''].map(h => (
                                        <th key={h} className="panel-th">{h}</th>
                                    ))}</tr>
                                </thead>
                                <tbody>
                                    {[0, 1, 2].map(i => (
                                        <tr key={i} className="panel-tr" style={{ opacity: 0.4 }}>
                                            {[0, 1, 2, 3, 4].map(j => (
                                                <td key={j} className="panel-td">
                                                    <div style={{ height: '0.75rem', background: 'var(--line)', borderRadius: '3px', width: '70%' }} />
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* Empty state */}
                    {!loading && members.length === 0 && !error && (
                        <p className="panel-muted" style={{ textAlign: 'center', padding: '1.5rem 0' }}>
                            No team members found.
                        </p>
                    )}

                    {/* Members table */}
                    {!loading && members.length > 0 && (
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                <thead>
                                    <tr>
                                        {['Name', 'Email', 'Role', 'Joined', ''].map(h => (
                                            <th key={h} style={{ padding: '0.4rem 0.6rem', color: 'var(--ink-muted)', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'left', borderBottom: '1px solid var(--line)' }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {members.map(m => {
                                        const joined = new Date(m.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
                                        return (
                                            <tr key={m.id} style={{ borderBottom: '1px solid var(--line)' }}>
                                                <td style={{ padding: '0.55rem 0.6rem', color: 'var(--ink)', fontWeight: 500 }}>{m.name}</td>
                                                <td style={{ padding: '0.55rem 0.6rem', color: 'var(--ink-muted)' }}>{m.email}</td>
                                                <td style={{ padding: '0.55rem 0.6rem' }}>
                                                    {m.role === 'owner' ? (
                                                        <span className={roleBadgeClass['owner']} title="Owner role is fixed and cannot be changed">
                                                            {ROLE_LABEL['owner']}
                                                        </span>
                                                    ) : changingRoleId === m.id ? (
                                                        <span style={{ fontSize: '0.75rem', color: 'var(--ink-muted)' }}>Saving…</span>
                                                    ) : (
                                                        <select
                                                            value={m.role}
                                                            onChange={e => void handleRoleChange(m.id, e.target.value as InviteRole)}
                                                            title="Change role"
                                                            style={{
                                                                fontSize: '0.75rem', fontWeight: 700,
                                                                padding: '2px 6px', borderRadius: 4,
                                                                border: '1px solid var(--line)',
                                                                background: m.role === 'admin' ? '#fef9c3' : m.role === 'operator' ? '#dbeafe' : '#f1f5f9',
                                                                color: m.role === 'admin' ? '#92400e' : m.role === 'operator' ? '#1d4ed8' : '#475569',
                                                                cursor: 'pointer',
                                                            }}
                                                        >
                                                            {INVITE_ROLES.map(r => (
                                                                <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                                                            ))}
                                                        </select>
                                                    )}
                                                </td>
                                                <td style={{ padding: '0.55rem 0.6rem', color: 'var(--ink-muted)' }}>{joined}</td>
                                                <td style={{ padding: '0.55rem 0.6rem', textAlign: 'right' }}>
                                                    {m.role === 'owner' ? (
                                                        <span style={{ fontSize: '0.72rem', color: 'var(--ink-muted)', fontStyle: 'italic' }}>Protected</span>
                                                    ) : confirmDeleteId === m.id ? (
                                                        <span style={{ display: 'inline-flex', gap: '0.4rem', alignItems: 'center' }}>
                                                            <span style={{ fontSize: '0.78rem', color: 'var(--ink-muted)' }}>Remove?</span>
                                                            <button
                                                                type="button"
                                                                onClick={() => void handleDelete(m.id)}
                                                                disabled={deletingId === m.id}
                                                                className="danger-action"
                                                                style={{ fontSize: '0.78rem', padding: '0.2rem 0.55rem' }}
                                                            >
                                                                {deletingId === m.id ? '…' : 'Yes'}
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => setConfirmDeleteId(null)}
                                                                className="secondary-action"
                                                                style={{ fontSize: '0.78rem', padding: '0.2rem 0.55rem' }}
                                                            >
                                                                No
                                                            </button>
                                                        </span>
                                                    ) : (
                                                        <button
                                                            type="button"
                                                            onClick={() => setConfirmDeleteId(m.id)}
                                                            className="secondary-action"
                                                            style={{ fontSize: '0.78rem', padding: '0.2rem 0.55rem' }}
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
                    {/* Role hierarchy reference */}
                    <div className="panel-group" style={{ marginBottom: '1.25rem' }}>
                        <h3 className="panel-group-title">Role Hierarchy</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            {([
                                { role: 'owner' as Role, desc: 'Automatically assigned to the person who signs up. Cannot be removed or reassigned. Full superadmin control.' },
                                { role: 'admin' as Role, desc: 'Full control: invite/remove members, change roles, manage billing, API keys, and all settings.' },
                                { role: 'operator' as Role, desc: 'Can approve/reject agent actions, answer agent questions, and trigger task retries.' },
                                { role: 'viewer' as Role, desc: 'Read-only access to the dashboard, agents, tasks, and audit log.' },
                            ] as { role: Role; desc: string }[]).map(({ role, desc }) => (
                                <div key={role} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.65rem' }}>
                                    <span className={roleBadgeClass[role]} style={{ flexShrink: 0, marginTop: '0.05rem' }}>
                                        {ROLE_LABEL[role]}
                                    </span>
                                    <span style={{ fontSize: '0.82rem', color: 'var(--ink-muted)' }}>{desc}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Assign role form */}
                    <form onSubmit={e => void handleAssignRole(e)} className="panel-group" style={{ marginBottom: '1.25rem' }}>
                        <h3 className="panel-group-title">Change Member Role</h3>
                        <div className="panel-form-grid">
                            <label className="panel-field">
                                <span className="panel-field-label">Member</span>
                                <select
                                    value={assignUserId}
                                    onChange={e => setAssignUserId(e.target.value)}
                                    required
                                    className="panel-control"
                                >
                                    <option value="">— select member —</option>
                                    {members.filter(m => m.role !== 'owner').map(m => (
                                        <option key={m.id} value={m.id}>
                                            {m.name} ({m.email}) — {ROLE_LABEL[m.role]}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <label className="panel-field">
                                <span className="panel-field-label">New Role</span>
                                <select
                                    value={assignRole}
                                    onChange={e => setAssignRole(e.target.value as InviteRole)}
                                    className="panel-control"
                                >
                                    {INVITE_ROLES.map(r => (
                                        <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                                    ))}
                                </select>
                            </label>
                        </div>
                        {assignError && <p className="panel-inline-note error">{assignError}</p>}
                        {assignSuccess && <p className="panel-inline-note success">{assignSuccess}</p>}
                        <div className="panel-actions-end">
                            <button type="submit" disabled={assigning} className="primary-action">
                                {assigning ? 'Assigning…' : 'Assign Role'}
                            </button>
                        </div>
                    </form>

                    {/* Current assignments */}
                    <h3 className="panel-group-title" style={{ marginBottom: '0.75rem' }}>Current Assignments</h3>
                    {loading ? (
                        <p className="panel-muted">Loading members…</p>
                    ) : members.length === 0 ? (
                        <p className="panel-muted">No members found.</p>
                    ) : (
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                <thead>
                                    <tr>
                                        {['Name', 'Email', 'Role', ''].map(h => (
                                            <th key={h} style={{ padding: '0.4rem 0.6rem', color: 'var(--ink-muted)', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'left', borderBottom: '1px solid var(--line)' }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {members.map(m => (
                                        <tr key={m.id} style={{ borderBottom: '1px solid var(--line)' }}>
                                            <td style={{ padding: '0.55rem 0.6rem', color: 'var(--ink)', fontWeight: 500 }}>{m.name}</td>
                                            <td style={{ padding: '0.55rem 0.6rem', color: 'var(--ink-muted)' }}>{m.email}</td>
                                            <td style={{ padding: '0.55rem 0.6rem' }}>
                                                <span className={roleBadgeClass[m.role]}>{ROLE_LABEL[m.role]}</span>
                                            </td>
                                            <td style={{ padding: '0.55rem 0.6rem', textAlign: 'right' }}>
                                                {m.role === 'owner' ? (
                                                    <span style={{ fontSize: '0.72rem', color: 'var(--ink-muted)', fontStyle: 'italic' }}>Protected</span>
                                                ) : confirmDeleteId === m.id ? (
                                                    <span style={{ display: 'inline-flex', gap: '0.4rem', alignItems: 'center' }}>
                                                        <span style={{ fontSize: '0.78rem', color: 'var(--ink-muted)' }}>Revoke?</span>
                                                        <button
                                                            type="button"
                                                            onClick={() => void handleDelete(m.id)}
                                                            disabled={deletingId === m.id}
                                                            className="danger-action"
                                                            style={{ fontSize: '0.78rem', padding: '0.2rem 0.55rem' }}
                                                        >
                                                            {deletingId === m.id ? '…' : 'Yes'}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => setConfirmDeleteId(null)}
                                                            className="secondary-action"
                                                            style={{ fontSize: '0.78rem', padding: '0.2rem 0.55rem' }}
                                                        >
                                                            No
                                                        </button>
                                                    </span>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        onClick={() => setConfirmDeleteId(m.id)}
                                                        className="secondary-action"
                                                        style={{ fontSize: '0.78rem', padding: '0.2rem 0.55rem' }}
                                                    >
                                                        Revoke
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}
        </section>
    );
}
