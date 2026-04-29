'use client';

import { useCallback, useEffect } from 'react';
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

const tabs: Array<{ key: DashboardTab; label: string }> = [
    { key: 'overview', label: 'Overview' },
    { key: 'approvals', label: 'Approvals' },
    { key: 'observability', label: 'Observability' },
    { key: 'audit', label: 'Audit' },
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

    if (variant === 'sidebar') {
        return (
            <nav className="sidebar-nav" aria-label="Internal dashboard navigation">
                {tabs.map((tab) => (
                    <button
                        key={tab.key}
                        type="button"
                        data-testid={`dashboard-tab-${variant}-${tab.key}`}
                        className={`sidebar-link ${activeTab === tab.key ? 'active' : ''}`}
                        onClick={() => handleTabSelect(tab.key)}
                    >
                        {tab.label}
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
                    data-testid={`dashboard-tab-${variant}-${tab.key}`}
                    className={`tab-link ${activeTab === tab.key ? 'active' : ''}`}
                    onClick={() => handleTabSelect(tab.key)}
                >
                    {tab.label}
                </button>
            ))}
        </div>
    );
}
