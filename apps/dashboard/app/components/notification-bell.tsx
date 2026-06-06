'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';

type InAppItem = {
    id: string;
    type: string;
    title: string;
    body: string;
    severity: 'high' | 'warn' | 'info';
    link: string;
    created_at: string;
};

const STORAGE_KEY = 'af_read_notifications';
const POLL_MS = 60_000;

const SEV_COLORS: Record<string, { bg: string; dot: string }> = {
    high:  { bg: 'rgba(196,22,28,0.07)',   dot: 'var(--danger)' },
    warn:  { bg: 'rgba(180,83,9,0.07)',    dot: 'var(--warn)' },
    info:  { bg: 'rgba(0,82,204,0.06)',    dot: 'var(--accent)' },
};

function loadReadIds(): Set<string> {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return new Set(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
        return new Set();
    }
}

function persistReadIds(ids: Set<string>) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids].slice(-200)));
    } catch {
        // ignore
    }
}

export function NotificationBell({ workspaceId }: { workspaceId?: string }) {
    const [items, setItems] = useState<InAppItem[]>([]);
    const [readIds, setReadIds] = useState<Set<string>>(new Set());
    const [open, setOpen] = useState(false);
    const panelRef = useRef<HTMLDivElement>(null);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const fetchItems = useCallback(async () => {
        try {
            const url = `/api/notifications/in-app${workspaceId ? `?workspace_id=${encodeURIComponent(workspaceId)}` : ''}`;
            const res = await fetch(url);
            if (!res.ok) return;
            const data = (await res.json()) as { items?: InAppItem[] };
            setItems(data.items ?? []);
        } catch {
            // non-fatal
        }
    }, [workspaceId]);

    // Hydrate read state from localStorage (client only)
    useEffect(() => {
        setReadIds(loadReadIds());
    }, []);

    useEffect(() => {
        void fetchItems();
        timerRef.current = setInterval(() => { void fetchItems(); }, POLL_MS);
        return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }, [fetchItems]);

    // Close on outside click
    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    const unreadCount = items.filter((i) => !readIds.has(i.id)).length;

    const markAllRead = () => {
        const next = new Set(readIds);
        for (const item of items) next.add(item.id);
        setReadIds(next);
        persistReadIds(next);
    };

    const handleOpen = () => {
        setOpen((prev) => {
            if (!prev) markAllRead();
            return !prev;
        });
    };

    return (
        <div style={{ position: 'relative' }} ref={panelRef}>
            {/* Bell button */}
            <button
                type="button"
                onClick={handleOpen}
                aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
                className="inline-flex items-center justify-center w-8 h-8 rounded-lg transition-colors hover:bg-slate-100"
                style={{ position: 'relative', flexShrink: 0 }}
            >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: unreadCount > 0 ? 'var(--accent)' : 'var(--ink-muted)' }}>
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
                {unreadCount > 0 && (
                    <span style={{
                        position: 'absolute', top: 2, right: 2,
                        width: 16, height: 16,
                        background: 'var(--danger)', borderRadius: '50%',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 9, fontWeight: 800, color: 'var(--card)',
                        border: '1.5px solid #fff',
                    }}>
                        {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                )}
            </button>

            {/* Dropdown panel */}
            {open && (
                <div style={{
                    position: 'absolute', top: '110%', right: 0,
                    width: 'min(320px, 90vw)',
                    background: 'var(--card)',
                    borderRadius: '0.6rem',
                    boxShadow: '0 8px 32px rgba(15,23,42,0.18)',
                    border: '1px solid var(--line)',
                    zIndex: 9999,
                    overflow: 'hidden',
                }}>
                    {/* Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.7rem 0.9rem', borderBottom: '1px solid #f1f5f9' }}>
                        <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--ink)' }}>Notifications</span>
                        {items.length > 0 && (
                            <button
                                type="button"
                                onClick={markAllRead}
                                style={{ fontSize: '0.72rem', color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                            >
                                Mark all read
                            </button>
                        )}
                    </div>

                    {/* Feed */}
                    <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                        {items.length === 0 && (
                            <div style={{ padding: '2rem', textAlign: 'center' }}>
                                <div style={{ fontSize: '1.4rem', marginBottom: '0.4rem' }}>🔔</div>
                                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--ink)' }}>All caught up</div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--ink-muted)', marginTop: '0.2rem' }}>No active alerts right now.</div>
                            </div>
                        )}
                        {items.map((item) => {
                            const colors = SEV_COLORS[item.severity] ?? SEV_COLORS.info;
                            const isUnread = !readIds.has(item.id);
                            return (
                                <Link
                                    key={item.id}
                                    href={item.link}
                                    onClick={() => setOpen(false)}
                                    style={{
                                        display: 'block',
                                        padding: '0.7rem 0.9rem',
                                        borderBottom: '1px solid #f8fafc',
                                        background: isUnread ? colors.bg : 'var(--card)',
                                        textDecoration: 'none',
                                        transition: 'background 0.1s',
                                    }}
                                >
                                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: isUnread ? colors.dot : 'transparent', border: `1.5px solid ${isUnread ? colors.dot : 'var(--bg)'}`, flexShrink: 0, marginTop: 4 }} />
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: '0.8rem', fontWeight: isUnread ? 700 : 500, color: 'var(--ink)', marginBottom: '0.15rem' }}>
                                                {item.title}
                                            </div>
                                            <div style={{ fontSize: '0.73rem', color: 'var(--ink-muted)', lineHeight: 1.4 }}>
                                                {item.body}
                                            </div>
                                        </div>
                                    </div>
                                </Link>
                            );
                        })}
                    </div>

                    {/* Footer */}
                    <div style={{ padding: '0.55rem 0.9rem', borderTop: '1px solid #f1f5f9', textAlign: 'center' }}>
                        <Link href="/notifications" onClick={() => setOpen(false)} style={{ fontSize: '0.75rem', color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>
                            View delivery log →
                        </Link>
                    </div>
                </div>
            )}
        </div>
    );
}
