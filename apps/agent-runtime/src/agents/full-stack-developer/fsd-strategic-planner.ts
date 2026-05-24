// ============================================================================
// FSD STRATEGIC PLANNER
// Gap 2 — Self-directed long-horizon project execution
//
// Lets the FSD agent autonomously drive multi-week projects by maintaining
// a milestone-based roadmap.  The roadmap is persisted at
// `.agentfarm/roadmap.json` and updated via a cron-driven tick.
//
// Pure functions — no side-effects.
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MilestoneStatus = 'pending' | 'in_progress' | 'done' | 'blocked';

export interface RoadmapMilestone {
    id:            string;
    title:         string;
    description:   string;
    /** Ordered list of concrete tasks for this milestone */
    tasks:         string[];
    /** Tasks the agent has already completed */
    completedTasks: string[];
    status:        MilestoneStatus;
    /** ISO-8601 target date */
    targetDate:    string | null;
    /** ISO-8601 actual completion */
    completedAt:   string | null;
    /** Dependency milestone IDs — this milestone cannot start until all are done */
    dependsOn:     string[];
    /** Optional success metric (e.g. "unit test coverage ≥ 80%") */
    successMetric: string;
    notes:         string;
    createdAt:     string;
    updatedAt:     string;
}

export interface ProjectRoadmap {
    projectName:   string;
    goal:          string;
    milestones:    RoadmapMilestone[];
    /** ISO-8601 of the last autonomous tick */
    lastTickAt:    string | null;
    /** Number of autonomous ticks executed */
    tickCount:     number;
    createdAt:     string;
    updatedAt:     string;
}

export interface RoadmapTickResult {
    /** The milestone that was worked on this tick */
    activeMilestoneId: string | null;
    /** Task the agent focused on */
    focusedTask:       string | null;
    /** Actions the agent should take this tick */
    actionsToExecute:  string[];
    /** Short narrative for logging / memory */
    narrative:         string;
    /** Whether the active milestone is now done */
    milestoneCompleted: boolean;
}

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

export function createEmptyRoadmap(projectName: string, goal: string): ProjectRoadmap {
    return {
        projectName,
        goal,
        milestones:  [],
        lastTickAt:  null,
        tickCount:   0,
        createdAt:   new Date().toISOString(),
        updatedAt:   new Date().toISOString(),
    };
}

