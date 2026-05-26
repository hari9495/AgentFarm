// ============================================================================
// PM SPRINT HEALTH MONITOR
//
// Computes the real-time RAG health of the current sprint by comparing the
// actual completion rate against the expected burndown, then optionally fires
// an alert to Slack/Teams when the status drops to RED or AMBER.
//
// A human SM checks the burndown chart every morning and raises the alarm
// before the sprint goal is at risk — this module does the same thing
// autonomously.
// ============================================================================

import type { PmConnectorClient } from './project-manager-action-handler.js';
import { fetchSprintBoardState, type SprintBoardState } from './pm-board-sync.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RagStatus = 'green' | 'amber' | 'red';

export type SprintHealthReport = {
    sprintName: string;
    ragStatus: RagStatus;
    completionPct: number;
    expectedCompletionPct: number;
    variance: number;              // actual - expected (negative = behind)
    blockedCount: number;
    committedPoints: number;
    completedPoints: number;
    inProgressPoints: number;
    atRiskStories: string[];        // titles of blocked or overdue items
    recommendation: string;
    alertRequired: boolean;
    formattedReport: string;
    boardState?: SprintBoardState;
};

export type SprintHealthParams = {
    sprintName: string;
    sprintDaysTotal: number;
    sprintDaysElapsed: number;
    committedPoints: number;
    completedPoints: number;
    inProgressPoints: number;
    blockedCount: number;
    atRiskStories?: string[];
};

// ---------------------------------------------------------------------------
// computeSprintHealth  — pure function, no I/O
// ---------------------------------------------------------------------------

export function computeSprintHealth(p: SprintHealthParams): SprintHealthReport {
    const {
        sprintName, sprintDaysTotal, sprintDaysElapsed,
        committedPoints, completedPoints, inProgressPoints, blockedCount,
        atRiskStories = [],
    } = p;

    const completionPct = committedPoints > 0
        ? Math.round((completedPoints / committedPoints) * 100)
        : 0;

    const elapsedRatio   = sprintDaysTotal > 0 ? sprintDaysElapsed / sprintDaysTotal : 0;
    const expectedCompletionPct = Math.round(elapsedRatio * 100);
    const variance              = completionPct - expectedCompletionPct;

    // RAG classification
    // RED:   >20% behind expected OR blockedCount >= 3 OR completion < 50% with <2 days left
    // AMBER: 10–20% behind OR blockedCount >= 1 OR completion < 75% with <3 days left
    // GREEN: otherwise
    const daysLeft = sprintDaysTotal - sprintDaysElapsed;
    let ragStatus: RagStatus = 'green';

    if (
        variance <= -20 ||
        blockedCount >= 3 ||
        (daysLeft <= 2 && completionPct < 50)
    ) {
        ragStatus = 'red';
    } else if (
        variance <= -10 ||
        blockedCount >= 1 ||
        (daysLeft <= 3 && completionPct < 75)
    ) {
        ragStatus = 'amber';
    }

    const alertRequired = ragStatus === 'red' || (ragStatus === 'amber' && daysLeft <= 3);

    const recommendation = buildRecommendation(ragStatus, {
        variance, blockedCount, daysLeft, committedPoints,
        completedPoints, inProgressPoints, sprintName,
    });

    const formattedReport = formatHealthReport({
        sprintName, ragStatus, completionPct, expectedCompletionPct, variance,
        blockedCount, committedPoints, completedPoints, inProgressPoints,
        atRiskStories, recommendation, daysLeft,
    });

    return {
        sprintName, ragStatus, completionPct, expectedCompletionPct, variance,
        blockedCount, committedPoints, completedPoints, inProgressPoints,
        atRiskStories, recommendation, alertRequired, formattedReport,
    };
}

// ---------------------------------------------------------------------------
// runSprintHealthCheck — fetches live board state + computes health + alerts
// ---------------------------------------------------------------------------

