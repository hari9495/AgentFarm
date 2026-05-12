'use client';

import { useCallback, useEffect, useState } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

type Listing = {
    id: string;
    skillId: string;
    name: string;
    description: string | null;
    version: string;
    author: string | null;
    permissions: unknown[];
    source: string | null;
    tags: unknown[];
    status: string;
};

type Install = {
    id: string;
    tenantId: string;
    skillId: string;
    listingId: string;
    approvedPermissions: unknown[];
    pinVersion: boolean;
    status: string;
    installedAt: string;
    uninstalledAt: string | null;
    listing?: { name: string; version: string; skillId: string };
};

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, { bg: string; color: string }> = {
    active: { bg: '#dcfce7', color: '#166534' },
    deprecated: { bg: '#f1f5f9', color: '#475569' },
};

const INSTALL_BADGE: Record<string, { bg: string; color: string }> = {
    installed: { bg: '#dcfce7', color: '#166534' },
    disabled: { bg: '#fef9c3', color: '#854d0e' },
    uninstalled: { bg: '#f1f5f9', color: '#475569' },
};

// ── Props ─────────────────────────────────────────────────────────────────────

type MarketplaceSkillPanelProps = {
    workspaceId: string;
    botId: string;
};

// ── Component ─────────────────────────────────────────────────────────────────

