'use client';

import { useEffect, useState, useRef, useCallback, type ReactNode, type CSSProperties } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { SidebarCollapseContext } from './sidebar-collapse-context';

type DashboardMobileShellProps = {
    sidebar: ReactNode;
    workspaceName: string;
    children: ReactNode;
};

const SB_MIN = 200;
const SB_MAX = 400;
const SB_DEFAULT = 256;
const SB_RAIL = 68;
const LS_COLLAPSED = 'af_ops_sidebar_collapsed';
const LS_WIDTH = 'af_ops_sidebar_width';

export function DashboardMobileShell({ sidebar, workspaceName, children }: DashboardMobileShellProps) {
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [collapsed, setCollapsed] = useState(false);
    const [width, setWidth] = useState(SB_DEFAULT);
    const [dragging, setDragging] = useState(false);
    const asideRef = useRef<HTMLElement>(null);
    const pathname = usePathname();
    const searchParams = useSearchParams();

    // Restore persisted collapse/width.
    useEffect(() => {
        try {
            if (localStorage.getItem(LS_COLLAPSED) === '1') setCollapsed(true);
            const w = Number(localStorage.getItem(LS_WIDTH));
            if (w >= SB_MIN && w <= SB_MAX) setWidth(w);
        } catch { /* private mode */ }
    }, []);

    const toggleCollapse = useCallback(() => {
        setCollapsed((prev) => {
            const next = !prev;
            try { localStorage.setItem(LS_COLLAPSED, next ? '1' : '0'); } catch { /* noop */ }
            return next;
        });
    }, []);

    const startResize = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        const left = asideRef.current?.getBoundingClientRect().left ?? 0;
        setDragging(true);
        const onMove = (ev: MouseEvent) => setWidth(Math.max(SB_MIN, Math.min(SB_MAX, ev.clientX - left)));
        const onUp = (ev: MouseEvent) => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            document.body.style.userSelect = '';
            document.body.style.cursor = '';
            setDragging(false);
            const w = Math.max(SB_MIN, Math.min(SB_MAX, ev.clientX - left));
            try { localStorage.setItem(LS_WIDTH, String(w)); } catch { /* noop */ }
        };
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'col-resize';
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    }, []);

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
        <SidebarCollapseContext.Provider value={{ collapsed, toggle: toggleCollapse }}>
        <main
            className={`dashboard-layout ${isDrawerOpen ? 'drawer-open' : ''}`}
            style={{ ['--dash-sidebar-w' as keyof CSSProperties]: collapsed ? `${SB_RAIL}px` : `${width}px` } as CSSProperties}
        >
            <button
                type="button"
                className={`dashboard-drawer-scrim ${isDrawerOpen ? 'visible' : ''}`}
                data-testid="dashboard-drawer-scrim"
                aria-label="Close navigation drawer"
                aria-hidden={!isDrawerOpen}
                tabIndex={isDrawerOpen ? 0 : -1}
                onClick={() => setIsDrawerOpen(false)}
            />

            <aside ref={asideRef} className="dashboard-sidebar" id="dashboard-navigation-drawer" data-testid="dashboard-sidebar-drawer">
                {sidebar}
                {/* Desktop resize handle (expanded only) */}
                {!collapsed && (
                    <div
                        onMouseDown={startResize}
                        onDoubleClick={() => { setWidth(SB_DEFAULT); try { localStorage.setItem(LS_WIDTH, String(SB_DEFAULT)); } catch { /* noop */ } }}
                        title="Drag to resize · double-click to reset"
                        className="sidebar-resize-handle"
                        style={{ background: dragging ? 'var(--accent)' : undefined }}
                    />
                )}
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
        </SidebarCollapseContext.Provider>
    );
}