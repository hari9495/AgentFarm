'use client';

import { useCallback, useEffect, useState } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

type RetentionPolicy = {
    id: string;
    tenantId: string;
    workspaceId: string | null;
    roleKey: string | null;
    name: string;
    description: string | null;
    scope: string;
    action: string;
    retentionDays: number | null;
    deletionTrigger: string | null;
    deletionSchedule: string | null;
    effectiveFrom: string;
    expiredAt: string | null;
    status: string;
    createdBy: string;
    updatedBy: string;
    correlationId: string;
    createdAt: string;
    updatedAt: string;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const SCOPE_BADGE: Record<string, { bg: string; color: string }> = {
    tenant: { bg: '#1e3a5f', color: '#bfdbfe' },
    workspace: { bg: '#1a3a6b', color: '#a5c8ff' },
    role: { bg: '#1e1b4b', color: '#c7d2fe' },
};

const STATUS_BADGE: Record<string, { bg: string; color: string }> = {
    active: { bg: '#dcfce7', color: '#166534' },
    archived: { bg: '#f1f5f9', color: '#475569' },
    expired: { bg: '#fee2e2', color: '#991b1b' },
};

const ACTION_BADGE: Record<string, { bg: string; color: string }> = {
    never_delete: { bg: '#dcfce7', color: '#166534' },
    archive: { bg: '#fef9c3', color: '#854d0e' },
    delete: { bg: '#fee2e2', color: '#991b1b' },
    anonymize: { bg: '#f3e8ff', color: '#6b21a8' },
};

function inlineBadge(label: string, map: Record<string, { bg: string; color: string }>) {
    const style = map[label] ?? { bg: 'var(--line)', color: 'var(--ink-muted)' };
    return (
        <span
            style={{
                padding: '2px 8px',
                borderRadius: '4px',
                fontSize: '11px',
                fontWeight: 700,
                background: style.bg,
                color: style.color,
            }}
        >
            {label}
        </span>
    );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function RetentionPolicyPanel({ tenantId }: { tenantId: string }) {
    const [policies, setPolicies] = useState<RetentionPolicy[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const [statusFilter, setStatusFilter] = useState('active');

    // Create form state
    const [showCreate, setShowCreate] = useState(false);
    const [createBusy, setCreateBusy] = useState(false);
    const [createError, setCreateError] = useState<string | null>(null);
    const [newPolicy, setNewPolicy] = useState({
        name: '',
        description: '',
        scope: 'tenant',
        action: 'never_delete',
        retentionDays: '',
        workspaceId: '',
        roleKey: '',
    });

    // Edit drawer state
    const [editId, setEditId] = useState<string | null>(null);
    const [editPatch, setEditPatch] = useState({ name: '', description: '', status: '' });
    const [editBusy, setEditBusy] = useState(false);
    const [editError, setEditError] = useState<string | null>(null);

    const [busyId, setBusyId] = useState<string | null>(null);

    const fetchPolicies = useCallback(async () => {
        setLoading(true);
        setError(null);

        const params = new URLSearchParams();
        if (statusFilter) params.set('status', statusFilter);

        const response = await fetch(`/api/retention?${params.toString()}`, { cache: 'no-store' });

        const data = (await response.json().catch(() => ({}))) as {
            policies?: RetentionPolicy[];
            message?: string;
        };

        if (!response.ok) {
            setError(data.message ?? 'Unable to load retention policies.');
            setLoading(false);
            return;
        }

        setPolicies(Array.isArray(data.policies) ? data.policies : []);
        setLoading(false);
    }, [statusFilter]);

    useEffect(() => {
        void fetchPolicies();
    }, [fetchPolicies]);

    const createPolicy = async () => {
        if (!newPolicy.name.trim()) {
            setCreateError('Name is required.');
            return;
        }

        setCreateBusy(true);
        setCreateError(null);

        const payload: Record<string, unknown> = {
            name: newPolicy.name.trim(),
            description: newPolicy.description.trim() || undefined,
            scope: newPolicy.scope,
            action: newPolicy.action,
            effectiveFrom: new Date().toISOString(),
            correlationId: crypto.randomUUID(),
        };

        if (newPolicy.retentionDays.trim()) {
            const days = parseInt(newPolicy.retentionDays.trim(), 10);
            if (!isNaN(days) && days > 0) {
                payload.retentionDays = days;
            }
        }

        if (newPolicy.workspaceId.trim()) payload.workspaceId = newPolicy.workspaceId.trim();
        if (newPolicy.roleKey.trim()) payload.roleKey = newPolicy.roleKey.trim();

        const response = await fetch('/api/retention', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload),
        });

        const data = (await response.json().catch(() => ({}))) as { policy?: RetentionPolicy; message?: string };

        if (!response.ok) {
            setCreateError(data.message ?? 'Failed to create policy.');
            setCreateBusy(false);
            return;
        }

        setNewPolicy({ name: '', description: '', scope: 'tenant', action: 'never_delete', retentionDays: '', workspaceId: '', roleKey: '' });
        setShowCreate(false);
        setCreateBusy(false);
        setMessage('Retention policy created.');
        void fetchPolicies();
    };

    const openEdit = (policy: RetentionPolicy) => {
        setEditId(policy.id);
        setEditPatch({ name: policy.name, description: policy.description ?? '', status: policy.status });
        setEditError(null);
    };

    const submitEdit = async () => {
        if (!editId) return;

        setEditBusy(true);
        setEditError(null);

        const response = await fetch(`/api/retention/${encodeURIComponent(editId)}`, {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                name: editPatch.name.trim() || undefined,
                description: editPatch.description.trim() || undefined,
                status: editPatch.status || undefined,
            }),
        });

        const data = (await response.json().catch(() => ({}))) as { policy?: RetentionPolicy; message?: string };

        if (!response.ok) {
            setEditError(data.message ?? 'Failed to update policy.');
            setEditBusy(false);
            return;
        }

        setEditId(null);
        setEditBusy(false);
        setMessage('Policy updated.');
        void fetchPolicies();
    };

    const deletePolicy = async (id: string) => {
        setBusyId(id);
        setError(null);
        setMessage(null);

        const response = await fetch(`/api/retention/${encodeURIComponent(id)}`, {
            method: 'DELETE',
        });

        const data = (await response.json().catch(() => ({}))) as { message?: string };

        if (!response.ok) {
            setError(data.message ?? 'Unable to delete policy.');
            setBusyId(null);
            return;
        }

        setPolicies((prev) => prev.filter((p) => p.id !== id));
        setMessage('Policy deleted.');
        setBusyId(null);
    };

    return (
        <section className="card" style={{ display: 'grid', gap: '0.85rem' }}>
            <header>
                <h2 style={{ marginBottom: '0.4rem' }}>Retention Policies</h2>
                <p style={{ margin: 0, color: 'var(--ink-soft)', fontSize: '0.86rem' }}>
                    Manage data retention rules for tenant, workspace, and role scopes.
                </p>
            </header>

            <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <span className="badge neutral">Tenant {tenantId}</span>
                <span className="badge low">{policies.length} policies</span>
                <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    style={{
                        padding: '0.35rem 0.55rem',
                        fontSize: '0.83rem',
                        border: '1px solid var(--line)',
                        borderRadius: '4px',
                        background: 'var(--bg)',
                        color: 'var(--ink)',
                    }}
                >
                    <option value="">All statuses</option>
                    <option value="active">Active</option>
                    <option value="archived">Archived</option>
                    <option value="expired">Expired</option>
                </select>
                <button type="button" className="secondary-action" onClick={() => void fetchPolicies()}>
                    Refresh
                </button>
                <button
                    type="button"
                    className="primary-action"
                    style={{ marginLeft: 'auto' }}
                    onClick={() => { setShowCreate((v) => !v); setCreateError(null); }}
                >
                    {showCreate ? 'Cancel' : '+ New policy'}
                </button>
            </div>

            {showCreate && (
                <div className="card" style={{ margin: 0, padding: '0.9rem', display: 'grid', gap: '0.55rem' }}>
                    <h3 style={{ margin: 0, fontSize: '0.95rem' }}>Create retention policy</h3>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <input
                            type="text"
                            placeholder="Policy name *"
                            value={newPolicy.name}
                            onChange={(e) => setNewPolicy((v) => ({ ...v, name: e.target.value }))}
                            style={{ flex: '2 1 200px', padding: '0.35rem 0.55rem', fontSize: '0.83rem', border: '1px solid var(--line)', borderRadius: '4px', background: 'var(--bg)', color: 'var(--ink)' }}
                        />
                        <select
                            value={newPolicy.scope}
                            onChange={(e) => setNewPolicy((v) => ({ ...v, scope: e.target.value }))}
                            style={{ flex: '1 1 120px', padding: '0.35rem 0.55rem', fontSize: '0.83rem', border: '1px solid var(--line)', borderRadius: '4px', background: 'var(--bg)', color: 'var(--ink)' }}
                        >
                            <option value="tenant">Tenant</option>
                            <option value="workspace">Workspace</option>
                            <option value="role">Role</option>
                        </select>
                        <select
                            value={newPolicy.action}
                            onChange={(e) => setNewPolicy((v) => ({ ...v, action: e.target.value }))}
                            style={{ flex: '1 1 140px', padding: '0.35rem 0.55rem', fontSize: '0.83rem', border: '1px solid var(--line)', borderRadius: '4px', background: 'var(--bg)', color: 'var(--ink)' }}
                        >
                            <option value="never_delete">Never delete</option>
                            <option value="archive">Archive</option>
                            <option value="delete">Delete</option>
                            <option value="anonymize">Anonymize</option>
                        </select>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <input
                            type="number"
                            placeholder="Retention days"
                            value={newPolicy.retentionDays}
                            onChange={(e) => setNewPolicy((v) => ({ ...v, retentionDays: e.target.value }))}
                            style={{ flex: '1 1 120px', padding: '0.35rem 0.55rem', fontSize: '0.83rem', border: '1px solid var(--line)', borderRadius: '4px', background: 'var(--bg)', color: 'var(--ink)' }}
                        />
                        <input
                            type="text"
                            placeholder="Workspace ID (optional)"
                            value={newPolicy.workspaceId}
                            onChange={(e) => setNewPolicy((v) => ({ ...v, workspaceId: e.target.value }))}
                            style={{ flex: '1 1 160px', padding: '0.35rem 0.55rem', fontSize: '0.83rem', border: '1px solid var(--line)', borderRadius: '4px', background: 'var(--bg)', color: 'var(--ink)' }}
                        />
                        <input
                            type="text"
                            placeholder="Role key (optional)"
                            value={newPolicy.roleKey}
                            onChange={(e) => setNewPolicy((v) => ({ ...v, roleKey: e.target.value }))}
                            style={{ flex: '1 1 140px', padding: '0.35rem 0.55rem', fontSize: '0.83rem', border: '1px solid var(--line)', borderRadius: '4px', background: 'var(--bg)', color: 'var(--ink)' }}
                        />
                    </div>
                    <input
                        type="text"
                        placeholder="Description"
                        value={newPolicy.description}
                        onChange={(e) => setNewPolicy((v) => ({ ...v, description: e.target.value }))}
                        style={{ padding: '0.35rem 0.55rem', fontSize: '0.83rem', border: '1px solid var(--line)', borderRadius: '4px', background: 'var(--bg)', color: 'var(--ink)' }}
                    />
                    {createError && <p className="message-inline">{createError}</p>}
                    <div>
                        <button type="button" className="primary-action" disabled={createBusy} onClick={() => void createPolicy()}>
                            {createBusy ? 'Creating...' : 'Create policy'}
                        </button>
                    </div>
                </div>
            )}

            {error && <p className="message-inline">{error}</p>}
            {message && (
                <p
                    className="message-inline"
                    style={{ borderColor: 'var(--ok-border)', background: 'var(--ok-bg)', color: 'var(--ok)' }}
                >
                    {message}
                </p>
            )}

            {loading ? (
                <p style={{ margin: 0, color: 'var(--ink-soft)' }}>Loading policies...</p>
            ) : policies.length === 0 ? (
                <p style={{ margin: 0, color: 'var(--ink-soft)' }}>
                    No retention policies found. Create one above to get started.
                </p>
            ) : (
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--line)', color: 'var(--ink-muted)' }}>
                                <th style={{ textAlign: 'left', padding: '0.45rem 0.6rem', fontWeight: 600 }}>Name</th>
                                <th style={{ textAlign: 'left', padding: '0.45rem 0.6rem', fontWeight: 600 }}>Scope</th>
                                <th style={{ textAlign: 'left', padding: '0.45rem 0.6rem', fontWeight: 600 }}>Action</th>
                                <th style={{ textAlign: 'left', padding: '0.45rem 0.6rem', fontWeight: 600 }}>Status</th>
                                <th style={{ textAlign: 'left', padding: '0.45rem 0.6rem', fontWeight: 600 }}>Retention</th>
                                <th style={{ textAlign: 'left', padding: '0.45rem 0.6rem', fontWeight: 600 }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {policies.map((policy) => {
                                const isBusy = busyId === policy.id;
                                return (
                                    <tr key={policy.id} style={{ borderBottom: '1px solid var(--line)' }}>
                                        <td style={{ padding: '0.5rem 0.6rem', color: 'var(--ink)' }}>
                                            <div style={{ fontWeight: 600 }}>{policy.name}</div>
                                            {policy.description && (
                                                <div style={{ fontSize: '0.75rem', color: 'var(--ink-soft)', marginTop: '0.1rem' }}>
                                                    {policy.description}
                                                </div>
                                            )}
                                        </td>
                                        <td style={{ padding: '0.5rem 0.6rem' }}>
                                            {inlineBadge(policy.scope, SCOPE_BADGE)}
                                            {policy.workspaceId && (
                                                <div style={{ fontSize: '0.72rem', color: 'var(--ink-muted)', marginTop: '0.15rem' }}>
                                                    ws:{policy.workspaceId}
                                                </div>
                                            )}
                                            {policy.roleKey && (
                                                <div style={{ fontSize: '0.72rem', color: 'var(--ink-muted)', marginTop: '0.15rem' }}>
                                                    role:{policy.roleKey}
                                                </div>
                                            )}
                                        </td>
                                        <td style={{ padding: '0.5rem 0.6rem' }}>
                                            {inlineBadge(policy.action, ACTION_BADGE)}
                                        </td>
                                        <td style={{ padding: '0.5rem 0.6rem' }}>
                                            {inlineBadge(policy.status, STATUS_BADGE)}
                                        </td>
                                        <td style={{ padding: '0.5rem 0.6rem', color: 'var(--ink-soft)' }}>
                                            {policy.retentionDays != null ? `${policy.retentionDays}d` : '—'}
                                        </td>
                                        <td style={{ padding: '0.5rem 0.6rem' }}>
                                            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                                                <button
                                                    type="button"
                                                    className="secondary-action"
                                                    disabled={isBusy}
                                                    onClick={() => openEdit(policy)}
                                                >
                                                    Edit
                                                </button>
                                                <button
                                                    type="button"
                                                    className="secondary-action"
                                                    disabled={isBusy}
                                                    onClick={() => void deletePolicy(policy.id)}
                                                >
                                                    {isBusy ? '...' : 'Delete'}
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {editId && (
                <div className="card" style={{ margin: 0, padding: '0.9rem', display: 'grid', gap: '0.55rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3 style={{ margin: 0, fontSize: '0.95rem' }}>Edit policy</h3>
                        <button
                            type="button"
                            className="secondary-action"
                            onClick={() => { setEditId(null); setEditError(null); }}
                        >
                            Cancel
                        </button>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <input
                            type="text"
                            placeholder="Policy name"
                            value={editPatch.name}
                            onChange={(e) => setEditPatch((v) => ({ ...v, name: e.target.value }))}
                            style={{ flex: '2 1 200px', padding: '0.35rem 0.55rem', fontSize: '0.83rem', border: '1px solid var(--line)', borderRadius: '4px', background: 'var(--bg)', color: 'var(--ink)' }}
                        />
                        <select
                            value={editPatch.status}
                            onChange={(e) => setEditPatch((v) => ({ ...v, status: e.target.value }))}
                            style={{ flex: '1 1 120px', padding: '0.35rem 0.55rem', fontSize: '0.83rem', border: '1px solid var(--line)', borderRadius: '4px', background: 'var(--bg)', color: 'var(--ink)' }}
                        >
                            <option value="">Keep status</option>
                            <option value="active">Active</option>
                            <option value="archived">Archived</option>
                            <option value="expired">Expired</option>
                        </select>
                    </div>
                    <input
                        type="text"
                        placeholder="Description"
                        value={editPatch.description}
                        onChange={(e) => setEditPatch((v) => ({ ...v, description: e.target.value }))}
                        style={{ padding: '0.35rem 0.55rem', fontSize: '0.83rem', border: '1px solid var(--line)', borderRadius: '4px', background: 'var(--bg)', color: 'var(--ink)' }}
                    />
                    {editError && <p className="message-inline">{editError}</p>}
                    <div>
                        <button type="button" className="primary-action" disabled={editBusy} onClick={() => void submitEdit()}>
                            {editBusy ? 'Saving...' : 'Save changes'}
                        </button>
                    </div>
                </div>
            )}
        </section>
    );
}
