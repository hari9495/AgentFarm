'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

type PortalUser = { email: string; displayName: string | null; tenantId: string };

export function PortalNav() {
    const pathname = usePathname();
    const [user, setUser] = useState<PortalUser | null>(null);

    useEffect(() => {
        fetch('/api/portal/auth/me', { credentials: 'same-origin' })
            .then((r) => r.ok ? r.json() : null)
            .then((d) => d ? setUser(d as PortalUser) : null)
            .catch(() => null);
    }, []);

    const handleLogout = async () => {
        await fetch('/api/portal/auth/logout', { method: 'POST', credentials: 'same-origin' });
        window.location.href = '/portal/login';
    };

    const navItems = [
        { href: '/portal', label: 'Home' },
        { href: '/portal/support', label: 'Support' },
        { href: '/portal/support/history', label: 'History' },
    ];

    // Don't render nav on the login page
    if (pathname === '/portal/login') return null;

    return (
        <nav style={{
            background: '#fff', borderBottom: '1px solid #e2e8f0',
            padding: '0 1.5rem', height: 52,
            display: 'flex', alignItems: 'center', gap: '0.25rem',
            position: 'sticky', top: 0, zIndex: 10,
        }}>
            <style>{`
                .portal-nav-link {
                    padding: 0.3rem 0.7rem; border-radius: 5px;
                    font-size: 0.84rem; font-weight: 500; color: #374151;
                    text-decoration: none; transition: background 0.12s;
                }
                .portal-nav-link:hover { background: #f1f5f9; }
                .portal-nav-link.active { background: #eff6ff; color: #2563eb; font-weight: 600; }
            `}</style>

            {/* Brand */}
            <Link href="/portal" style={{ fontWeight: 700, fontSize: '0.95rem', color: '#111827', textDecoration: 'none', marginRight: '0.75rem' }}>
                🤖 AgentFarm
            </Link>

            {navItems.map(({ href, label }) => (
                <Link
                    key={href}
                    href={href}
                    className={`portal-nav-link${pathname === href ? ' active' : ''}`}
                >
                    {label}
                </Link>
            ))}

            {/* Spacer */}
            <div style={{ flex: 1 }} />

            {user && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                        {user.displayName ?? user.email}
                    </span>
                    <button
                        type="button"
                        onClick={() => void handleLogout()}
                        style={{
                            padding: '0.25rem 0.7rem', fontSize: '0.78rem', fontWeight: 600,
                            border: '1px solid #e2e8f0', borderRadius: 4,
                            background: 'transparent', color: '#6b7280', cursor: 'pointer',
                        }}
                    >
                        Sign out
                    </button>
                </div>
            )}
        </nav>
    );
}
