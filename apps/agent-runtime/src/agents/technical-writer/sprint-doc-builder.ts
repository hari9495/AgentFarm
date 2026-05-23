// ============================================================================
// SPRINT DOC BUILDER
// Sprint 16 — Technical Writer Role
//
// Generates Agile ceremony documentation:
//   - Sprint review / demo notes
//   - Sprint retrospective templates
//   - User story documentation
//   - Acceptance criteria docs
//   - Sprint planning docs
//
// Pure functions — no connector calls, no LLM calls.
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SprintDocType =
    | 'review'
    | 'retrospective'
    | 'user_stories'
    | 'acceptance_criteria'
    | 'sprint_plan';

export interface UserStory {
    id: string;
    title: string;
    /** "As a <role>" */
    asA: string;
    /** "I want to <action>" */
    iWant: string;
    /** "So that <benefit>" */
    soThat: string;
    acceptanceCriteria: string[];
    /** Story points estimate */
    points?: number;
    /** Label: 'completed' | 'in-progress' | 'not-started' | 'carryover' */
    status?: string;
    /** Doc impact: which documentation sections are affected. */
    docImpact?: string[];
}

export interface SprintData {
    sprintNumber: number;
    teamName: string;
    startDate: string;
    endDate: string;
    goals: string[];
    velocity?: number;
    plannedPoints?: number;
    completedPoints?: number;
}

export interface RetroItem {
    category: 'went-well' | 'improve' | 'action';
    text: string;
    owner?: string;
}

// ---------------------------------------------------------------------------
// Sprint Review Doc
// ---------------------------------------------------------------------------

export function buildSprintReviewDoc(sprintData: SprintData, stories: UserStory[]): string {
    const completed = stories.filter((s) => s.status === 'completed');
    const carryover = stories.filter((s) => s.status === 'carryover' || s.status === 'not-started');
    const inProgress = stories.filter((s) => s.status === 'in-progress');
    const now = new Date().toISOString().split('T')[0];

    const lines: string[] = [];
    lines.push(`# Sprint ${sprintData.sprintNumber} Review — ${sprintData.teamName}`);
    lines.push(`\n**Period:** ${sprintData.startDate} → ${sprintData.endDate}  `);
    lines.push(`**Review date:** ${now}\n`);

    if (sprintData.goals.length > 0) {
        lines.push('## Sprint Goals\n');
        sprintData.goals.forEach((g, i) => lines.push(`${i + 1}. ${g}`));
        lines.push('');
    }

    if (sprintData.completedPoints !== undefined && sprintData.plannedPoints !== undefined) {
        const pct = Math.round((sprintData.completedPoints / sprintData.plannedPoints) * 100);
        lines.push('## Velocity Summary\n');
        lines.push(`| Metric | Value |`);
        lines.push(`|--------|-------|`);
        lines.push(`| Planned points | ${sprintData.plannedPoints} |`);
        lines.push(`| Completed points | ${sprintData.completedPoints} |`);
        lines.push(`| Completion rate | ${pct}% |`);
        if (sprintData.velocity) lines.push(`| Rolling velocity | ${sprintData.velocity} pts |`);
        lines.push('');
    }

    if (completed.length > 0) {
        lines.push(`## ✅ Completed (${completed.length} stories)\n`);
        for (const s of completed) {
            lines.push(formatStoryRow(s));
        }
        lines.push('');
    }

    if (inProgress.length > 0) {
        lines.push(`## 🔄 In Progress (${inProgress.length} stories)\n`);
        for (const s of inProgress) lines.push(formatStoryRow(s));
        lines.push('');
    }

    if (carryover.length > 0) {
        lines.push(`## ↩️ Carried Over (${carryover.length} stories)\n`);
        for (const s of carryover) lines.push(formatStoryRow(s));
        lines.push('');
    }

    // Documentation impact summary
    const docsAffected = new Set<string>();
    for (const s of completed) {
        (s.docImpact ?? []).forEach((d) => docsAffected.add(d));
    }
    if (docsAffected.size > 0) {
        lines.push('## 📝 Documentation Impact\n');
        lines.push('The following documentation sections require updates based on this sprint:\n');
        for (const doc of docsAffected) lines.push(`- [ ] ${doc}`);
        lines.push('');
    }

    return lines.join('\n');
}

