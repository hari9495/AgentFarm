'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_ITEMS = [
    { label: 'Overview', href: '/sales' },
    { label: 'Pipeline', href: '/sales/pipeline' },
    { label: 'Deals', href: '/sales/deals' },
    { label: 'Activity', href: '/sales/activity' },
    { label: 'Browser Tasks', href: '/sales/browser-tasks' },
] as const;

export function SalesSectionNav() {
    const pathname = usePathname();

    return (
        <nav
            aria-label="Sales section"
            style={{
                display: 'flex',
                gap: '0.25rem',
                marginBottom: '1.5rem',
                background: 'var(--line)',
                borderRadius: 10,
                padding: '0.25rem',
                width: 'fit-content',
            }}
        >
            {NAV_ITEMS.map(item => {
                const isActive = pathname === item.href;
                return (
                    <Link
                        key={item.href}
                        href={item.href}
                        style={{
                            padding: '0.375rem 1rem',
                            borderRadius: 8,
                            fontSize: '0.875rem',
                            fontWeight: 500,
                            color: isActive ? 'var(--ink)' : 'var(--ink-muted)',
                            background: isActive ? 'var(--card)' : 'transparent',
                            boxShadow: isActive ? 'var(--shadow-sm)' : 'none',
                            textDecoration: 'none',
                            transition: 'all 0.15s ease',
                            whiteSpace: 'nowrap',
                        }}
                    >
                        {item.label}
                    </Link>
                );
            })}
        </nav>
    );
}
