'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

type DashboardMobileShellProps = {
    sidebar: ReactNode;
    workspaceName: string;
    children: ReactNode;
};

export function DashboardMobileShell({ sidebar, workspaceName, children }: DashboardMobileShellProps) {
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const pathname = usePathname();
    const searchParams = useSearchParams();

    useEffect(() => {
        setIsDrawerOpen(false);
    }, [pathname, searchParams]);

    useEffect(() => {
        const previousOverflow = document.body.style.overflow;

        if (isDrawerOpen) {
            document.body.style.overflow = 'hidden';
        }

        return () => {
            document.body.style.overflow = previousOverflow;
        };
    }, [isDrawerOpen]);

    useEffect(() => {
        if (!isDrawerOpen) {
            return;
        }

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setIsDrawerOpen(false);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isDrawerOpen]);

    useEffect(() => {
        const handleResize = () => {
            if (window.innerWidth > 860) {
                setIsDrawerOpen(false);
            }
        };

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    return (
        <main className={`dashboard-layout ${isDrawerOpen ? 'drawer-open' : ''}`}>
            <button
                type="button"
                className={`dashboard-drawer-scrim ${isDrawerOpen ? 'visible' : ''}`}
                data-testid="dashboard-drawer-scrim"
                aria-label="Close navigation drawer"
                aria-hidden={!isDrawerOpen}
                tabIndex={isDrawerOpen ? 0 : -1}
                onClick={() => setIsDrawerOpen(false)}
            />

            <aside className="dashboard-sidebar" id="dashboard-navigation-drawer" data-testid="dashboard-sidebar-drawer">
                {sidebar}
            </aside>

            <section className="dashboard-main">
                <div className="dashboard-mobile-toolbar">
                    <button
                        type="button"
                        className="dashboard-drawer-toggle"
                        data-testid="dashboard-drawer-toggle"
                        aria-controls="dashboard-navigation-drawer"
                        aria-expanded={isDrawerOpen}
                        onClick={() => setIsDrawerOpen((current) => !current)}
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <line x1="3" y1="6" x2="21" y2="6" />
                            <line x1="3" y1="12" x2="21" y2="12" />
                            <line x1="3" y1="18" x2="21" y2="18" />
                        </svg>
                        <span>Menu</span>
                    </button>

                    <p className="dashboard-mobile-workspace">{workspaceName}</p>
                </div>

                {children}
            </section>
        </main>
    );
}