export function createMilestone(params: {
    id?:           string;
    title:         string;
    description:   string;
    tasks:         string[];
    targetDate?:   string;
    dependsOn?:    string[];
    successMetric?: string;
}): RoadmapMilestone {
    return {
        id:             params.id ?? `m-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        title:          params.title,
        description:    params.description,
        tasks:          params.tasks,
        completedTasks: [],
        status:         'pending',
        targetDate:     params.targetDate ?? null,
        completedAt:    null,
        dependsOn:      params.dependsOn ?? [],
        successMetric:  params.successMetric ?? '',
        notes:          '',
        createdAt:      new Date().toISOString(),
        updatedAt:      new Date().toISOString(),
    };
}

// ---------------------------------------------------------------------------
// Roadmap queries
// ---------------------------------------------------------------------------

/**
 * Returns the milestone that should be worked on next.
 * Priority: in_progress milestones first; then pending whose dependencies
 * are all done; then null if everything is done or blocked.
 * Pure function.
 */
export function selectNextMilestone(roadmap: ProjectRoadmap): RoadmapMilestone | null {
    const doneIds = new Set(
        roadmap.milestones.filter((m) => m.status === 'done').map((m) => m.id),
    );

    // Resume any in-progress milestone first
    const inProgress = roadmap.milestones.find((m) => m.status === 'in_progress');
    if (inProgress) return inProgress;

    // Pick the first pending milestone whose dependencies are all done
    return roadmap.milestones.find(
        (m) => m.status === 'pending' && m.dependsOn.every((dep) => doneIds.has(dep)),
    ) ?? null;
}

/**
 * Returns the next uncompleted task inside a milestone.
 * Pure function.
 */
export function selectNextTask(milestone: RoadmapMilestone): string | null {
    const done = new Set(milestone.completedTasks);
    return milestone.tasks.find((t) => !done.has(t)) ?? null;
}

/**
 * Returns true when all tasks in the milestone are completed.
 * Pure function.
 */
export function isMilestoneDone(milestone: RoadmapMilestone): boolean {
    const done = new Set(milestone.completedTasks);
    return milestone.tasks.length > 0 && milestone.tasks.every((t) => done.has(t));
}

// ---------------------------------------------------------------------------
// Roadmap mutations (pure — return new objects)
// ---------------------------------------------------------------------------

/**
 * Marks a task as completed inside a milestone and promotes milestone to
 * done if all tasks are done.
 * Pure function.
 */
export function updateMilestoneProgress(
    roadmap:     ProjectRoadmap,
    milestoneId: string,
    completedTask: string,
): ProjectRoadmap {
    const milestones = roadmap.milestones.map((m) => {
        if (m.id !== milestoneId) return m;

        const completedTasks = [...new Set([...m.completedTasks, completedTask])];
        const allDone = m.tasks.every((t) => completedTasks.includes(t));
        const now = new Date().toISOString();
        return {
            ...m,
            completedTasks,
            status:      allDone ? ('done' as MilestoneStatus) : ('in_progress' as MilestoneStatus),
            completedAt: allDone ? now : null,
            updatedAt:   now,
        };
    });
    return { ...roadmap, milestones, updatedAt: new Date().toISOString() };
}

/**
 * Sets a milestone's status (e.g. 'blocked' when a dependency cannot be met).
 * Pure function.
 */
export function setMilestoneStatus(
    roadmap:     ProjectRoadmap,
    milestoneId: string,
    status:      MilestoneStatus,
    notes?:      string,
): ProjectRoadmap {
    const milestones = roadmap.milestones.map((m) => {
        if (m.id !== milestoneId) return m;
        return {
            ...m,
            status,
            notes:     notes ?? m.notes,
            updatedAt: new Date().toISOString(),
        };
    });
    return { ...roadmap, milestones, updatedAt: new Date().toISOString() };
}

/**
 * Records a tick and returns the updated roadmap + tick result.
 * Pure function.
 */
export function computeTickResult(roadmap: ProjectRoadmap): {
    updatedRoadmap: ProjectRoadmap;
    tick:           RoadmapTickResult;
} {
    const milestone = selectNextMilestone(roadmap);

    if (!milestone) {
        return {
            updatedRoadmap: {
                ...roadmap,
                lastTickAt: new Date().toISOString(),
                tickCount:  roadmap.tickCount + 1,
                updatedAt:  new Date().toISOString(),
            },
            tick: {
                activeMilestoneId:  null,
                focusedTask:        null,
                actionsToExecute:   [],
                narrative:          'All milestones completed — roadmap is done.',
                milestoneCompleted: false,
            },
        };
    }

    const nextTask = selectNextTask(milestone);
    const actionsToExecute = nextTask ? [nextTask] : [];

    const updatedRoadmap: ProjectRoadmap = {
        ...roadmap,
        milestones: roadmap.milestones.map((m) =>
            m.id === milestone.id && m.status === 'pending'
                ? { ...m, status: 'in_progress' as MilestoneStatus, updatedAt: new Date().toISOString() }
                : m,
        ),
        lastTickAt: new Date().toISOString(),
        tickCount:  roadmap.tickCount + 1,
        updatedAt:  new Date().toISOString(),
    };

    return {
        updatedRoadmap,
        tick: {
            activeMilestoneId:  milestone.id,
            focusedTask:        nextTask,
            actionsToExecute,
            narrative: nextTask
                ? `Tick #${roadmap.tickCount + 1}: working on "${milestone.title}" → task: "${nextTask}"`
                : `Tick #${roadmap.tickCount + 1}: milestone "${milestone.title}" has no remaining tasks — marking done`,
            milestoneCompleted: isMilestoneDone(milestone),
        },
    };
}

// ---------------------------------------------------------------------------
// LLM helpers
// ---------------------------------------------------------------------------

/**
 * Builds the LLM prompt that synthesises a full roadmap from a goal.
 * Pure function.
 */