function formatStoryRow(s: UserStory): string {
    const pts = s.points !== undefined ? ` _(${s.points} pts)_` : '';
    return `- **[${s.id}]** ${s.title}${pts}`;
}

// ---------------------------------------------------------------------------
// Sprint Retrospective Template
// ---------------------------------------------------------------------------

export function buildRetrospectiveTemplate(
    sprintData: SprintData,
    items: RetroItem[] = [],
): string {
    const now = new Date().toISOString().split('T')[0];
    const lines: string[] = [];

    lines.push(`# Sprint ${sprintData.sprintNumber} Retrospective — ${sprintData.teamName}`);
    lines.push(`\n**Date:** ${now}  `);
    lines.push(`**Sprint period:** ${sprintData.startDate} → ${sprintData.endDate}\n`);

    const wentWell = items.filter((i) => i.category === 'went-well');
    const improve = items.filter((i) => i.category === 'improve');
    const actions = items.filter((i) => i.category === 'action');

    lines.push('## 🟢 What Went Well\n');
    if (wentWell.length > 0) {
        for (const item of wentWell) lines.push(`- ${item.text}`);
    } else {
        lines.push('_[Add items — what the team wants to continue doing]_');
    }
    lines.push('');

    lines.push('## 🔴 What Could Be Improved\n');
    if (improve.length > 0) {
        for (const item of improve) lines.push(`- ${item.text}`);
    } else {
        lines.push('_[Add items — friction points or missed opportunities]_');
    }
    lines.push('');

    lines.push('## 🎯 Action Items\n');
    lines.push('| Action | Owner | Due |');
    lines.push('|--------|-------|-----|');
    if (actions.length > 0) {
        for (const item of actions) {
            lines.push(`| ${item.text} | ${item.owner ?? 'TBD'} | |`);
        }
    } else {
        lines.push('| _[Add action item]_ | _[Owner]_ | _[Date]_ |');
    }
    lines.push('');

    lines.push('## 📝 Documentation Actions\n');
    lines.push('| Doc Section | Status | Owner |');
    lines.push('|-------------|--------|-------|');
    lines.push('| _[Add doc section needing update]_ | To do | _[TW agent or name]_ |');
    lines.push('');

    return lines.join('\n');
}

// ---------------------------------------------------------------------------
// User Stories Doc
// ---------------------------------------------------------------------------

export function buildUserStoriesDoc(stories: UserStory[]): string {
    const now = new Date().toISOString().split('T')[0];
    const lines: string[] = [];

    lines.push('# User Stories');
    lines.push(`\n_Generated: ${now}_\n`);

    if (stories.length === 0) {
        lines.push('_No stories provided._');
        return lines.join('\n');
    }

    // Group by status if statuses are present, otherwise list flat
    const hasStatuses = stories.some((s) => s.status);
    if (hasStatuses) {
        const groups = new Map<string, UserStory[]>();
        for (const s of stories) {
            const key = s.status ?? 'unknown';
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key)!.push(s);
        }
        const order = ['completed', 'in-progress', 'not-started', 'carryover', 'unknown'];
        for (const status of order) {
            const group = groups.get(status);
            if (!group || group.length === 0) continue;
            lines.push(`## ${statusLabel(status)}\n`);
            for (const s of group) lines.push(formatFullStory(s));
        }
    } else {
        for (const s of stories) lines.push(formatFullStory(s));
    }

    return lines.join('\n');
}

function statusLabel(status: string): string {
    const map: Record<string, string> = {
        completed: '✅ Completed',
        'in-progress': '🔄 In Progress',
        'not-started': '📋 Not Started',
        carryover: '↩️ Carried Over',
    };
    return map[status] ?? status;
}

