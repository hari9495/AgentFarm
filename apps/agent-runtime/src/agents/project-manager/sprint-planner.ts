/**
 * Sprint Planner
 *
 * Pure functions for generating Scrum sprint plans from a product backlog.
 * Handles capacity modelling, story allocation, dependency ordering, and
 * Definition of Done verification.
 *
 * No I/O — all external data is passed in; all output is a plain object.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BacklogItem {
    id: string;
    title: string;
    type: 'story' | 'bug' | 'task' | 'spike' | 'epic';
    /** Story points or effort estimate (0 if unknown). */
    points: number;
    priority: 'critical' | 'high' | 'medium' | 'low';
    /** IDs of items this story depends on. */
    dependsOn?: string[];
    /** Labels or tags used for assignment routing. */
    labels?: string[];
    /** Whether the story has acceptance criteria. */
    hasAcceptanceCriteria?: boolean;
    /** Whether the story has been groomed (sized and refined). */
    isGroomed?: boolean;
}

export interface TeamMember {
    name: string;
    capacity: number; // points available this sprint (adjusted for leave, meetings)
    skills?: string[];
}

export interface SprintPlanInput {
    sprintName: string;
    sprintGoal: string;
    sprintDuration: number; // calendar days
    team: TeamMember[];
    backlog: BacklogItem[];
    /** Historical velocity (average points per sprint). */
    historicalVelocity?: number;
    /** Default capacity buffer (0–1). Defaults to 0.8 (80% capacity). */
    capacityBuffer?: number;
}

export interface SprintAllocation {
    item: BacklogItem;
    assignedTo?: string;
    reason: string;
}

