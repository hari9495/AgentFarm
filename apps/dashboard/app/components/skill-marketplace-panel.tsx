'use client';

import { useEffect, useState } from 'react';


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
    uninstalled: { bg: '#f1f5f9', color: '#475569' },
};

type MarketplaceSkillPanelProps = {
    workspaceId: string;
    botId: string;
};

export function SkillMarketplacePanel({ workspaceId, botId }: MarketplaceSkillPanelProps) {
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

    const loadData = async () => {
        setIsLoading(true);
        setError(null);

        const params = new URLSearchParams();
        if (statusFilter) params.set('status', statusFilter);
        if (searchQuery.trim()) params.set('q', searchQuery.trim());

        const [listingsRes, installsRes] = await Promise.all([
            fetch(`/api/marketplace/listings?${params.toString()}`, { cache: 'no-store' }),
            fetch(`/api/marketplace/installs`, { cache: 'no-store' }),
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
    };

    useEffect(() => {
        void loadData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [statusFilter]);

    const installedSkillIds = new Set(
        installs.filter((i) => i.status === 'installed').map((i) => i.skillId),
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
            setBusySkillId(null);
            return;
        }

        setMessage(`${listing.name} installed.`);
        await loadData();
        setBusySkillId(null);
    };

    const runUninstall = async (listing: Listing) => {
        setBusySkillId(listing.skillId);
        setError(null);
        setMessage(null);

        const response = await fetch(`/api/marketplace/installs/${encodeURIComponent(listing.skillId)}`, {
            method: 'DELETE',
        });

        const body = (await response.json().catch(() => ({}))) as { message?: string };
        if (!response.ok) {
            setError(body.message ?? 'Unable to uninstall skill.');
            setBusySkillId(null);
            return;
        }

        setMessage(`${listing.name} uninstalled.`);
        await loadData();
        setBusySkillId(null);
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
            setAdminBusy(false);
            return;
        }

        setNewListing({ name: '', version: '1.0.0', source: '', description: '' });
        setShowAdminForm(false);
        setAdminBusy(false);
        await loadData();
    };

    return (
        <section className="card" style={{ display: 'grid', gap: '0.85rem' }}>
            <header>
                <h2 style={{ marginBottom: '0.4rem' }}>Skill Marketplace</h2>
                <p style={{ margin: 0, color: 'var(--ink-soft)', fontSize: '0.86rem' }}>
                    Browse and manage skills available in the marketplace. Install skills to activate capabilities for agents.
                </p>
            </header>

            <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <span className="badge neutral">Workspace {workspaceId}</span>
                <span className="badge neutral">Agent {botId}</span>
                <span className="badge low">Installed {installs.filter((i) => i.status === 'installed').length}</span>
                <span className="badge neutral">Total listings {listings.length}</span>
            </div>

            <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <input
                    type="text"
                    placeholder="Search listings..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') void loadData(); }}
                    style={{
                        flex: '1 1 200px',
                        padding: '0.4rem 0.6rem',
                        fontSize: '0.85rem',
                        border: '1px solid var(--line)',
                        borderRadius: '4px',
                        background: 'var(--bg)',
                        color: 'var(--ink)',
                    }}
                />
                <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    style={{
                        padding: '0.4rem 0.6rem',
                        fontSize: '0.85rem',
                        border: '1px solid var(--line)',
                        borderRadius: '4px',
                        background: 'var(--bg)',
                        color: 'var(--ink)',
                    }}
                >
                    <option value="">All statuses</option>
                    <option value="active">Active</option>
                    <option value="deprecated">Deprecated</option>
                </select>
                <button type="button" className="secondary-action" onClick={() => void loadData()}>
                    Refresh
                </button>
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
                        <input
                            type="text"
                            placeholder="Skill name *"
                            value={newListing.name}
                            onChange={(e) => setNewListing((v) => ({ ...v, name: e.target.value }))}
                            style={{ flex: '1 1 160px', padding: '0.35rem 0.55rem', fontSize: '0.83rem', border: '1px solid var(--line)', borderRadius: '4px', background: 'var(--bg)', color: 'var(--ink)' }}
                        />
                        <input
                            type="text"
                            placeholder="Version *"
                            value={newListing.version}
                            onChange={(e) => setNewListing((v) => ({ ...v, version: e.target.value }))}
                            style={{ flex: '1 1 100px', padding: '0.35rem 0.55rem', fontSize: '0.83rem', border: '1px solid var(--line)', borderRadius: '4px', background: 'var(--bg)', color: 'var(--ink)' }}
                        />
                        <input
                            type="text"
                            placeholder="Source URL"
                            value={newListing.source}
                            onChange={(e) => setNewListing((v) => ({ ...v, source: e.target.value }))}
                            style={{ flex: '2 1 200px', padding: '0.35rem 0.55rem', fontSize: '0.83rem', border: '1px solid var(--line)', borderRadius: '4px', background: 'var(--bg)', color: 'var(--ink)' }}
                        />
                    </div>
                    <input
                        type="text"
                        placeholder="Description"
                        value={newListing.description}
                        onChange={(e) => setNewListing((v) => ({ ...v, description: e.target.value }))}
                        style={{ padding: '0.35rem 0.55rem', fontSize: '0.83rem', border: '1px solid var(--line)', borderRadius: '4px', background: 'var(--bg)', color: 'var(--ink)' }}
                    />
                    {adminError && <p className="message-inline">{adminError}</p>}
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button type="button" className="primary-action" disabled={adminBusy} onClick={() => void submitNewListing()}>
                            {adminBusy ? 'Saving...' : 'Publish'}
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

            {isLoading ? (
                <p style={{ margin: 0, color: 'var(--ink-soft)' }}>Loading marketplace...</p>
            ) : (
                <div style={{ display: 'grid', gap: '0.7rem' }}>
                    {filtered.map((listing) => {
                        const isInstalled = installedSkillIds.has(listing.skillId);
                        const isBusy = busySkillId === listing.skillId;
                        const statusStyle = STATUS_BADGE[listing.status] ?? { bg: 'var(--line)', color: 'var(--ink-muted)' };
                        const installStyle = INSTALL_BADGE[isInstalled ? 'installed' : 'uninstalled'];

                        return (
                            <article key={listing.id} className="card" style={{ margin: 0, padding: '0.8rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.8rem', alignItems: 'flex-start' }}>
                                    <div style={{ display: 'grid', gap: '0.35rem', flex: 1 }}>
                                        <h3 style={{ margin: 0 }}>{listing.name}</h3>
                                        <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--ink-soft)' }}>
                                            {listing.skillId} | v{listing.version}
                                            {listing.source ? ` | ${listing.source}` : ''}
                                            {listing.author ? ` | by ${listing.author}` : ''}
                                        </p>
                                        {listing.description && (
                                            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--ink-soft)' }}>
                                                {listing.description}
                                            </p>
                                        )}
                                        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                                            <span
                                                style={{
                                                    padding: '2px 8px',
                                                    borderRadius: '4px',
                                                    fontSize: '11px',
                                                    fontWeight: 700,
                                                    background: statusStyle.bg,
                                                    color: statusStyle.color,
                                                }}
                                            >
                                                {listing.status}
                                            </span>
                                            <span
                                                style={{
                                                    padding: '2px 8px',
                                                    borderRadius: '4px',
                                                    fontSize: '11px',
                                                    fontWeight: 700,
                                                    background: installStyle.bg,
                                                    color: installStyle.color,
                                                }}
                                            >
                                                {isInstalled ? 'Installed' : 'Not installed'}
                                            </span>
                                        </div>
                                    </div>

                                    <button
                                        type="button"
                                        className={isInstalled ? 'secondary-action' : 'primary-action'}
                                        disabled={isBusy}
                                        onClick={() => {
                                            if (isInstalled) {
                                                void runUninstall(listing);
                                            } else {
                                                void runInstall(listing);
                                            }
                                        }}
                                    >
                                        {isBusy ? 'Working...' : isInstalled ? 'Uninstall' : 'Install'}
                                    </button>
                                </div>
                            </article>
                        );
                    })}

                    {filtered.length === 0 && (
                        <p style={{ margin: 0, color: 'var(--ink-soft)' }}>
                            No listings match your current filters.
                        </p>
                    )}
                </div>
            )}
        </section>
    );
}

