// ============================================================================
// PM BOARD SYNC
//
// Fetches live sprint state from Jira or Linear and normalises it into a
// board-agnostic SprintBoardState consumed by standup, health-check, and
// delivery-forecast handlers.
// ============================================================================

import type { PmConnectorClient } from './project-manager-action-handler.js';

// ---------------------------------------------------------------------------
// Normalised issue shape
// ---------------------------------------------------------------------------

export type IssueStatus = 'todo' | 'in_progress' | 'in_review' | 'blocked' | 'done';
export type IssueType  = 'story' | 'bug' | 'task' | 'subtask' | 'epic' | 'other';

export type SprintIssue = {
    id: string;
    key: string;
    title: string;
    assignee: string | null;
    status: IssueStatus;
    storyPoints: number;
    type: IssueType;
    labels: string[];
    blockedReason?: string;
};

// ---------------------------------------------------------------------------
// Board state
// ---------------------------------------------------------------------------

export type AssigneeBucket = {
    done: SprintIssue[];
    inProgress: SprintIssue[];
    todo: SprintIssue[];
    blocked: SprintIssue[];
};

export type SprintBoardState = {
    sprintId: string | number;
    sprintName: string;
    issues: SprintIssue[];
    // computed aggregates
    committedPoints: number;
    completedPoints: number;
    inProgressPoints: number;
    blockedCount: number;
    completionPct: number;
    byAssignee: Record<string, AssigneeBucket>;
};

// ---------------------------------------------------------------------------
// fetchSprintBoardState
// ---------------------------------------------------------------------------

export async function fetchSprintBoardState(
    connectorClient: PmConnectorClient,
    connector: 'jira' | 'linear',
    params: {
        sprintId: string | number;
        sprintName?: string;
        credentials?: Record<string, unknown>;
    },
): Promise<SprintBoardState | null> {
    const result = await connectorClient({
        connectorType: connector,
        actionType: 'get_sprint_issues',
        payload: {
            sprint_id: params.sprintId,
            ...(params.credentials ? { credentials: params.credentials } : {}),
        },
    }).catch(() => null);

    if (!result?.ok) return null;

    const issues = normaliseIssues(connector, result as { ok: true; data?: unknown });
    return buildBoardState(
        params.sprintId,
        params.sprintName ?? String(params.sprintId),
        issues,
    );
}

// ---------------------------------------------------------------------------
// normaliseIssues
// ---------------------------------------------------------------------------

function normaliseIssues(
    connector: 'jira' | 'linear',
    result: { ok: true; data?: unknown },
): SprintIssue[] {
    if (!result.data) return [];
    const d = result.data as Record<string, unknown>;

    if (connector === 'jira') {
        // Jira Agile: { issues: [{ key, fields: { summary, status, assignee, ... } }] }
        const raw = (d['issues'] as unknown[] | undefined) ?? [];
        return raw.map((i): SprintIssue => {
            const issue   = i as Record<string, unknown>;
            const fields  = (issue['fields'] as Record<string, unknown>) ?? {};
            const statusObj = (fields['status'] as Record<string, unknown>) ?? {};
            const catKey    = String(
                ((statusObj['statusCategory'] as Record<string, unknown>)?.['key']) ?? '',
            );
            const assigneeObj = fields['assignee'] as Record<string, unknown> | null;
            const typeObj     = fields['issuetype'] as Record<string, unknown> | undefined;
            const labels      = Array.isArray(fields['labels'])
                ? (fields['labels'] as string[])
                : [];

            // Story points: customfield_10016 (classic) or customfield_10028 (next-gen)
            const sp =
                typeof fields['customfield_10016'] === 'number' ? fields['customfield_10016'] :
                typeof fields['customfield_10028'] === 'number' ? fields['customfield_10028'] :
                typeof fields['story_points']       === 'number' ? fields['story_points']       : 0;

            return {
                id:           String(issue['id'] ?? ''),
                key:          String(issue['key'] ?? ''),
                title:        String(fields['summary'] ?? ''),
                assignee:     assigneeObj ? String(assigneeObj['displayName'] ?? '') : null,
                status:       normaliseJiraStatus(catKey, String(statusObj['name'] ?? ''), labels),
                storyPoints:  sp as number,
                type:         normaliseIssueType(String(typeObj?.['name'] ?? '')),
                labels,
                blockedReason: labels.includes('blocked')
                    ? 'Flagged as blocked in Jira'
                    : undefined,
            };
        });
    }

    // Linear: { cycle: { issues: { nodes: [...] } } }
    const cycle     = (d['cycle'] as Record<string, unknown> | undefined) ?? d;
    const issuesObj = (cycle['issues'] as Record<string, unknown> | undefined) ?? {};
    const nodes     = (issuesObj['nodes'] as unknown[]) ?? [];
    return nodes.map((n): SprintIssue => {
        const node       = n as Record<string, unknown>;
        const stateObj   = (node['state'] as Record<string, unknown>) ?? {};
        const assigneeObj = node['assignee'] as Record<string, unknown> | null;
        return {
            id:          String(node['id'] ?? ''),
            key:         String(node['identifier'] ?? ''),
            title:       String(node['title'] ?? ''),
            assignee:    assigneeObj ? String(assigneeObj['name'] ?? '') : null,
            status:      normaliseLinearStatus(
                String(stateObj['type'] ?? ''),
                String(stateObj['name'] ?? ''),
            ),
            storyPoints: typeof node['estimate'] === 'number' ? node['estimate'] : 0,
            type:        'story',
            labels:      [],
        };
    });
}