export interface SprintPlanResult {
    sprintName: string;
    sprintGoal: string;
    totalTeamCapacity: number;
    plannedCapacity: number;
    committedPoints: number;
    allocations: SprintAllocation[];
    /** Items not included in this sprint with reasons. */
    deferred: Array<{ item: BacklogItem; reason: string }>;
    /** Items that had unmet dependencies and were deferred. */
    blockedByDependency: Array<{ item: BacklogItem; blockedBy: string[] }>;
    /** Items missing grooming (no points or no AC) that should be refined. */
    needsGrooming: BacklogItem[];
    warnings: string[];
    /** Formatted markdown plan ready for posting to Jira/Slack/Confluence. */
    markdown: string;
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function totalCapacity(team: TeamMember[], buffer: number): number {
    return Math.floor(team.reduce((sum, m) => sum + m.capacity, 0) * buffer);
}

function isReady(item: BacklogItem, committedIds: Set<string>): boolean {
    if (!item.dependsOn || item.dependsOn.length === 0) return true;
    return item.dependsOn.every((dep) => committedIds.has(dep));
}

function findAssignee(item: BacklogItem, team: TeamMember[], remaining: Map<string, number>): string | undefined {
    const labels = item.labels ?? [];
    const candidates = team
        .filter((m) => {
            const rem = remaining.get(m.name) ?? 0;
            if (rem < item.points) return false;
            if (labels.length === 0) return true;
            return m.skills?.some((s) => labels.some((l) => l.toLowerCase().includes(s.toLowerCase())));
        })
        .sort((a, b) => (remaining.get(b.name) ?? 0) - (remaining.get(a.name) ?? 0));
    return candidates[0]?.name;
}

function priorityWeight(p: BacklogItem['priority']): number {
    return { critical: 4, high: 3, medium: 2, low: 1 }[p];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a sprint plan from a prioritised backlog and team capacity.
 *
 * Algorithm:
 *   1. Sort backlog by priority (critical → low), then by dependency order
 *   2. Filter out ungroomed items (no points / no AC) as needsGrooming
 *   3. Allocate items greedily until team capacity is exhausted
 *   4. Block items with unmet dependencies; defer them with explanation
 *   5. Return structured result + formatted markdown
 */
export function buildSprintPlan(input: SprintPlanInput): SprintPlanResult {
    const buffer = input.capacityBuffer ?? 0.8;
    const totalCap = totalCapacity(input.team, buffer);
    const usedVelocity = input.historicalVelocity ?? totalCap;
    const plannedCap = Math.min(totalCap, usedVelocity);

    const warnings: string[] = [];
    if (plannedCap < usedVelocity * 0.7) {
        warnings.push(`Team capacity (${totalCap}pts) is more than 30% below historical velocity (${usedVelocity}pts). Consider reducing sprint scope.`);
    }

    const needsGrooming: BacklogItem[] = [];
    const eligible: BacklogItem[] = [];

    for (const item of input.backlog) {
        const ungroomed = item.points === 0 || item.isGroomed === false;
        if (ungroomed) {
            needsGrooming.push(item);
        } else {
            eligible.push(item);
        }
    }

    // Sort by priority weight desc, then smaller stories first within same priority
    eligible.sort((a, b) => {
        const pw = priorityWeight(b.priority) - priorityWeight(a.priority);
        if (pw !== 0) return pw;
        return a.points - b.points;
    });

    const allocations: SprintAllocation[] = [];
    const deferred: Array<{ item: BacklogItem; reason: string }> = [];
    const blockedByDependency: Array<{ item: BacklogItem; blockedBy: string[] }> = [];
    const committedIds = new Set<string>();
    const memberRemaining = new Map<string, number>(
        input.team.map((m) => [m.name, Math.floor(m.capacity * buffer)])
    );
    let committedPoints = 0;

    for (const item of eligible) {
        if (committedPoints + item.points > plannedCap) {
            deferred.push({ item, reason: `Sprint capacity exhausted (${plannedCap}pts planned, ${committedPoints}pts committed)` });
            continue;
        }

        if (!isReady(item, committedIds)) {
            const unmet = (item.dependsOn ?? []).filter((dep) => !committedIds.has(dep));
            blockedByDependency.push({ item, blockedBy: unmet });
            deferred.push({ item, reason: `Blocked by unmet dependencies: ${unmet.join(', ')}` });
            continue;
        }

        const assignee = findAssignee(item, input.team, memberRemaining);
        if (!assignee && input.team.length > 0) {
            deferred.push({ item, reason: 'No team member with sufficient remaining capacity and matching skills' });
            continue;
        }

        if (assignee) {
            memberRemaining.set(assignee, (memberRemaining.get(assignee) ?? 0) - item.points);
        }
        committedPoints += item.points;
        committedIds.add(item.id);
        allocations.push({ item, assignedTo: assignee, reason: 'Fits capacity and priority order' });
    }

    if (needsGrooming.length > 0) {
        warnings.push(`${needsGrooming.length} backlog item(s) excluded — missing story points or acceptance criteria. Groom before next sprint.`);
    }

    const markdown = formatSprintPlanMarkdown({
        input,
        totalCap,
        plannedCap,
        committedPoints,
        allocations,
        deferred,
        blockedByDependency,
        needsGrooming,
        warnings,
    });

    return {
        sprintName: input.sprintName,
        sprintGoal: input.sprintGoal,
        totalTeamCapacity: totalCap,
        plannedCapacity: plannedCap,
        committedPoints,
        allocations,
        deferred,
        blockedByDependency,
        needsGrooming,
        warnings,
        markdown,
    };
}

function formatSprintPlanMarkdown(params: {
    input: SprintPlanInput;
    totalCap: number;
    plannedCap: number;
    committedPoints: number;
    allocations: SprintAllocation[];
    deferred: Array<{ item: BacklogItem; reason: string }>;
    blockedByDependency: Array<{ item: BacklogItem; blockedBy: string[] }>;
    needsGrooming: BacklogItem[];
    warnings: string[];
}): string {
    const { input, totalCap, plannedCap, committedPoints, allocations, deferred, blockedByDependency, needsGrooming, warnings } = params;
    const lines: string[] = [];

    lines.push(`# 🗓️ ${input.sprintName} — Sprint Plan`);
    lines.push('');
    lines.push(`**Sprint Goal:** ${input.sprintGoal}`);
    lines.push(`**Duration:** ${input.sprintDuration} days`);
    lines.push(`**Team Capacity:** ${totalCap}pts planned | **Committed:** ${committedPoints}pts`);
    lines.push('');

    lines.push('## ✅ Committed Stories');
    if (allocations.length === 0) {
        lines.push('_No items committed to this sprint._');
    } else {
        lines.push('| ID | Story | Points | Assignee | Priority |');
        lines.push('|---|---|---|---|---|');
        for (const a of allocations) {
            lines.push(`| ${a.item.id} | ${a.item.title} | ${a.item.points} | ${a.assignedTo ?? 'Unassigned'} | ${a.item.priority} |`);
        }
    }
    lines.push('');

    if (deferred.length > 0) {
        lines.push('## ⏭️ Deferred (Not in Sprint)');
        for (const d of deferred) {
            lines.push(`- **[${d.item.id}] ${d.item.title}** (${d.item.points}pts) — ${d.reason}`);
        }
        lines.push('');
    }

    if (blockedByDependency.length > 0) {
        lines.push('## 🚧 Dependency Blockers');
        for (const b of blockedByDependency) {
            lines.push(`- **[${b.item.id}]** blocked by: ${b.blockedBy.join(', ')}`);
        }
        lines.push('');
    }

    if (needsGrooming.length > 0) {
        lines.push('## 📋 Needs Grooming Before Next Sprint');
        for (const g of needsGrooming) {
            lines.push(`- [${g.id}] ${g.title}${g.points === 0 ? ' — no estimate' : ''}${!g.hasAcceptanceCriteria ? ' — no AC' : ''}`);
        }
        lines.push('');
    }

    if (warnings.length > 0) {
        lines.push('## ⚠️ Warnings');
        for (const w of warnings) {
            lines.push(`- ${w}`);
        }
        lines.push('');
    }

    lines.push('---');
    lines.push(`_Generated by AgentFarm PM Agent — ${new Date().toISOString().split('T')[0]}_`);

    return lines.join('\n');
}
