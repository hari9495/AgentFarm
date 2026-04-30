'use client';

import { useCallback, useEffect, type ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { buildDashboardHref, type DashboardTab } from './dashboard-navigation';
import {
    getDashboardTabStorageKey,
    getLegacyDashboardTabStorageKey,
    resolveDashboardStoredTab,
} from './dashboard-tab-storage';

type DashboardTabNavProps = {
    activeTab: DashboardTab;
    variant: 'sidebar' | 'top';
    syncFromStorage?: boolean;
    workspaceId?: string;
};

const tabs: Array<{ key: DashboardTab; label: string; icon: ReactNode }> = [
    {
        key: 'overview',
        label: 'Overview',
        icon: (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" />
            </svg>
        ),
    },
    {
        key: 'approvals',
        label: 'Approvals',
        icon: (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
            </svg>
        ),
    },
    {
        key: 'observability',
        label: 'Observability',
        icon: (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
        ),
    },
    {
        key: 'audit',
        label: 'Audit',
        icon: (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" />
            </svg>
        ),
    },
];

const isDashboardTab = (value: string | null): value is DashboardTab =>
    value === 'overview' || value === 'approvals' || value === 'observability' || value === 'audit';

export function DashboardTabNav({ activeTab, variant, syncFromStorage = false, workspaceId }: DashboardTabNavProps) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const getTabHref = useCallback(
        (tab: DashboardTab) => {
            return buildDashboardHref(pathname, searchParams.toString(), {
                tab,
                workspaceId,
            });
        },
        [pathname, searchParams, workspaceId],
    );

    useEffect(() => {
        if (!syncFromStorage) {
            return;
        }

        const hasUrlTab = isDashboardTab(searchParams.get('tab'));
        if (hasUrlTab) {
            return;
        }

        const workspaceStorageKey = getDashboardTabStorageKey(workspaceId);
        const { storedTab, shouldMigrateLegacy } = resolveDashboardStoredTab({
            workspaceStoredTab: window.localStorage.getItem(workspaceStorageKey),
            legacyStoredTab: window.localStorage.getItem(getLegacyDashboardTabStorageKey()),
            workspaceId,
        });

        if (!storedTab || storedTab === activeTab) {
            return;
        }

        if (shouldMigrateLegacy) {
            window.localStorage.setItem(workspaceStorageKey, storedTab);
        }

        router.replace(getTabHref(storedTab));
    }, [activeTab, getTabHref, router, searchParams, syncFromStorage, workspaceId]);

    const handleTabSelect = (tab: DashboardTab) => {
        window.localStorage.setItem(getDashboardTabStorageKey(workspaceId), tab);
        router.push(getTabHref(tab));
    };

    const handleTopTabKeyDown = (currentTab: DashboardTab, event: React.KeyboardEvent<HTMLButtonElement>) => {
        const currentIndex = tabs.findIndex((tab) => tab.key === currentTab);

        if (currentIndex < 0) {
            return;
        }

        if (event.key === 'ArrowRight') {
            event.preventDefault();
            handleTabSelect(tabs[(currentIndex + 1) % tabs.length].key);
            return;
        }

        if (event.key === 'ArrowLeft') {
            event.preventDefault();
            handleTabSelect(tabs[(currentIndex - 1 + tabs.length) % tabs.length].key);
            return;
        }

        if (event.key === 'Home') {
            event.preventDefault();
            handleTabSelect(tabs[0].key);
            return;
        }

        if (event.key === 'End') {
            event.preventDefault();
            handleTabSelect(tabs[tabs.length - 1].key);
        }
    };

    if (variant === 'sidebar') {
        return (
            <nav className="sidebar-nav" aria-label="Internal dashboard navigation">
                {tabs.map((tab) => (
                    <button
                        key={tab.key}
                        type="button"
                        data-testid={`dashboard-tab-${variant}-${tab.key}`}
                        className={`sidebar-link ${activeTab === tab.key ? 'active' : ''}`}
                        aria-current={activeTab === tab.key ? 'page' : undefined}
                        aria-label={`${tab.label} view`}
                        onClick={() => handleTabSelect(tab.key)}
                    >
                        {tab.icon}
                        <span>{tab.label}</span>
                    </button>
                ))}
            </nav>
        );
    }

    return (
        <div className="tab-row" role="tablist" aria-label="Dashboard tabs">
            {tabs.map((tab) => (
                <button
                    key={tab.key}
                    type="button"
                    role="tab"
                    id={`dashboard-tab-${tab.key}`}
                    aria-selected={activeTab === tab.key}
                    aria-controls={`dashboard-panel-${tab.key}`}
                    tabIndex={activeTab === tab.key ? 0 : -1}
                    data-testid={`dashboard-tab-${variant}-${tab.key}`}
                    className={`tab-link ${activeTab === tab.key ? 'active' : ''}`}
                    onKeyDown={(event) => handleTopTabKeyDown(tab.key, event)}
                    onClick={() => handleTabSelect(tab.key)}
                >
                    <span className="tab-link-icon" aria-hidden="true">{tab.icon}</span>
                    <span>{tab.label}</span>
                </button>
            ))}
        </div>
    );
}