function normaliseJiraStatus(
    categoryKey: string,
    statusName: string,
    labels: string[],
): IssueStatus {
    if (labels.includes('blocked')) return 'blocked';
    const n = statusName.toLowerCase();
    if (categoryKey === 'done' || n === 'done' || n === 'closed' || n === 'resolved') return 'done';
    if (n.includes('review') || n.includes('pr open') || n.includes('qa')) return 'in_review';
    if (categoryKey === 'indeterminate' || n.includes('progress') || n === 'in development') return 'in_progress';
    return 'todo';
}

function normaliseLinearStatus(type: string, name: string): IssueStatus {
    const t = type.toLowerCase();
    const n = name.toLowerCase();
    if (t === 'completed' || t === 'cancelled') return 'done';
    if (n.includes('review') || n.includes('qa'))  return 'in_review';
    if (t === 'started' || n.includes('progress') || n.includes('development')) return 'in_progress';
    if (n.includes('blocked')) return 'blocked';
    return 'todo';
}

function normaliseIssueType(jiraType: string): IssueType {
    const t = jiraType.toLowerCase();
    if (t === 'story' || t === 'user story') return 'story';
    if (t === 'bug')                          return 'bug';
    if (t === 'subtask' || t === 'sub-task')  return 'subtask';
    if (t === 'epic')                         return 'epic';
    return 'task';
}

// ---------------------------------------------------------------------------
// buildBoardState
// ---------------------------------------------------------------------------

function buildBoardState(
    sprintId: string | number,
    sprintName: string,
    issues: SprintIssue[],
): SprintBoardState {
    const committedPoints  = issues.reduce((s, i) => s + i.storyPoints, 0);
    const completedPoints  = issues.filter((i) => i.status === 'done')
        .reduce((s, i) => s + i.storyPoints, 0);
    const inProgressPoints = issues
        .filter((i) => i.status === 'in_progress' || i.status === 'in_review')
        .reduce((s, i) => s + i.storyPoints, 0);
    const blockedCount = issues.filter((i) => i.status === 'blocked').length;
    const completionPct  = committedPoints > 0
        ? Math.round((completedPoints / committedPoints) * 100)
        : 0;

    const byAssignee: Record<string, AssigneeBucket> = {};
    for (const issue of issues) {
        const name = issue.assignee ?? 'Unassigned';
        if (!byAssignee[name]) {
            byAssignee[name] = { done: [], inProgress: [], todo: [], blocked: [] };
        }
        const bucket = byAssignee[name];
        if (issue.status === 'done')                                         bucket.done.push(issue);
        else if (issue.status === 'in_progress' || issue.status === 'in_review') bucket.inProgress.push(issue);
        else if (issue.status === 'blocked')                                 bucket.blocked.push(issue);
        else                                                                  bucket.todo.push(issue);
    }

    return {
        sprintId, sprintName, issues,
        committedPoints, completedPoints, inProgressPoints,
        blockedCount, completionPct, byAssignee,
    };
}

// ---------------------------------------------------------------------------
// formatBoardStateForStandup
// ---------------------------------------------------------------------------

export function formatBoardStateForStandup(
    board: SprintBoardState,
    daysElapsed?: number,
    daysTotal?: number,
): string {
    const lines: string[] = [];

    lines.push(`📊 Live Board — ${board.sprintName}`);
    lines.push(
        `   Committed: ${board.committedPoints}pts | Done: ${board.completedPoints}pts` +
        ` | In-Progress: ${board.inProgressPoints}pts | Blocked: ${board.blockedCount}`,
    );
    const progress = `${board.completionPct}%` +
        (daysElapsed !== undefined && daysTotal !== undefined
            ? ` (Day ${daysElapsed}/${daysTotal})`
            : '');
    lines.push(`   Completion: ${progress}`);
    lines.push('');

    for (const [assignee, bucket] of Object.entries(board.byAssignee)) {
        lines.push(`👤 ${assignee}`);
        if (bucket.done.length > 0) {
            lines.push(
                `  ✅ Done: ` +
                bucket.done.map((i) => `${i.key} – ${i.title.slice(0, 50)}`).join(', '),
            );
        }
        if (bucket.inProgress.length > 0) {
            lines.push(
                `  🔄 In Progress: ` +
                bucket.inProgress.map((i) => `${i.key} – ${i.title.slice(0, 50)}`).join(', '),
            );
        }
        if (bucket.blocked.length > 0) {
            lines.push(
                `  🚫 BLOCKED: ` +
                bucket.blocked
                    .map((i) => `${i.key} – ${i.title.slice(0, 50)}${i.blockedReason ? ` (${i.blockedReason})` : ''}`)
                    .join(', '),
            );
        }
        if (bucket.todo.length > 0) {
            lines.push(
                `  📋 Todo: ` +
                bucket.todo.map((i) => `${i.key} – ${i.title.slice(0, 50)}`).join(', '),
            );
        }
        lines.push('');
    }

    if (board.blockedCount > 0) {
        const blocked = board.issues.filter((i) => i.status === 'blocked');
        lines.push(`⚠️ ${board.blockedCount} blocked item(s) require action:`);
        for (const b of blocked) {
            lines.push(`  • ${b.key}: ${b.title.slice(0, 80)} (Owner: ${b.assignee ?? 'Unassigned'})`);
        }
    }

    return lines.join('\n');
}