export function buildStrategicPlanPrompt(params: {
    projectName:      string;
    goal:             string;
    techStack?:       string;
    constraints?:     string;
    timeframeWeeks?:  number;
    existingRoadmap?: ProjectRoadmap;
}): string {
    const lines: string[] = [
        `You are a principal engineer planning a long-horizon software project.`,
        ``,
        `Project: ${params.projectName}`,
        `Goal: ${params.goal}`,
    ];

    if (params.techStack)      lines.push(`Tech stack: ${params.techStack}`);
    if (params.constraints)    lines.push(`Constraints: ${params.constraints}`);
    if (params.timeframeWeeks) lines.push(`Target timeframe: ${params.timeframeWeeks} weeks`);

    if (params.existingRoadmap && params.existingRoadmap.milestones.length > 0) {
        lines.push(``, `Existing milestones (update/extend, do not lose completed work):`);
        for (const m of params.existingRoadmap.milestones) {
            lines.push(`  [${m.status}] ${m.id}: ${m.title}`);
        }
    }

    lines.push(
        ``,
        `Return a JSON object with:`,
        `  goal       — string: one-sentence goal statement`,
        `  milestones — array (3–8) of:`,
        `    id             — string (e.g. "m-1")`,
        `    title          — string: short milestone name`,
        `    description    — string: what gets built/achieved`,
        `    tasks          — string[]: 3–7 concrete actionable tasks`,
        `    targetDate     — string | null: ISO-8601 date or null`,
        `    dependsOn      — string[]: IDs of prerequisite milestones`,
        `    successMetric  — string: measurable success criterion`,
        ``,
        `No markdown, no prose — valid JSON only.`,
    );

    return lines.join('\n');
}

/**
 * Parses LLM output into a ProjectRoadmap.  Falls back to empty roadmap on error.
 * Pure function.
 */
export function parseRoadmapFromLlm(
    raw:         string,
    projectName: string,
    goal:        string,
): ProjectRoadmap {
    const fallback = createEmptyRoadmap(projectName, goal);
    const cleaned  = raw.replace(/^```[a-z]*\n?/im, '').replace(/```\s*$/im, '').trim();
    const start    = cleaned.indexOf('{');
    const end      = cleaned.lastIndexOf('}');
    if (start === -1 || end === -1) return fallback;

    try {
        const parsed = JSON.parse(cleaned.slice(start, end + 1)) as {
            goal?:       string;
            milestones?: Array<{
                id?:           string;
                title?:        string;
                description?:  string;
                tasks?:        string[];
                targetDate?:   string | null;
                dependsOn?:    string[];
                successMetric?: string;
            }>;
        };

        const milestones: RoadmapMilestone[] = (parsed.milestones ?? [])
            .filter((m) => typeof m.title === 'string' && m.title.length > 0)
            .map((m, idx) => createMilestone({
                id:            m.id                             ?? `m-${idx + 1}`,
                title:         m.title                         ?? `Milestone ${idx + 1}`,
                description:   m.description                   ?? '',
                tasks:         Array.isArray(m.tasks)          ? m.tasks as string[] : [],
                targetDate:    typeof m.targetDate === 'string' ? m.targetDate         : undefined,
                dependsOn:     Array.isArray(m.dependsOn)      ? m.dependsOn as string[] : [],
                successMetric: m.successMetric                 ?? '',
            }));

        return {
            ...fallback,
            goal:       typeof parsed.goal === 'string' ? parsed.goal : goal,
            milestones,
        };
    } catch {
        return fallback;
    }
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

/**
 * Renders a roadmap as a compact summary for LLM system prompts / standup.
 * Pure function.
 */
export function formatRoadmapSummary(roadmap: ProjectRoadmap): string {
    const lines: string[] = [`[ROADMAP] ${roadmap.projectName}: ${roadmap.goal}`];

    const done    = roadmap.milestones.filter((m) => m.status === 'done').length;
    const total   = roadmap.milestones.length;
    lines.push(`Progress: ${done}/${total} milestones done | tick #${roadmap.tickCount}`);

    for (const m of roadmap.milestones) {
        const emoji = m.status === 'done' ? '✅' : m.status === 'in_progress' ? '🔄' : m.status === 'blocked' ? '🚫' : '⏳';
        const taskDone = m.completedTasks.length;
        const taskTotal = m.tasks.length;
        lines.push(`  ${emoji} [${m.id}] ${m.title} (${taskDone}/${taskTotal} tasks)`);
    }

    const next = selectNextMilestone(roadmap);
    if (next) {
        const t = selectNextTask(next);
        if (t) lines.push(`Next: "${t}" (in ${next.title})`);
    }

    return lines.join('\n');
}
