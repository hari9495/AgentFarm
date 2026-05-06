'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { buildDashboardHref, type DashboardTab } from './dashboard-navigation';
import {
    getDashboardTabStorageKey,
    getDashboardWorkspaceStorageKey,
    resolveDashboardStoredWorkspaceId,
    resolveDashboardStoredTab,
} from './dashboard-tab-storage';

type WorkspaceOption = {
    workspaceId: string;
    workspaceName: string;
};

type DashboardWorkspaceSwitcherProps = {
    activeWorkspaceId: string;
    activeTab: DashboardTab;
    workspaces: WorkspaceOption[];
    variant: 'topbar' | 'sidebar';
    syncFromStorage?: boolean;
};

export function DashboardWorkspaceSwitcher({
    activeWorkspaceId,
    activeTab,
    workspaces,
    variant,
    syncFromStorage = false,
}: DashboardWorkspaceSwitcherProps) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [pendingWorkspaceId, setPendingWorkspaceId] = useState(activeWorkspaceId);

    const availableWorkspaceIds = workspaces.map((item) => item.workspaceId);

    useEffect(() => {
        setPendingWorkspaceId(activeWorkspaceId);
    }, [activeWorkspaceId]);

    const buildWorkspaceHref = useCallback(
        (workspaceId: string, tab: DashboardTab | undefined) => {
            return buildDashboardHref(pathname, searchParams.toString(), {
                workspaceId,
                tab,
            });
        },
        [pathname, searchParams],
    );

    useEffect(() => {
        const storageKey = getDashboardWorkspaceStorageKey();
        const tabFromUrl = searchParams.get('tab');

        if (searchParams.get('workspaceId')) {
            window.localStorage.setItem(storageKey, activeWorkspaceId);

            if (
                tabFromUrl === 'overview'
                || tabFromUrl === 'approvals'
                || tabFromUrl === 'observability'
                || tabFromUrl === 'audit'
                || tabFromUrl === 'marketplace'
            ) {
                window.localStorage.setItem(getDashboardTabStorageKey(activeWorkspaceId), tabFromUrl);
            }

            if (syncFromStorage && !searchParams.get('tab')) {
                const tabKey = getDashboardTabStorageKey(activeWorkspaceId);
                const { storedTab } = resolveDashboardStoredTab({
                    workspaceStoredTab: window.localStorage.getItem(tabKey),
                    legacyStoredTab: null,
                    workspaceId: activeWorkspaceId,
                });
                if (storedTab && storedTab !== activeTab) {
                    router.replace(buildWorkspaceHref(activeWorkspaceId, storedTab));
                }
            }

            return;
        }

        if (!syncFromStorage) {
            return;
        }

        const storedWorkspaceId = resolveDashboardStoredWorkspaceId({
            storedWorkspaceId: window.localStorage.getItem(storageKey),
            availableWorkspaceIds,
        });

        if (!storedWorkspaceId || storedWorkspaceId === activeWorkspaceId) {
            return;
        }

        const hasUrlTab = searchParams.get('tab') !== null;
        const restoredTab = hasUrlTab
            ? activeTab
            : resolveDashboardStoredTab({
                workspaceStoredTab: window.localStorage.getItem(getDashboardTabStorageKey(storedWorkspaceId)),
                legacyStoredTab: null,
                workspaceId: storedWorkspaceId,
            }).storedTab ?? undefined;

        router.replace(buildWorkspaceHref(storedWorkspaceId, restoredTab));
    }, [activeTab, activeWorkspaceId, availableWorkspaceIds, buildWorkspaceHref, router, searchParams, syncFromStorage]);

    const handleOpen = () => {
        if (!pendingWorkspaceId) {
            return;
        }

        window.localStorage.setItem(getDashboardWorkspaceStorageKey(), pendingWorkspaceId);
        router.push(buildWorkspaceHref(pendingWorkspaceId, activeTab));
    };

    const inputId = variant === 'topbar' ? 'workspaceId-topbar' : 'workspaceId-sidebar';

    return (
        <div className={`workspace-switcher workspace-switcher--${variant}`} aria-label={`${variant} workspace selector`}>
            <label htmlFor={inputId} className="workspace-switcher-label">
                Workspace
            </label>
            <select
                id={inputId}
                value={pendingWorkspaceId}
                className="workspace-switcher-select"
                data-testid={`workspace-switcher-${variant}`}
                onChange={(event) => setPendingWorkspaceId(event.target.value)}
            >
                {workspaces.map((option) => (
                    <option key={option.workspaceId} value={option.workspaceId}>
                        {option.workspaceName}
                    </option>
                ))}
            </select>
            <button
                type="button"
                className="workspace-switcher-button"
                data-testid={`workspace-switcher-open-${variant}`}
                onClick={handleOpen}
            >
                Open
            </button>
        </div>
    );
}
