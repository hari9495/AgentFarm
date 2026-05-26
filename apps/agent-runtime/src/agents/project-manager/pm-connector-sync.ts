// ============================================================================
// PM CONNECTOR SYNC
//
// Thin wrapper that converts PM sprint-management intent into structured
// connector `executeAction` calls.  All connector I/O flows through the
// injected `executeAction` so credential isolation is preserved.
// ============================================================================

export type ExecuteActionFn = (
    connector: string,
    actionType: string,
    payload: Record<string, unknown>,
) => Promise<{ ok: boolean; data?: unknown; error?: string }>;

export type SprintSyncResult = {
    ok: boolean;
    sprintId?: string | number;
    data?: unknown;
    error?: string;
};

// ---------------------------------------------------------------------------
// createSprint
// ---------------------------------------------------------------------------

export async function syncCreateSprint(
    executeAction: ExecuteActionFn,
    connector: 'jira' | 'linear',
    params: {
        boardId?: number;
        teamId?: string;
        name: string;
        startDate?: string;
        endDate?: string;
        goal?: string;
        credentials?: Record<string, unknown>;
    },
): Promise<SprintSyncResult> {
    const payload: Record<string, unknown> = {
        name: params.name,
        ...(params.startDate ? { start_date: params.startDate } : {}),
        ...(params.endDate ? { end_date: params.endDate } : {}),
        ...(params.goal ? { goal: params.goal } : {}),
        ...(params.credentials ? { credentials: params.credentials } : {}),
    };

    if (connector === 'jira') {
        if (!params.boardId) return { ok: false, error: 'Jira createSprint requires boardId' };
        payload['board_id'] = params.boardId;
    } else {
        if (!params.teamId) return { ok: false, error: 'Linear createSprint requires teamId' };
        payload['team_id'] = params.teamId;
    }

    const result = await executeAction(connector, 'create_sprint', payload);
    if (!result.ok) return { ok: false, error: result.error };

    const id = extractSprintId(connector, result.data);
    return { ok: true, sprintId: id, data: result.data };
}

// ---------------------------------------------------------------------------
// startSprint / closeSprint
// ---------------------------------------------------------------------------

export async function syncUpdateSprintStatus(
    executeAction: ExecuteActionFn,
    connector: 'jira' | 'linear',
    params: {
        sprintId: string | number;
        state: 'active' | 'closed';
        credentials?: Record<string, unknown>;
    },
): Promise<SprintSyncResult> {
    const payload: Record<string, unknown> = {
        sprint_id: params.sprintId,
        state: params.state,
        ...(params.credentials ? { credentials: params.credentials } : {}),
    };
    const result = await executeAction(connector, 'update_sprint_status', payload);
    return { ok: result.ok, data: result.data, error: result.error };
}

// ---------------------------------------------------------------------------
// addIssuesToSprint
// ---------------------------------------------------------------------------

export async function syncAddIssuesToSprint(
    executeAction: ExecuteActionFn,
    connector: 'jira' | 'linear',
    params: {
        sprintId: string | number;
        issueKeys: string[];
        credentials?: Record<string, unknown>;
    },
): Promise<SprintSyncResult> {
    const payload: Record<string, unknown> = {
        sprint_id: params.sprintId,
        issue_keys: params.issueKeys,
        ...(params.credentials ? { credentials: params.credentials } : {}),
    };
    const result = await executeAction(connector, 'add_issue_to_sprint', payload);
    return { ok: result.ok, data: result.data, error: result.error };
}

// ---------------------------------------------------------------------------
// listSprints
// ---------------------------------------------------------------------------

export async function syncListSprints(
    executeAction: ExecuteActionFn,
    connector: 'jira' | 'linear',
    params: {
        boardId?: number;
        teamId?: string;
        state?: 'active' | 'future' | 'closed';
        credentials?: Record<string, unknown>;
    },
): Promise<SprintSyncResult> {
    const payload: Record<string, unknown> = {
        ...(params.state ? { state: params.state } : {}),
        ...(params.credentials ? { credentials: params.credentials } : {}),
    };

    if (connector === 'jira') {
        if (!params.boardId) return { ok: false, error: 'Jira listSprints requires boardId' };
        payload['board_id'] = params.boardId;
    } else {
        if (!params.teamId) return { ok: false, error: 'Linear listSprints requires teamId' };
        payload['team_id'] = params.teamId;
    }

    const result = await executeAction(connector, 'list_sprints', payload);
    return { ok: result.ok, data: result.data, error: result.error };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractSprintId(
    connector: 'jira' | 'linear',
    data: unknown,
): string | number | undefined {
    if (!data || typeof data !== 'object') return undefined;
    const d = data as Record<string, unknown>;

    if (connector === 'jira') {
        return typeof d['id'] === 'number' ? d['id'] : undefined;
    }

    // Linear: { cycleCreate: { cycle: { id, number, name } } }
    const cc = d['cycleCreate'] as Record<string, unknown> | undefined;
    const cycle = cc?.['cycle'] as Record<string, unknown> | undefined;
    return typeof cycle?.['id'] === 'string' ? cycle['id'] : undefined;
}
