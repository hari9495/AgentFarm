const DASHBOARD_TAB_STORAGE_KEY_PREFIX = 'agentfarm.dashboard.activeTab';
const DASHBOARD_WORKSPACE_STORAGE_KEY = 'agentfarm.dashboard.activeWorkspaceId';

type DashboardTab = 'overview' | 'approvals' | 'observability' | 'audit';

const isDashboardTab = (value: string | null): value is DashboardTab =>
    value === 'overview' || value === 'approvals' || value === 'observability' || value === 'audit';

export const getDashboardTabStorageKey = (workspaceId?: string): string => {
    if (!workspaceId) {
        return DASHBOARD_TAB_STORAGE_KEY_PREFIX;
    }

    return `${DASHBOARD_TAB_STORAGE_KEY_PREFIX}.${workspaceId}`;
};

export const getLegacyDashboardTabStorageKey = (): string => DASHBOARD_TAB_STORAGE_KEY_PREFIX;

export const getDashboardWorkspaceStorageKey = (): string => DASHBOARD_WORKSPACE_STORAGE_KEY;

export const resolveDashboardStoredTab = ({
    workspaceStoredTab,
    legacyStoredTab,
    workspaceId,
}: {
    workspaceStoredTab: string | null;
    legacyStoredTab: string | null;
    workspaceId?: string;
}): { storedTab: DashboardTab | null; shouldMigrateLegacy: boolean } => {
    if (isDashboardTab(workspaceStoredTab)) {
        return { storedTab: workspaceStoredTab, shouldMigrateLegacy: false };
    }

    if (isDashboardTab(legacyStoredTab)) {
        return { storedTab: legacyStoredTab, shouldMigrateLegacy: Boolean(workspaceId) };
    }

    return { storedTab: null, shouldMigrateLegacy: false };
};

export const resolveDashboardStoredWorkspaceId = ({
    storedWorkspaceId,
    availableWorkspaceIds,
}: {
    storedWorkspaceId: string | null;
    availableWorkspaceIds: string[];
}): string | null => {
    if (!storedWorkspaceId) {
        return null;
    }

    return availableWorkspaceIds.includes(storedWorkspaceId) ? storedWorkspaceId : null;
};
