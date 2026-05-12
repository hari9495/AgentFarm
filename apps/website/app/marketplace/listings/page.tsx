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
    active: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30',
    deprecated: 'bg-slate-500/20 text-slate-400 border border-slate-600/30',
};

export default function MarketplaceListingsPage() {
    const [listings, setListings] = useState<Listing[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [query, setQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('active');

    const fetchListings = async () => {
        setLoading(true);
        setError(null);

        const params = new URLSearchParams();
        if (statusFilter) params.set('status', statusFilter);

        const response = await fetch(`/api/marketplace/listings?${params.toString()}`, {
            cache: 'no-store',
        });

        const data = (await response.json().catch(() => ({}))) as {
            listings?: Listing[];
            message?: string;
        };

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
        <div className="min-h-screen bg-gray-950 text-slate-100">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
                <div className="mb-8">
                    <Link
                        href="/marketplace"
                        className="text-sm text-slate-400 hover:text-slate-200 transition-colors"
                    >
                        ← Back to Marketplace
                    </Link>
                    <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-slate-100">
                        Live Skill Registry
                    </h1>
                    <p className="mt-2 text-slate-400 text-base">
                        All published skills available for installation on your agents.
                    </p>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 mb-6">
                    <input
                        type="text"
                        placeholder="Search skills..."
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        className="flex-1 rounded-xl bg-slate-800/80 border border-slate-700 px-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-500"
                    />
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="rounded-xl bg-slate-800/80 border border-slate-700 px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-500"
                    >
                        <option value="">All statuses</option>
                        <option value="active">Active</option>
                        <option value="deprecated">Deprecated</option>
                    </select>
                    <button
                        type="button"
                        onClick={() => void fetchListings()}
                        className="rounded-xl bg-slate-800 border border-slate-700 px-4 py-2.5 text-sm font-medium text-slate-200 hover:bg-slate-700 transition-colors"
                    >
                        Refresh
                    </button>
                </div>

                {error && (
                    <div className="mb-4 rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-300">
                        {error}
                    </div>
                )}

                {loading ? (
                    <div className="text-slate-400 text-sm py-8 text-center">Loading listings...</div>
                ) : filtered.length === 0 ? (
                    <div className="text-slate-500 text-sm py-8 text-center">
                        No listings match your filters.
                    </div>
                ) : (
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {filtered.map((listing) => (
                            <article
                                key={listing.id}
                                className="rounded-2xl bg-slate-900/80 border border-slate-700/60 p-5 flex flex-col gap-3 hover:border-slate-500/60 transition-colors"
                            >
                                <div className="flex items-start justify-between gap-2">
                                    <div>
                                        <h2 className="text-base font-semibold text-slate-100">{listing.name}</h2>
                                        <p className="text-xs text-slate-500 mt-0.5">{listing.skillId} · v{listing.version}</p>
                                    </div>
                                    <span
                                        className={`text-xs font-bold px-2 py-0.5 rounded ${STATUS_COLORS[listing.status] ?? 'bg-slate-700 text-slate-400'}`}
                                    >
                                        {listing.status}
                                    </span>
                                </div>

                                {listing.description && (
                                    <p className="text-sm text-slate-400 line-clamp-2">{listing.description}</p>
                                )}

                                <div className="flex flex-wrap gap-1.5 text-xs text-slate-500">
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

                <p className="mt-6 text-xs text-slate-600">
                    Showing {filtered.length} of {listings.length} listings
                </p>
            </div>
        </div>
    );
}
