export type DashboardTab = 'overview' | 'approvals' | 'observability' | 'audit';

type DashboardNavigationUpdate = {
    tab?: DashboardTab;
    workspaceId?: string;
    params?: Record<string, string | undefined>;
};

export const buildDashboardHref = (
    pathname: string,
    search: string,
    update: DashboardNavigationUpdate,
): string => {
    const nextParams = new URLSearchParams(search);

    if (update.tab) {
        nextParams.set('tab', update.tab);
    }

    if (update.workspaceId) {
        nextParams.set('workspaceId', update.workspaceId);
    }

    if (update.params) {
        for (const [key, value] of Object.entries(update.params)) {
            if (typeof value === 'string' && value.length > 0) {
                nextParams.set(key, value);
                continue;
            }

            nextParams.delete(key);
        }
    }

    const query = nextParams.toString();
    return query.length > 0 ? `${pathname}?${query}` : pathname;
};
