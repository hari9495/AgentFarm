/**
 * Backlog Groomer
 *
 * Pure functions for analysing and refining a product backlog.
 * Identifies stories that are ready for sprint vs. need more work,
 * scores Definition of Ready (DoR) compliance, and formats grooming reports.
 *
 * Definition of Ready (DoR) checklist used:
 *   1. User story follows "As a / I want / So that" format
 *   2. Acceptance criteria present (Given/When/Then or equivalent)
 *   3. Story is estimated (points > 0)
 *   4. Dependencies are identified and documented
 *   5. Not larger than half the team's sprint capacity (i.e. not an epic)
 *
 * No I/O — all data passed in; output is a plain object.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GroomingItem {
    id: string;
    title: string;
    description?: string;
    type: 'story' | 'bug' | 'task' | 'spike' | 'epic';
    points: number;
    priority: 'critical' | 'high' | 'medium' | 'low';
    hasAcceptanceCriteria: boolean;
    isEstimated: boolean;
    hasDependenciesDocumented: boolean;
    dependsOn?: string[];
    labels?: string[];
}

export interface DorScore {
    total: number;        // 0–5 checks passed
    ready: boolean;       // score >= 4 (DoR threshold)
    failedChecks: string[];
    passedChecks: string[];
}

export interface GroomedItem {
    item: GroomingItem;
    dor: DorScore;
    sprintReadiness: 'ready' | 'needs_work' | 'must_split';
    recommendations: string[];
}

export interface BacklogGroomingResult {
    totalItems: number;
    readyCount: number;
    needsWorkCount: number;
    mustSplitCount: number;
    groomedItems: GroomedItem[];
    priorityDistribution: Record<string, number>;
    warnings: string[];
    markdown: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const LARGE_STORY_THRESHOLD = 8; // points; stories ≥ this should be split

function scoreDoR(item: GroomingItem): DorScore {
    const passedChecks: string[] = [];
    const failedChecks: string[] = [];

    // 1. User story format
    const hasStoryFormat = item.description
        ? /as\s+a\b/i.test(item.description) && /i\s+want\b/i.test(item.description)
        : false;
    if (hasStoryFormat || item.type !== 'story') {
        passedChecks.push('Story follows standard format (or non-story type)');
    } else {
        failedChecks.push('Missing "As a / I want / So that" user story format');
    }

    // 2. Acceptance criteria
    if (item.hasAcceptanceCriteria) {
        passedChecks.push('Acceptance criteria defined');
    } else {
        failedChecks.push('No acceptance criteria — add Given/When/Then scenarios');
    }

    // 3. Estimated
    if (item.isEstimated && item.points > 0) {
        passedChecks.push('Story is estimated');
    } else {
        failedChecks.push('Story is not estimated — needs sizing in grooming session');
    }

    // 4. Dependencies documented
    if (item.hasDependenciesDocumented) {
        passedChecks.push('Dependencies documented');
    } else {
        failedChecks.push('Dependencies not documented — confirm with team');
    }

    // 5. Not an epic (not oversized)
    if (item.points < LARGE_STORY_THRESHOLD) {
        passedChecks.push('Story fits within sprint (not oversized)');
    } else {
        failedChecks.push(`Story is too large (${item.points}pts ≥ ${LARGE_STORY_THRESHOLD}pts) — split into smaller stories`);
    }

    const total = passedChecks.length;
    return {
        total,
        ready: total >= 4,
        failedChecks,
        passedChecks,
    };
}

function buildRecommendations(item: GroomingItem, dor: DorScore): string[] {
    const recs: string[] = [];
    for (const check of dor.failedChecks) {
        if (check.includes('story format')) {
            recs.push('Rewrite title and description as: "As a [persona], I want [goal] so that [benefit]"');
        } else if (check.includes('acceptance criteria')) {
            recs.push('Add at least one Given/When/Then acceptance scenario covering the happy path and one error path');
        } else if (check.includes('not estimated')) {
            recs.push('Schedule a pointing session to estimate this story before the next sprint planning');
        } else if (check.includes('Dependencies')) {
            recs.push('Document upstream/downstream dependencies in the story description or link dependent tickets');
        } else if (check.includes('too large')) {
            recs.push(`Split into 2–4 smaller stories each ≤ ${LARGE_STORY_THRESHOLD - 1}pts. Consider using an Epic as the parent.`);
        }
    }
    return recs;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Run the full backlog grooming analysis on a list of backlog items.
 * Returns per-item DoR scores, sprint readiness, and formatted markdown.
 */
