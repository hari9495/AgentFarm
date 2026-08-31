'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

type Listing = {
    id: string;
    skillId: string;
    name: string;
    description: string | null;
    version: string;
    author: string | null;
    source: string | null;
    status: string;
    tags: unknown[];
};

const STATUS_COLORS: Record<string, string> = {
    active: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    deprecated: 'bg-[color:var(--op-paper-3)] text-[color:var(--op-muted)] border border-[color:var(--op-line)]',
};

export default function MarketplaceListingsPage() {
    const [listings, setListings] = useState<Listing[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [needsAuth, setNeedsAuth] = useState(false);
    const [query, setQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('active');

    const fetchListings = async () => {
        setLoading(true);
        setError(null);
        setNeedsAuth(false);

        const params = new URLSearchParams();
        if (statusFilter) params.set('status', statusFilter);

        const response = await fetch(`/api/marketplace/listings?${params.toString()}`, {
            cache: 'no-store',
        });

        const data = (await response.json().catch(() => ({}))) as {
            listings?: Listing[];
            message?: string;
        };

        if (response.status === 401) {
            setNeedsAuth(true);
            setLoading(false);
            return;
        }

        if (!response.ok) {
            setError(data.message ?? 'Unable to load listings.');
            setLoading(false);
            return;
        }

        setListings(Array.isArray(data.listings) ? data.listings : []);
        setLoading(false);
    };

    useEffect(() => {
        void fetchListings();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [statusFilter]);

    const filtered = listings.filter((l) => {
        if (!query.trim()) return true;
        const q = query.trim().toLowerCase();
        return (
            l.name.toLowerCase().includes(q) ||
            (l.description ?? '').toLowerCase().includes(q) ||
            l.skillId.toLowerCase().includes(q)
        );
    });

    return (
        <div className="min-h-screen bg-[var(--op-paper)] text-[color:var(--op-ink)]">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
                <div className="mb-8">
                    <Link
                        href="/marketplace"
                        className="text-sm text-[color:var(--op-muted)] hover:text-[color:var(--op-ink)] transition-colors"
                    >
                        ← Back to Marketplace
                    </Link>
                    <p className="op-eyebrow mt-4 mb-2">Marketplace</p>
                    <h1 className="font-[family-name:var(--font-display)] text-3xl font-extrabold tracking-tight text-[color:var(--op-ink)]">
                        Live Skill Registry
                    </h1>
                    <p className="mt-2 text-[color:var(--op-muted)] text-base">
                        All published skills available for installation on your agents.
                    </p>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 mb-6">
                    <input
                        type="text"
                        placeholder="Search skills..."
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        className="flex-1 rounded-xl bg-[var(--op-paper-2)] border border-[color:var(--op-line)] px-4 py-2.5 text-sm text-[color:var(--op-ink)] placeholder-[color:var(--op-muted)] focus:outline-none focus:ring-2 focus:ring-[color:var(--op-indigo)]"
                    />
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="rounded-xl bg-[var(--op-paper-2)] border border-[color:var(--op-line)] px-4 py-2.5 text-sm text-[color:var(--op-ink)] focus:outline-none focus:ring-2 focus:ring-[color:var(--op-indigo)]"
                    >
                        <option value="">All statuses</option>
                        <option value="active">Active</option>
                        <option value="deprecated">Deprecated</option>
                    </select>
                    <button
                        type="button"
                        onClick={() => void fetchListings()}
                        className="rounded-xl bg-[var(--op-paper-2)] border border-[color:var(--op-line)] px-4 py-2.5 text-sm font-medium text-[color:var(--op-ink)] hover:bg-[color:var(--op-paper-3)] transition-colors"
                    >
                        Refresh
                    </button>
                </div>

                {!needsAuth && error && (
                    <div className="mb-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                        {error}
                    </div>
                )}

                {loading ? (
                    <div className="text-[color:var(--op-muted)] text-sm py-8 text-center">Loading listings...</div>
                ) : needsAuth ? (
                    <div className="rounded-2xl bg-[var(--op-paper)] border border-[color:var(--op-line)] px-6 py-12 text-center">
                        <h2 className="text-lg font-semibold text-[color:var(--op-ink)]">
                            Sign in to browse the skill registry
                        </h2>
                        <p className="mt-1.5 text-sm text-[color:var(--op-muted)]">
                            Published skills are available to logged-in accounts.
                        </p>
                        <Link
                            href="/portal/login"
                            className="mt-5 inline-flex items-center rounded-xl bg-[color:var(--op-indigo)] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[color:var(--op-indigo-ink)] transition-colors"
                        >
                            Sign in
                        </Link>
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="text-[color:var(--op-muted)] text-sm py-8 text-center">
                        No listings match your filters.
                    </div>
                ) : (
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {filtered.map((listing) => (
                            <article
                                key={listing.id}
                                className="rounded-2xl bg-[var(--op-paper)] border border-[color:var(--op-line)] p-5 flex flex-col gap-3 hover:border-[color:var(--op-indigo)] transition-colors"
                            >
                                <div className="flex items-start justify-between gap-2">
                                    <div>
                                        <h2 className="text-base font-semibold text-[color:var(--op-ink)]">{listing.name}</h2>
                                        <p className="text-xs text-[color:var(--op-muted)] mt-0.5">{listing.skillId} · v{listing.version}</p>
                                    </div>
                                    <span
                                        className={`text-xs font-bold px-2 py-0.5 rounded ${STATUS_COLORS[listing.status] ?? 'bg-[var(--op-paper-2)] text-[color:var(--op-muted)]'}`}
                                    >
                                        {listing.status}
                                    </span>
                                </div>

                                {listing.description && (
                                    <p className="text-sm text-[color:var(--op-muted)] line-clamp-2">{listing.description}</p>
                                )}

                                <div className="flex flex-wrap gap-1.5 text-xs text-[color:var(--op-muted)]">
                                    {listing.author && <span>by {listing.author}</span>}
                                    {listing.source && (
                                        <span className="truncate max-w-[180px]" title={listing.source}>
                                            {listing.source}
                                        </span>
                                    )}
                                </div>
                            </article>
                        ))}
                    </div>
                )}

                {!needsAuth && (
                    <p className="mt-6 text-xs text-[color:var(--op-muted)]">
                        Showing {filtered.length} of {listings.length} listings
                    </p>
                )}
            </div>
        </div>
    );
}