function formatFullStory(s: UserStory): string {
    const pts = s.points !== undefined ? ` — _${s.points} pts_` : '';
    const lines: string[] = [];
    lines.push(`### [${s.id}] ${s.title}${pts}\n`);
    lines.push(`**As a** ${s.asA},  `);
    lines.push(`**I want to** ${s.iWant},  `);
    lines.push(`**so that** ${s.soThat}.\n`);

    if (s.acceptanceCriteria.length > 0) {
        lines.push('**Acceptance Criteria:**\n');
        s.acceptanceCriteria.forEach((ac, i) => lines.push(`${i + 1}. ${ac}`));
        lines.push('');
    }

    if (s.docImpact && s.docImpact.length > 0) {
        lines.push(`**Doc impact:** ${s.docImpact.join(', ')}\n`);
    }

    return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Acceptance Criteria Doc
// ---------------------------------------------------------------------------

export function buildAcceptanceCriteriaDoc(stories: UserStory[]): string {
    const now = new Date().toISOString().split('T')[0];
    const lines: string[] = [];

    lines.push('# Acceptance Criteria Reference');
    lines.push(`\n_Generated: ${now}_\n`);
    lines.push('This document lists acceptance criteria for each story, suitable for QA reference and doc sign-off checklists.\n');

    for (const s of stories) {
        lines.push(`## [${s.id}] ${s.title}\n`);
        if (s.acceptanceCriteria.length === 0) {
            lines.push('_No acceptance criteria defined._\n');
            continue;
        }
        lines.push('| # | Criterion | Status |');
        lines.push('|---|-----------|--------|');
        s.acceptanceCriteria.forEach((ac, i) => {
            lines.push(`| ${i + 1} | ${ac} | ☐ |`);
        });
        lines.push('');
    }

    return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Sprint Plan Doc
// ---------------------------------------------------------------------------

export function buildSprintPlanDoc(sprintData: SprintData, plannedStories: UserStory[]): string {
    const lines: string[] = [];
    const totalPoints = plannedStories.reduce((sum, s) => sum + (s.points ?? 0), 0);

    lines.push(`# Sprint ${sprintData.sprintNumber} Plan — ${sprintData.teamName}`);
    lines.push(`\n**Period:** ${sprintData.startDate} → ${sprintData.endDate}  `);
    lines.push(`**Total planned points:** ${totalPoints}\n`);

    if (sprintData.goals.length > 0) {
        lines.push('## Sprint Goals\n');
        sprintData.goals.forEach((g, i) => lines.push(`${i + 1}. ${g}`));
        lines.push('');
    }

    lines.push('## Planned Stories\n');
    lines.push('| ID | Title | Points | Doc Impact |');
    lines.push('|----|-------|--------|------------|');

    for (const s of plannedStories) {
        const pts = s.points !== undefined ? String(s.points) : '–';
        const docImpact = s.docImpact && s.docImpact.length > 0 ? s.docImpact.join(', ') : '–';
        lines.push(`| ${s.id} | ${s.title} | ${pts} | ${docImpact} |`);
    }
    lines.push('');

    // Doc work items derived from planned stories
    const docWork = plannedStories.flatMap((s) => (s.docImpact ?? []).map((d) => ({ story: s.id, doc: d })));
    if (docWork.length > 0) {
        lines.push('## Documentation Work Items\n');
        lines.push('| Story | Doc Section | Status |');
        lines.push('|-------|-------------|--------|');
        for (const dw of docWork) lines.push(`| ${dw.story} | ${dw.doc} | To do |`);
        lines.push('');
    }

    return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

/**
 * Top-level dispatch: pick the right builder based on docType.
 */
export function buildSprintDoc(
    docType: SprintDocType,
    sprintData: SprintData,
    stories: UserStory[] = [],
    retroItems: RetroItem[] = [],
): string {
    switch (docType) {
        case 'review':             return buildSprintReviewDoc(sprintData, stories);
        case 'retrospective':      return buildRetrospectiveTemplate(sprintData, retroItems);
        case 'user_stories':       return buildUserStoriesDoc(stories);
        case 'acceptance_criteria': return buildAcceptanceCriteriaDoc(stories);
        case 'sprint_plan':        return buildSprintPlanDoc(sprintData, stories);
    }
}