export async function runSprintHealthCheck(params: {
    sprintId: string | number;
    sprintName: string;
    sprintDaysTotal: number;
    sprintDaysElapsed: number;
    connector?: 'jira' | 'linear';
    connectorClient?: PmConnectorClient;
    slackChannel?: string;
    teamsWebhook?: string;
    credentials?: Record<string, unknown>;
}): Promise<SprintHealthReport> {
    const {
        sprintId, sprintName, sprintDaysTotal, sprintDaysElapsed,
        connector, connectorClient, slackChannel, teamsWebhook, credentials,
    } = params;

    // ── Fetch live board state if connector is available ──────────────────────
    let boardState: SprintBoardState | undefined;
    if (connectorClient && connector && sprintId) {
        boardState = await fetchSprintBoardState(connectorClient, connector, {
            sprintId, sprintName, credentials,
        }) ?? undefined;
    }

    // Use board state if available, else caller-supplied values
    const committedPoints  = boardState?.committedPoints  ?? 0;
    const completedPoints  = boardState?.completedPoints  ?? 0;
    const inProgressPoints = boardState?.inProgressPoints ?? 0;
    const blockedCount     = boardState?.blockedCount     ?? 0;
    const atRiskStories    = boardState
        ? boardState.issues
            .filter((i) => i.status === 'blocked')
            .map((i) => `${i.key} – ${i.title.slice(0, 60)}`)
        : [];

    const health = computeSprintHealth({
        sprintName, sprintDaysTotal, sprintDaysElapsed,
        committedPoints, completedPoints, inProgressPoints, blockedCount, atRiskStories,
    });

    // ── Send alert if required ────────────────────────────────────────────────
    if (health.alertRequired && connectorClient) {
        const alertText = buildAlertMessage(health);
        if (slackChannel) {
            connectorClient({
                connectorType: 'slack',
                actionType:    'send_message',
                payload:       { channel_id: slackChannel, text: alertText },
            }).catch(() => { /* non-fatal */ });
        } else if (teamsWebhook) {
            connectorClient({
                connectorType: 'teams',
                actionType:    'send_message',
                payload:       { webhook_url: teamsWebhook, text: alertText },
            }).catch(() => { /* non-fatal */ });
        }
    }

    return { ...health, boardState };
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

function buildRecommendation(
    rag: RagStatus,
    ctx: {
        variance: number;
        blockedCount: number;
        daysLeft: number;
        committedPoints: number;
        completedPoints: number;
        inProgressPoints: number;
        sprintName: string;
    },
): string {
    const { variance, blockedCount, daysLeft, committedPoints, completedPoints, inProgressPoints } = ctx;
    const remaining = committedPoints - completedPoints - inProgressPoints;

    if (rag === 'red') {
        const parts: string[] = [];
        if (blockedCount >= 3) {
            parts.push(`Address ${blockedCount} blocked items immediately — unblocking is the highest priority.`);
        }
        if (variance <= -20) {
            parts.push(`Sprint is ${Math.abs(variance)}% behind the expected burndown. Consider descoping ${Math.ceil(remaining * 0.25)} pts to protect the sprint goal.`);
        }
        if (daysLeft <= 2) {
            parts.push(`Only ${daysLeft} day(s) left. Escalate to stakeholders and agree a revised scope now.`);
        }
        return parts.join(' ') || 'Sprint is at risk. Escalate immediately and reassess scope.';
    }

    if (rag === 'amber') {
        const parts: string[] = [];
        if (blockedCount >= 1) {
            parts.push(`Resolve ${blockedCount} blocked item(s) to avoid further slip.`);
        }
        if (variance <= -10) {
            parts.push(`Sprint is ${Math.abs(variance)}% behind plan. Review team capacity and re-prioritise if needed.`);
        }
        return parts.join(' ') || 'Monitor closely. Consider a mid-sprint sync to realign.';
    }

    return `Sprint is on track (${ctx.completedPoints}/${ctx.committedPoints} pts done). Keep the momentum.`;
}

function buildAlertMessage(health: SprintHealthReport): string {
    const ragIcon = health.ragStatus === 'red' ? '🔴' : '🟠';
    return [
        `${ragIcon} *Sprint Health Alert — ${health.sprintName}*`,
        `Status: *${health.ragStatus.toUpperCase()}* | Completion: ${health.completionPct}% (expected ${health.expectedCompletionPct}%)`,
        `Blocked: ${health.blockedCount} | Committed: ${health.committedPoints}pts | Done: ${health.completedPoints}pts`,
        '',
        `*Recommendation:* ${health.recommendation}`,
        health.atRiskStories.length > 0
            ? `*At-risk items:*\n${health.atRiskStories.map((s) => `  • ${s}`).join('\n')}`
            : '',
    ].filter(Boolean).join('\n');
}

function formatHealthReport(ctx: {
    sprintName: string;
    ragStatus: RagStatus;
    completionPct: number;
    expectedCompletionPct: number;
    variance: number;
    blockedCount: number;
    committedPoints: number;
    completedPoints: number;
    inProgressPoints: number;
    atRiskStories: string[];
    recommendation: string;
    daysLeft: number;
}): string {
    const {
        sprintName, ragStatus, completionPct, expectedCompletionPct, variance,
        blockedCount, committedPoints, completedPoints, inProgressPoints,
        atRiskStories, recommendation, daysLeft,
    } = ctx;

    const ragIcon  = ragStatus === 'green' ? '🟢' : ragStatus === 'amber' ? '🟡' : '🔴';
    const varLabel = variance >= 0 ? `+${variance}%` : `${variance}%`;

    const lines = [
        `## Sprint Health Report — ${sprintName}`,
        '',
        `### Overall Status: ${ragIcon} ${ragStatus.toUpperCase()}`,
        '',
        `| Metric | Value |`,
        `|--------|-------|`,
        `| Completion | ${completionPct}% (expected ${expectedCompletionPct}%) |`,
        `| Variance | ${varLabel} |`,
        `| Committed | ${committedPoints} pts |`,
        `| Completed | ${completedPoints} pts |`,
        `| In Progress | ${inProgressPoints} pts |`,
        `| Blocked | ${blockedCount} item(s) |`,
        `| Days Remaining | ${daysLeft} |`,
        '',
    ];

    if (atRiskStories.length > 0) {
        lines.push('### At-Risk Items');
        for (const s of atRiskStories) lines.push(`- ${s}`);
        lines.push('');
    }

    lines.push('### Recommendation');
    lines.push(recommendation);
    lines.push('');
    lines.push(`_Generated ${new Date().toISOString().slice(0, 10)}_`);

    return lines.join('\n');
}