export function groomBacklog(items: GroomingItem[]): BacklogGroomingResult {
    const warnings: string[] = [];
    const groomedItems: GroomedItem[] = [];

    const priorityDist: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0 };

    for (const item of items) {
        priorityDist[item.priority] = (priorityDist[item.priority] ?? 0) + 1;

        const dor = scoreDoR(item);
        const recommendations = buildRecommendations(item, dor);

        let sprintReadiness: GroomedItem['sprintReadiness'];
        if (item.points >= LARGE_STORY_THRESHOLD) {
            sprintReadiness = 'must_split';
        } else if (dor.ready) {
            sprintReadiness = 'ready';
        } else {
            sprintReadiness = 'needs_work';
        }

        groomedItems.push({ item, dor, sprintReadiness, recommendations });
    }

    // Sort: must_split first, then needs_work, then ready; within each group by priority
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    const readinessOrder = { must_split: 0, needs_work: 1, ready: 2 };
    groomedItems.sort((a, b) => {
        const rDiff = readinessOrder[a.sprintReadiness] - readinessOrder[b.sprintReadiness];
        if (rDiff !== 0) return rDiff;
        return priorityOrder[a.item.priority] - priorityOrder[b.item.priority];
    });

    const readyCount     = groomedItems.filter((g) => g.sprintReadiness === 'ready').length;
    const needsWorkCount = groomedItems.filter((g) => g.sprintReadiness === 'needs_work').length;
    const mustSplitCount = groomedItems.filter((g) => g.sprintReadiness === 'must_split').length;

    if (mustSplitCount > 0) {
        warnings.push(`${mustSplitCount} story/stories must be split before they can be planned into a sprint.`);
    }
    if (needsWorkCount > items.length * 0.5) {
        warnings.push('More than 50% of the backlog needs grooming work. Consider holding a dedicated refinement session.');
    }
    if ((priorityDist['critical'] ?? 0) > 5) {
        warnings.push('More than 5 items marked "critical" — review priority distribution to ensure accurate prioritisation.');
    }

    const markdown = formatGroomingMarkdown({
        groomedItems,
        readyCount,
        needsWorkCount,
        mustSplitCount,
        priorityDist,
        warnings,
    });

    return {
        totalItems: items.length,
        readyCount,
        needsWorkCount,
        mustSplitCount,
        groomedItems,
        priorityDistribution: priorityDist,
        warnings,
        markdown,
    };
}

function readinessEmoji(r: GroomedItem['sprintReadiness']): string {
    return { ready: '✅', needs_work: '🔧', must_split: '✂️' }[r];
}

function formatGroomingMarkdown(params: {
    groomedItems: GroomedItem[];
    readyCount: number;
    needsWorkCount: number;
    mustSplitCount: number;
    priorityDist: Record<string, number>;
    warnings: string[];
}): string {
    const { groomedItems, readyCount, needsWorkCount, mustSplitCount, priorityDist, warnings } = params;
    const total = groomedItems.length;
    const lines: string[] = [];

    lines.push('# 📋 Backlog Grooming Report');
    lines.push('');
    lines.push(`| Status | Count |`);
    lines.push(`|---|---|`);
    lines.push(`| ✅ Sprint-Ready | ${readyCount} of ${total} |`);
    lines.push(`| 🔧 Needs Refinement | ${needsWorkCount} of ${total} |`);
    lines.push(`| ✂️ Must Split | ${mustSplitCount} of ${total} |`);
    lines.push('');

    lines.push('## Item Breakdown');
    lines.push('');
    lines.push('| ID | Title | Type | Points | Priority | Readiness | DoR |');
    lines.push('|---|---|---|---|---|---|---|');
    for (const g of groomedItems) {
        const emoji = readinessEmoji(g.sprintReadiness);
        lines.push(`| ${g.item.id} | ${g.item.title.slice(0, 50)} | ${g.item.type} | ${g.item.points} | ${g.item.priority} | ${emoji} ${g.sprintReadiness.replace('_', ' ')} | ${g.dor.total}/5 |`);
    }
    lines.push('');

    const needsAction = groomedItems.filter((g) => g.sprintReadiness !== 'ready');
    if (needsAction.length > 0) {
        lines.push('## 🔧 Action Required');
        lines.push('');
        for (const g of needsAction) {
            lines.push(`### [${g.item.id}] ${g.item.title}`);
            lines.push(`**Status:** ${readinessEmoji(g.sprintReadiness)} ${g.sprintReadiness.replace('_', ' ')} | DoR: ${g.dor.total}/5`);
            if (g.recommendations.length > 0) {
                lines.push('**Recommendations:**');
                for (const rec of g.recommendations) {
                    lines.push(`- ${rec}`);
                }
            }
            if (g.dor.failedChecks.length > 0) {
                lines.push('**Failed DoR Checks:**');
                for (const fc of g.dor.failedChecks) {
                    lines.push(`- ❌ ${fc}`);
                }
            }
            lines.push('');
        }
    }

    if (warnings.length > 0) {
        lines.push('## ⚠️ Warnings');
        for (const w of warnings) {
            lines.push(`- ${w}`);
        }
        lines.push('');
    }

    lines.push('---');
    lines.push(`_Generated by AgentFarm Scrum Master Agent — ${new Date().toISOString().split('T')[0]}_`);

    return lines.join('\n');
}