export function SkillMarketplacePanel({ workspaceId, botId }: MarketplaceSkillPanelProps) {
    const [activeTab, setActiveTab] = useState<'browse' | 'installed'>('browse');

    // Browse tab state
    const [listings, setListings] = useState<Listing[]>([]);
    const [installs, setInstalls] = useState<Install[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [busySkillId, setBusySkillId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('active');
    const [showAdminForm, setShowAdminForm] = useState(false);
    const [newListing, setNewListing] = useState({ name: '', version: '1.0.0', source: '', description: '' });
    const [adminBusy, setAdminBusy] = useState(false);
    const [adminError, setAdminError] = useState<string | null>(null);

    // Detail drawer state
    const [drawerListing, setDrawerListing] = useState<Listing | null>(null);
    const [drawerLoading, setDrawerLoading] = useState(false);

    // Confirm uninstall state
    const [confirmUninstallSkillId, setConfirmUninstallSkillId] = useState<string | null>(null);

    // Toggle state (enable/disable installed skill)
    const [toggling, setToggling] = useState<string | null>(null);

    // ── Data loaders ───────────────────────────────────────────────────────

    const loadData = useCallback(async () => {
        setIsLoading(true);
        setError(null);

        const params = new URLSearchParams();
        if (statusFilter) params.set('status', statusFilter);
        if (searchQuery.trim()) params.set('q', searchQuery.trim());

        const [listingsRes, installsRes] = await Promise.all([
            fetch(`/api/marketplace/listings?${params.toString()}`, { cache: 'no-store' }),
            fetch('/api/marketplace/installs', { cache: 'no-store' }),
        ]);

        const listingsBody = (await listingsRes.json().catch(() => ({}))) as { listings?: Listing[]; message?: string };
        const installsBody = (await installsRes.json().catch(() => ({}))) as { installs?: Install[]; message?: string };

        if (!listingsRes.ok) {
            setError(listingsBody.message ?? 'Unable to load marketplace listings.');
            setIsLoading(false);
            return;
        }
        if (!installsRes.ok) {
            setError(installsBody.message ?? 'Unable to load installs.');
            setIsLoading(false);
            return;
        }

        setListings(Array.isArray(listingsBody.listings) ? listingsBody.listings : []);
        setInstalls(Array.isArray(installsBody.installs) ? installsBody.installs : []);
        setIsLoading(false);
    }, [searchQuery, statusFilter]);

    useEffect(() => {
        void loadData();
    }, [statusFilter, loadData]);

    // ── Derived state ──────────────────────────────────────────────────────

    const installedSkillIds = new Set(
        installs.filter((i) => i.status === 'installed' || i.status === 'disabled').map((i) => i.skillId),
    );

    const filtered = listings.filter((l) => {
        if (!searchQuery.trim()) return true;
        const q = searchQuery.trim().toLowerCase();
        return (
            l.name.toLowerCase().includes(q) ||
            (l.description ?? '').toLowerCase().includes(q) ||
            (l.source ?? '').toLowerCase().includes(q)
        );
    });

    // ── Actions ────────────────────────────────────────────────────────────

    const runInstall = async (listing: Listing) => {
        setBusySkillId(listing.skillId);
        setError(null);
        setMessage(null);

        const response = await fetch('/api/marketplace/installs', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                skillId: listing.skillId,
                listingId: listing.id,
                approvedPermissions: listing.permissions,
                pinVersion: false,
            }),
        });

        const body = (await response.json().catch(() => ({}))) as { message?: string };
        if (!response.ok) {
            setError(body.message ?? 'Unable to install skill.');
        } else {
            setMessage(`${listing.name} installed.`);
            await loadData();
        }
        setBusySkillId(null);
    };

    const runUninstall = async (skillId: string, displayName: string) => {
        setBusySkillId(skillId);
        setError(null);
        setMessage(null);
        setConfirmUninstallSkillId(null);

        const response = await fetch(`/api/marketplace/installs/${encodeURIComponent(skillId)}`, {
            method: 'DELETE',
        });

        const body = (await response.json().catch(() => ({}))) as { message?: string };
        if (!response.ok) {
            setError(body.message ?? 'Unable to uninstall skill.');
        } else {
            setMessage(`${displayName} uninstalled.`);
            await loadData();
        }
        setBusySkillId(null);
    };

    const runToggle = async (skillId: string, enabled: boolean) => {
        setToggling(skillId);
        setError(null);
        setMessage(null);

        const response = await fetch(`/api/marketplace/installs/${encodeURIComponent(skillId)}`, {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ enabled }),
        });

        const body = (await response.json().catch(() => ({}))) as { message?: string };
        if (!response.ok) {
            setError(body.message ?? 'Unable to update skill status.');
        } else {
            setMessage(`Skill ${enabled ? 'enabled' : 'disabled'}.`);
            await loadData();
        }
        setToggling(null);
    };

    const openDrawer = async (listing: Listing) => {
        setDrawerListing(listing);
        setDrawerLoading(true);

        const res = await fetch(`/api/marketplace/listings/${encodeURIComponent(listing.id)}`, { cache: 'no-store' });
        if (res.ok) {
            const data = (await res.json().catch(() => null)) as Listing | null;
            if (data) setDrawerListing(data);
        }
        setDrawerLoading(false);
    };

    const submitNewListing = async () => {
        if (!newListing.name.trim() || !newListing.version.trim()) {
            setAdminError('Name and version are required.');
            return;
        }
        setAdminBusy(true);
        setAdminError(null);

        const response = await fetch('/api/marketplace/listings', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                skillId: newListing.name.toLowerCase().replace(/\s+/g, '-'),
                name: newListing.name.trim(),
                version: newListing.version.trim(),
                source: newListing.source.trim() || undefined,
                description: newListing.description.trim() || undefined,
                permissions: [],
                tags: [],
            }),
        });

        const data = (await response.json().catch(() => ({}))) as { message?: string };
        if (!response.ok) {
            setAdminError(data.message ?? 'Failed to create listing.');
        } else {
            setNewListing({ name: '', version: '1.0.0', source: '', description: '' });
            setShowAdminForm(false);
            await loadData();
        }
        setAdminBusy(false);
    };

    // ── Shared styles ──────────────────────────────────────────────────────

    const TAB_STYLE = (active: boolean): React.CSSProperties => ({
        padding: '0.45rem 1rem',
        fontSize: '0.85rem',
        fontWeight: active ? 600 : 400,
        cursor: 'pointer',
        border: 'none',
        borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
        background: 'transparent',
        color: active ? 'var(--ink)' : 'var(--ink-muted)',
        outline: 'none',
    });

    const BADGE_PILL = (style: { bg: string; color: string }): React.CSSProperties => ({
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 4,
        fontSize: 11,
        fontWeight: 700,
        background: style.bg,
        color: style.color,
    });

    // ── Render ─────────────────────────────────────────────────────────────

    return (
        <>
            <section className="card" style={{ display: 'grid', gap: '0.85rem' }}>
                <header>
                    <h2 style={{ marginBottom: '0.4rem' }}>Skill Marketplace</h2>
                    <p style={{ margin: 0, color: 'var(--ink-soft)', fontSize: '0.86rem' }}>
                        Browse and manage skills. Install skills to activate capabilities for agents.
                    </p>
                </header>

                <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
                    <span className="badge neutral">Workspace {workspaceId}</span>
                    <span className="badge neutral">Agent {botId}</span>
                    <span className="badge low">
                        Installed {installs.filter((i) => i.status === 'installed').length}
                    </span>
                    <span className="badge neutral">Listings {listings.length}</span>
                </div>

                {/* Tab bar */}
                <div style={{ display: 'flex', borderBottom: '1px solid var(--line)' }}>
                    <button type="button" style={TAB_STYLE(activeTab === 'browse')} onClick={() => setActiveTab('browse')}>
                        Browse
                    </button>
                    <button type="button" style={TAB_STYLE(activeTab === 'installed')} onClick={() => setActiveTab('installed')}>
                        Installed ({installs.filter((i) => i.status === 'installed' || i.status === 'disabled').length})
                    </button>
                </div>

                {error && <p className="message-inline">{error}</p>}
                {message && (
                    <p className="message-inline" style={{ borderColor: 'var(--ok-border)', background: 'var(--ok-bg)', color: 'var(--ok)' }}>
                        {message}
                    </p>
                )}

                {/* ── Browse Tab ──────────────────────────────────────── */}
                {activeTab === 'browse' && (
                    <div style={{ display: 'grid', gap: '0.75rem' }}>
                        {/* Search + filter + admin */}
                        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
                            <input
                                type="text"
                                placeholder="Search listings..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') void loadData(); }}
                                style={{ flex: '1 1 200px', padding: '0.4rem 0.6rem', fontSize: '0.85rem', border: '1px solid var(--line)', borderRadius: 4, background: 'var(--bg)', color: 'var(--ink)' }}
                            />
                            <select
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value)}
                                style={{ padding: '0.4rem 0.6rem', fontSize: '0.85rem', border: '1px solid var(--line)', borderRadius: 4, background: 'var(--bg)', color: 'var(--ink)' }}
                            >
                                <option value="">All statuses</option>
                                <option value="active">Active</option>
                                <option value="deprecated">Deprecated</option>
                            </select>
                            <button type="button" className="secondary-action" onClick={() => void loadData()}>Refresh</button>
                            <button
                                type="button"
                                className="primary-action"
                                onClick={() => { setShowAdminForm((v) => !v); setAdminError(null); }}
                            >
                                {showAdminForm ? 'Cancel' : '+ Publish listing'}
                            </button>
                        </div>

                        {showAdminForm && (
                            <div className="card" style={{ margin: 0, padding: '0.9rem', display: 'grid', gap: '0.55rem' }}>
                                <h3 style={{ margin: 0, fontSize: '0.95rem' }}>Publish new skill listing</h3>
                                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                    <input type="text" placeholder="Skill name *" value={newListing.name}
                                        onChange={(e) => setNewListing((v) => ({ ...v, name: e.target.value }))}
                                        style={{ flex: '1 1 160px', padding: '0.35rem 0.55rem', fontSize: '0.83rem', border: '1px solid var(--line)', borderRadius: 4, background: 'var(--bg)', color: 'var(--ink)' }} />
                                    <input type="text" placeholder="Version *" value={newListing.version}
                                        onChange={(e) => setNewListing((v) => ({ ...v, version: e.target.value }))}
                                        style={{ flex: '0 1 100px', padding: '0.35rem 0.55rem', fontSize: '0.83rem', border: '1px solid var(--line)', borderRadius: 4, background: 'var(--bg)', color: 'var(--ink)' }} />
                                    <input type="text" placeholder="Source URL" value={newListing.source}
                                        onChange={(e) => setNewListing((v) => ({ ...v, source: e.target.value }))}
                                        style={{ flex: '2 1 200px', padding: '0.35rem 0.55rem', fontSize: '0.83rem', border: '1px solid var(--line)', borderRadius: 4, background: 'var(--bg)', color: 'var(--ink)' }} />
                                </div>
                                <input type="text" placeholder="Description" value={newListing.description}
                                    onChange={(e) => setNewListing((v) => ({ ...v, description: e.target.value }))}
                                    style={{ padding: '0.35rem 0.55rem', fontSize: '0.83rem', border: '1px solid var(--line)', borderRadius: 4, background: 'var(--bg)', color: 'var(--ink)' }} />
                                {adminError && <p className="message-inline">{adminError}</p>}
                                <button type="button" className="primary-action" disabled={adminBusy} onClick={() => void submitNewListing()}>
                                    {adminBusy ? 'Saving...' : 'Publish'}
                                </button>
                            </div>
                        )}

                        {isLoading ? (
                            <p style={{ margin: 0, color: 'var(--ink-soft)' }}>Loading marketplace...</p>
                        ) : (
                            <div style={{ display: 'grid', gap: '0.7rem' }}>
                                {filtered.map((listing) => {
                                    const isInstalled = installedSkillIds.has(listing.skillId);
                                    const isBusy = busySkillId === listing.skillId;
                                    const isConfirming = confirmUninstallSkillId === listing.skillId;
                                    const statusStyle = STATUS_BADGE[listing.status] ?? { bg: 'var(--line)', color: 'var(--ink-muted)' };

                                    return (
                                        <article key={listing.id} className="card" style={{ margin: 0, padding: '0.8rem' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.8rem', alignItems: 'flex-start' }}>
                                                <div style={{ display: 'grid', gap: '0.35rem', flex: 1 }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                                        <h3 style={{ margin: 0 }}>{listing.name}</h3>
                                                        <span style={BADGE_PILL(statusStyle)}>{listing.status}</span>
                                                        {isInstalled && (
                                                            <span style={BADGE_PILL({ bg: '#dcfce7', color: '#166534' })}>Installed ✓</span>
                                                        )}
                                                        <code style={{ fontSize: '0.75rem', color: 'var(--ink-muted)' }}>v{listing.version}</code>
                                                    </div>
                                                    <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--ink-soft)' }}>
                                                        {listing.skillId}
                                                        {listing.author ? ` · by ${listing.author}` : ''}
                                                        {listing.source ? ` · ${listing.source}` : ''}
                                                    </p>
                                                    {listing.description && (
                                                        <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--ink-soft)' }}>{listing.description}</p>
                                                    )}
                                                </div>
                                                <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                                                    <button type="button" className="secondary-action" style={{ fontSize: '0.78rem' }}
                                                        onClick={() => void openDrawer(listing)}>
                                                        Details
                                                    </button>
                                                    {isInstalled ? (
                                                        isConfirming ? (
                                                            <>
                                                                <button type="button" className="secondary-action"
                                                                    style={{ fontSize: '0.78rem', borderColor: '#dc2626', color: '#dc2626' }}
                                                                    disabled={isBusy}
                                                                    onClick={() => void runUninstall(listing.skillId, listing.name)}>
                                                                    {isBusy ? 'Removing...' : 'Confirm uninstall'}
                                                                </button>
                                                                <button type="button" className="secondary-action" style={{ fontSize: '0.78rem' }}
                                                                    onClick={() => setConfirmUninstallSkillId(null)}>
                                                                    Cancel
                                                                </button>
                                                            </>
                                                        ) : (
                                                            <button type="button" className="secondary-action" style={{ fontSize: '0.78rem' }}
                                                                disabled={isBusy}
                                                                onClick={() => setConfirmUninstallSkillId(listing.skillId)}>
                                                                Uninstall
                                                            </button>
                                                        )
                                                    ) : (
                                                        <button type="button" className="primary-action" style={{ fontSize: '0.78rem' }}
                                                            disabled={isBusy}
                                                            onClick={() => void runInstall(listing)}>
                                                            {isBusy ? 'Installing...' : 'Install'}
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </article>
                                    );
                                })}
                                {filtered.length === 0 && (
                                    <p style={{ margin: 0, color: 'var(--ink-soft)' }}>No listings match your filters.</p>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* ── Installed Tab ────────────────────────────────────── */}
                {activeTab === 'installed' && (
                    <div style={{ display: 'grid', gap: '0.75rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                            <h3 style={{ margin: 0, fontSize: '0.95rem' }}>Installed skills</h3>
                            <button type="button" className="secondary-action" onClick={() => void loadData()}>Refresh</button>
                        </div>

                        <div style={{ display: 'grid', gap: '0.7rem' }}>
                            {installs
                                .filter((i) => i.status === 'installed' || i.status === 'disabled')
                                .map((install) => {
                                    const isBusy = busySkillId === install.skillId;
                                    const isConfirming = confirmUninstallSkillId === install.skillId;
                                    const isTogglingThis = toggling === install.skillId;
                                    const installStyle = INSTALL_BADGE[install.status] ?? { bg: 'var(--line)', color: 'var(--ink-muted)' };
                                    const displayName = install.listing?.name ?? install.skillId;

                                    return (
                                        <article key={install.id} className="card" style={{ margin: 0, padding: '0.8rem' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.8rem', alignItems: 'flex-start' }}>
                                                <div style={{ display: 'grid', gap: '0.35rem', flex: 1 }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                                        <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{displayName}</span>
                                                        <span style={BADGE_PILL(installStyle)}>{install.status}</span>
                                                        {install.listing?.version && (
                                                            <code style={{ fontSize: '0.75rem', color: 'var(--ink-muted)' }}>v{install.listing.version}</code>
                                                        )}
                                                    </div>
                                                    <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--ink-muted)' }}>
                                                        {install.skillId} · Installed {new Date(install.installedAt).toLocaleDateString()}
                                                    </p>
                                                </div>
                                                <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                                                    {/* Enable/Disable toggle */}
                                                    {install.status === 'installed' ? (
                                                        <button type="button" className="secondary-action" style={{ fontSize: '0.78rem' }}
                                                            disabled={isTogglingThis}
                                                            onClick={() => void runToggle(install.skillId, false)}>
                                                            {isTogglingThis ? 'Updating...' : 'Disable'}
                                                        </button>
                                                    ) : (
                                                        <button type="button" className="primary-action" style={{ fontSize: '0.78rem' }}
                                                            disabled={isTogglingThis}
                                                            onClick={() => void runToggle(install.skillId, true)}>
                                                            {isTogglingThis ? 'Updating...' : 'Enable'}
                                                        </button>
                                                    )}
                                                    {/* Uninstall with confirm */}
                                                    {isConfirming ? (
                                                        <>
                                                            <button type="button" className="secondary-action"
                                                                style={{ fontSize: '0.78rem', borderColor: '#dc2626', color: '#dc2626' }}
                                                                disabled={isBusy}
                                                                onClick={() => void runUninstall(install.skillId, displayName)}>
                                                                {isBusy ? 'Removing...' : 'Confirm uninstall'}
                                                            </button>
                                                            <button type="button" className="secondary-action" style={{ fontSize: '0.78rem' }}
                                                                onClick={() => setConfirmUninstallSkillId(null)}>
                                                                Cancel
                                                            </button>
                                                        </>
                                                    ) : (
                                                        <button type="button" className="secondary-action" style={{ fontSize: '0.78rem' }}
                                                            disabled={isBusy}
                                                            onClick={() => setConfirmUninstallSkillId(install.skillId)}>
                                                            Uninstall
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </article>
                                    );
                                })}
                            {installs.filter((i) => i.status === 'installed' || i.status === 'disabled').length === 0 && (
                                <p style={{ margin: 0, color: 'var(--ink-soft)' }}>No skills installed yet. Browse the marketplace to install one.</p>
                            )}
                        </div>
                    </div>
                )}
            </section>

            {/* ── Detail Drawer ─────────────────────────────────────────── */}
            {drawerListing && (
                <>
                    {/* Backdrop */}
                    <div
                        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 40 }}
                        onClick={() => setDrawerListing(null)}
                    />
                    {/* Drawer */}
                    <aside
                        style={{
                            position: 'fixed',
                            top: 0,
                            right: 0,
                            bottom: 0,
                            width: 'min(480px, 90vw)',
                            background: 'var(--bg)',
                            boxShadow: '-4px 0 24px rgba(0,0,0,0.15)',
                            zIndex: 41,
                            overflowY: 'auto',
                            padding: '1.5rem',
                            display: 'grid',
                            gap: '1rem',
                            alignContent: 'start',
                        }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <h2 style={{ margin: 0, fontSize: '1.1rem' }}>{drawerListing.name}</h2>
                            <button type="button" className="secondary-action" style={{ fontSize: '0.8rem' }}
                                onClick={() => setDrawerListing(null)}>
                                Close
                            </button>
                        </div>

                        {drawerLoading && <p style={{ margin: 0, color: 'var(--ink-soft)' }}>Loading details...</p>}

                        <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.4rem 1rem', fontSize: '0.85rem', margin: 0 }}>
                            <dt style={{ color: 'var(--ink-muted)', fontWeight: 600 }}>Skill ID</dt>
                            <dd style={{ margin: 0 }}><code style={{ fontSize: '0.8rem' }}>{drawerListing.skillId}</code></dd>
                            <dt style={{ color: 'var(--ink-muted)', fontWeight: 600 }}>Version</dt>
                            <dd style={{ margin: 0 }}><code style={{ fontSize: '0.8rem' }}>v{drawerListing.version}</code></dd>
                            {drawerListing.author && (
                                <>
                                    <dt style={{ color: 'var(--ink-muted)', fontWeight: 600 }}>Author</dt>
                                    <dd style={{ margin: 0 }}>{drawerListing.author}</dd>
                                </>
                            )}
                            <dt style={{ color: 'var(--ink-muted)', fontWeight: 600 }}>Status</dt>
                            <dd style={{ margin: 0 }}>
                                <span style={BADGE_PILL(STATUS_BADGE[drawerListing.status] ?? { bg: 'var(--line)', color: 'var(--ink-muted)' })}>
                                    {drawerListing.status}
                                </span>
                            </dd>
                            {drawerListing.source && (
                                <>
                                    <dt style={{ color: 'var(--ink-muted)', fontWeight: 600 }}>Source</dt>
                                    <dd style={{ margin: 0 }}>
                                        <a href={drawerListing.source} target="_blank" rel="noopener noreferrer"
                                            style={{ color: 'var(--accent)', fontSize: '0.82rem' }}>
                                            {drawerListing.source}
                                        </a>
                                    </dd>
                                </>
                            )}
                        </dl>

                        {drawerListing.description && (
                            <div>
                                <p style={{ margin: '0 0 0.35rem', fontWeight: 600, fontSize: '0.82rem', color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Description</p>
                                <p style={{ margin: 0, fontSize: '0.85rem' }}>{drawerListing.description}</p>
                            </div>
                        )}

                        {Array.isArray(drawerListing.permissions) && drawerListing.permissions.length > 0 && (
                            <div>
                                <p style={{ margin: '0 0 0.4rem', fontWeight: 600, fontSize: '0.82rem', color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Permissions</p>
                                <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                                    {(drawerListing.permissions as string[]).map((p, i) => (
                                        <span key={i} style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, background: '#fef9c3', color: '#854d0e' }}>
                                            {String(p)}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {Array.isArray(drawerListing.tags) && drawerListing.tags.length > 0 && (
                            <div>
                                <p style={{ margin: '0 0 0.4rem', fontWeight: 600, fontSize: '0.82rem', color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Tags</p>
                                <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                                    {(drawerListing.tags as string[]).map((t, i) => (
                                        <span key={i} style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, background: 'var(--surface)', color: 'var(--ink-muted)', border: '1px solid var(--line)' }}>
                                            {String(t)}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Drawer install/uninstall action */}
                        <div style={{ marginTop: '0.5rem' }}>
                            {installedSkillIds.has(drawerListing.skillId) ? (
                                <button type="button" className="secondary-action"
                                    style={{ borderColor: '#dc2626', color: '#dc2626' }}
                                    disabled={busySkillId === drawerListing.skillId}
                                    onClick={() => {
                                        void runUninstall(drawerListing.skillId, drawerListing.name);
                                        setDrawerListing(null);
                                    }}>
                                    Uninstall
                                </button>
                            ) : (
                                <button type="button" className="primary-action"
                                    disabled={busySkillId === drawerListing.skillId}
                                    onClick={() => {
                                        void runInstall(drawerListing);
                                        setDrawerListing(null);
                                    }}>
                                    Install
                                </button>
                            )}
                        </div>
                    </aside>
                </>
            )}
        </>
    );
}
