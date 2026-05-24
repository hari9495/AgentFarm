// ============================================================================
// FSD PROJECT CONTEXT
// Sprint 16 — Full-Stack Developer Role
//
// Persistent project memory for the full-stack developer agent.
// Stored as `.agentfarm/project-context.json` inside the workspace.
//
// The context is loaded at the start of every handleFsdAction call and
// injected into every LLM system prompt — so the agent always knows:
//   • The tech stack it's working in
//   • Architectural decisions that were already made
//   • The current sprint goal and blockers
//   • Open questions from previous spec analyses
//   • Org/team ownership and political context (Gap 3)
//   • Strategic roadmap milestones (Gap 2)
//
// How it updates:
//   workspace_fsd_project_context_sync  — full rescan (reads package.json,
//     README, ADR files, episodic memory; LLM synthesises into context)
//   workspace_fsd_org_context_sync      — syncs org profile from CODEOWNERS +
//     GitHub teams + Jira/Linear
//   workspace_fsd_strategic_plan        — creates/updates the roadmap
//   workspace_fsd_roadmap_tick          — advances the autonomous roadmap
//   workspace_fsd_arch_review           — appends new ADR as a key decision
//   workspace_fsd_scaffold_project      — sets the initial tech stack
//   workspace_fsd_standup_report        — updates current sprint state
//   workspace_fsd_clarify_spec          — records open questions
//
// Pure functions — no side-effects, easy to unit-test.
// ============================================================================

import type { OrgProfile } from './fsd-org-profile.js';
import type { ProjectRoadmap } from './fsd-strategic-planner.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProjectTechStack {
    frontend:       string[];   // ['react', 'typescript', 'tailwind']
    backend:        string[];   // ['node', 'express', 'prisma']
    database:       string[];   // ['postgresql', 'redis']
    infrastructure: string[];   // ['vercel', 'github-actions']
    testing:        string[];   // ['vitest', 'playwright']
}

export interface ProjectDecision {
    id:          string;
    title:       string;
    decision:    string;
    rationale:   string;
    recordedAt:  string;   // ISO-8601
    source:      'adr' | 'standup' | 'scaffold' | 'manual';
}

export interface ProjectSprint {
    goal:       string;
    inProgress: string[];
    completed:  string[];
    blockers:   string[];
    updatedAt:  string;   // ISO-8601
}

export interface ProjectContext {
    projectName:    string;
    description:    string;
    techStack:      ProjectTechStack;
    /** Most recent 10 architectural decisions */
    keyDecisions:   ProjectDecision[];
    currentSprint:  ProjectSprint | null;
    teamContext:    string;
    /** Unresolved questions from spec analyses */
    openQuestions:  string[];
    lastUpdatedAt:  string;
    contextVersion: number;
    /** Gap 3 — Org/political context (teams, ownership, frozen paths, mandates) */
    orgProfile?:    OrgProfile;
    /** Gap 2 — Strategic roadmap for long-horizon project execution */
    roadmap?:       ProjectRoadmap;
}

// ---------------------------------------------------------------------------
// createEmptyProjectContext
// ---------------------------------------------------------------------------

export function createEmptyProjectContext(name = 'Unnamed Project'): ProjectContext {
    return {
        projectName:    name,
        description:    '',
        techStack:      { frontend: [], backend: [], database: [], infrastructure: [], testing: [] },
        keyDecisions:   [],
        currentSprint:  null,
        teamContext:    '',
        openQuestions:  [],
        lastUpdatedAt:  new Date().toISOString(),
        contextVersion: 1,
    };
}

// ---------------------------------------------------------------------------
// formatContextForLlm
// ---------------------------------------------------------------------------

/**
 * Renders a ProjectContext as a compact, LLM-readable string injected into
 * system prompts. Keeps it tight — useful signal, no filler.
 * Pure function.
 */
export function formatContextForLlm(ctx: ProjectContext): string {
    const lines: string[] = ['[PROJECT CONTEXT]'];

    lines.push(ctx.description
        ? `Project: ${ctx.projectName} — ${ctx.description}`
        : `Project: ${ctx.projectName}`);

    // Tech stack — only non-empty tiers
    const stackParts: string[] = [];
    if (ctx.techStack.frontend.length       > 0) stackParts.push(`${ctx.techStack.frontend.join(', ')} (frontend)`);
    if (ctx.techStack.backend.length        > 0) stackParts.push(`${ctx.techStack.backend.join(', ')} (backend)`);
    if (ctx.techStack.database.length       > 0) stackParts.push(`${ctx.techStack.database.join(', ')} (database)`);
    if (ctx.techStack.infrastructure.length > 0) stackParts.push(`${ctx.techStack.infrastructure.join(', ')} (infra)`);
    if (ctx.techStack.testing.length        > 0) stackParts.push(`${ctx.techStack.testing.join(', ')} (testing)`);
    if (stackParts.length > 0) lines.push(`Stack: ${stackParts.join(' | ')}`);

    // Sprint
    if (ctx.currentSprint) {
        lines.push(`Sprint Goal: ${ctx.currentSprint.goal}`);
        if (ctx.currentSprint.inProgress.length > 0)
            lines.push(`In Progress: ${ctx.currentSprint.inProgress.slice(0, 4).join(', ')}`);
        if (ctx.currentSprint.blockers.length > 0)
            lines.push(`Blockers: ${ctx.currentSprint.blockers.slice(0, 3).join(', ')}`);
    }

    // Key decisions (most recent 5 to keep prompt size sane)
    const recent = ctx.keyDecisions.slice(-5);
    if (recent.length > 0) {
        lines.push('Key Decisions:');
        for (const d of recent) {
            const date = d.recordedAt.slice(0, 10);
            lines.push(`  • ${d.title}: ${d.decision.slice(0, 120)} (${date})`);
        }
    }

    // Open questions
    if (ctx.openQuestions.length > 0)
        lines.push(`Open Questions: ${ctx.openQuestions.slice(0, 3).join(' | ')}`);

    if (ctx.teamContext)
        lines.push(`Team: ${ctx.teamContext.slice(0, 150)}`);

    // Gap 3 — Org context inline block
    if (ctx.orgProfile) {
        lines.push(`Org: ${ctx.orgProfile.orgName}`);
        if (ctx.orgProfile.techMandates.length > 0)
            lines.push(`Tech mandates: ${ctx.orgProfile.techMandates.slice(0, 3).join(' | ')}`);
        if (ctx.orgProfile.frozenPaths.length > 0)
            lines.push(`Frozen paths: ${ctx.orgProfile.frozenPaths.slice(0, 3).join(', ')}`);
    }

    // Gap 2 — Roadmap summary
    if (ctx.roadmap) {
        const done  = ctx.roadmap.milestones.filter((m) => m.status === 'done').length;
        const total = ctx.roadmap.milestones.length;
        lines.push(`Roadmap: ${ctx.roadmap.goal} (${done}/${total} milestones done, tick #${ctx.roadmap.tickCount})`);
    }

    return lines.join('\n');
}

// ---------------------------------------------------------------------------
// mergeContextUpdate
// ---------------------------------------------------------------------------

/**
 * Non-destructively merges a partial update into an existing ProjectContext.
 * Tech stack arrays are deduplicated and unioned — never overwritten.
 * Pure function.
 */
export function mergeContextUpdate(
    existing: ProjectContext,
    update:   Partial<ProjectContext>,
): ProjectContext {
    return {
        ...existing,
        ...update,
        techStack: {
            frontend:       dedupe([...existing.techStack.frontend,       ...(update.techStack?.frontend       ?? [])]),
            backend:        dedupe([...existing.techStack.backend,        ...(update.techStack?.backend        ?? [])]),
            database:       dedupe([...existing.techStack.database,       ...(update.techStack?.database       ?? [])]),
            infrastructure: dedupe([...existing.techStack.infrastructure, ...(update.techStack?.infrastructure ?? [])]),
            testing:        dedupe([...existing.techStack.testing,        ...(update.techStack?.testing        ?? [])]),
        },
        keyDecisions:  pruneOldDecisions([...existing.keyDecisions, ...(update.keyDecisions ?? [])]),
        openQuestions: update.openQuestions ?? existing.openQuestions,
        lastUpdatedAt: new Date().toISOString(),
        contextVersion: existing.contextVersion,
    };
}

function dedupe(arr: string[]): string[] {
    return [...new Set(arr.map((s) => s.toLowerCase().trim()).filter(Boolean))];
}

// ---------------------------------------------------------------------------
// pruneOldDecisions
// ---------------------------------------------------------------------------

/**
 * Deduplicates by id and keeps only the most recent `max` decisions.
 * Pure function.
 */
export function pruneOldDecisions(
    decisions:  ProjectDecision[],
    max = 10,
): ProjectDecision[] {
    const seen    = new Set<string>();
    const unique  = decisions
        .slice()
        .reverse()
        .filter((d) => {
            if (seen.has(d.id)) return false;
            seen.add(d.id);
            return true;
        })
        .reverse();
    return unique.slice(-max);
}

// ---------------------------------------------------------------------------
// Domain-specific updaters
// ---------------------------------------------------------------------------

/**
 * Appends an ADR as a key architectural decision.
 * Pure function.
 */
export function updateContextFromAdr(
    ctx: ProjectContext,
    adr: { title: string; decision: string; rationale?: string },
): ProjectContext {
    const newDecision: ProjectDecision = {
        id:         `adr-${Date.now()}`,
        title:      adr.title,
        decision:   adr.decision.slice(0, 200),
        rationale:  (adr.rationale ?? '').slice(0, 200),
        recordedAt: new Date().toISOString(),
        source:     'adr',
    };
    return mergeContextUpdate(ctx, { keyDecisions: [...ctx.keyDecisions, newDecision] });
}

/**
 * Updates the sprint state from a standup report payload.
 * Pure function.
 */
export function updateContextFromStandup(
    ctx: ProjectContext,
    standup: {
        sprint_goal?: string;
        in_progress?: string[];
        completed?:   string[];
        blockers?:    string[];
    },
): ProjectContext {
    const newSprint: ProjectSprint = {
        goal:       standup.sprint_goal  ?? ctx.currentSprint?.goal       ?? '',
        inProgress: standup.in_progress  ?? ctx.currentSprint?.inProgress ?? [],
        completed:  standup.completed    ?? ctx.currentSprint?.completed   ?? [],
        blockers:   standup.blockers     ?? ctx.currentSprint?.blockers    ?? [],
        updatedAt:  new Date().toISOString(),
    };
    return { ...ctx, currentSprint: newSprint, lastUpdatedAt: new Date().toISOString() };
}

/**
 * Sets the tech stack from a scaffold_project result.
 * Pure function.
 */
export function updateContextFromScaffold(
    ctx: ProjectContext,
    scaffold: {
        project_name?:      string;
        framework?:         string;
        backend_framework?: string;
        state_lib?:         string;
        auth_strategy?:     string;
        database?:          string;
        styling?:           string;
        testing_framework?: string;
        deploy_target?:     string;
    },
): ProjectContext {
    const techPatch: Partial<ProjectTechStack> = {};

    const fe = [scaffold.framework, scaffold.styling].filter(Boolean) as string[];
    const be = [scaffold.backend_framework, scaffold.state_lib, scaffold.auth_strategy].filter(Boolean) as string[];
    const db = scaffold.database ? [scaffold.database] : [];
    const infra = scaffold.deploy_target ? [scaffold.deploy_target] : [];
    const test  = scaffold.testing_framework ? [scaffold.testing_framework] : [];

    if (fe.length > 0)    techPatch.frontend       = fe;
    if (be.length > 0)    techPatch.backend         = be;
    if (db.length > 0)    techPatch.database        = db;
    if (infra.length > 0) techPatch.infrastructure  = infra;
    if (test.length > 0)  techPatch.testing         = test;

    return mergeContextUpdate(ctx, {
        ...(scaffold.project_name ? { projectName: scaffold.project_name } : {}),
        ...(Object.keys(techPatch).length > 0 ? { techStack: { ...ctx.techStack, ...techPatch } } : {}),
    });
}

/**
 * Records open questions from a spec clarification analysis.
 * Pure function.
 */
export function updateContextFromSpec(
    ctx: ProjectContext,
    questions: Array<{ question?: string; text?: string }>,
): ProjectContext {
    const newQuestions = questions
        .map((q) => (typeof q.question === 'string' ? q.question : typeof q.text === 'string' ? q.text : ''))
        .filter((q) => q.length > 0);
    if (newQuestions.length === 0) return ctx;
    return {
        ...ctx,
        openQuestions: dedupe([...ctx.openQuestions, ...newQuestions]).slice(0, 10),
        lastUpdatedAt: new Date().toISOString(),
    };
}

// ---------------------------------------------------------------------------
// LLM sync helpers
// ---------------------------------------------------------------------------

/**
 * Builds the LLM prompt to synthesise a ProjectContext from raw workspace files.
 * Pure function.
 */
export function buildContextSyncPrompt(fileContents: {
    packageJson?: string;
    readme?:      string;
    adrFiles?:    string[];
    recentTasks?: string;
}): string {
    const parts: string[] = [
        'You are analysing a software project workspace to build a concise, accurate context snapshot.',
        'Extract factual information only — do not invent details not present in the files.',
        '',
    ];

    if (fileContents.packageJson) {
        parts.push('## package.json', '```json', fileContents.packageJson.slice(0, 2000), '```', '');
    }
    if (fileContents.readme) {
        parts.push('## README.md', '```', fileContents.readme.slice(0, 3000), '```', '');
    }
    if (fileContents.adrFiles && fileContents.adrFiles.length > 0) {
        parts.push('## Architecture Decision Records');
        for (const adr of fileContents.adrFiles.slice(0, 5)) {
            parts.push('```', adr.slice(0, 1000), '```');
        }
        parts.push('');
    }
    if (fileContents.recentTasks) {
        parts.push('## Recent agent activity', fileContents.recentTasks, '');
    }

    parts.push(
        'Return a JSON object with ONLY the fields you have actual data for:',
        '  projectName      — string: project name',
        '  description      — string: one-sentence project description',
        '  techStack        — object: { frontend: string[], backend: string[], database: string[], infrastructure: string[], testing: string[] }',
        '  keyDecisions     — array (max 10): { id, title, decision, rationale, recordedAt, source }',
        '  teamContext      — string: team conventions or structure notes',
        '  openQuestions    — string[]: unresolved questions from specs or ADRs',
        '',
        'Rules: no markdown fences, no prose outside the JSON, valid JSON only.',
    );

    return parts.join('\n');
}

/**
 * Parses the LLM synthesis response into a ProjectContext, merging with
 * `existing` so no prior context is lost on a bad parse.
 * Pure function.
 */
export function parseContextFromLlm(raw: string, existing: ProjectContext): ProjectContext {
    const cleaned = raw.replace(/^```[a-z]*\n?/im, '').replace(/```\s*$/im, '').trim();
    const start   = cleaned.indexOf('{');
    const end     = cleaned.lastIndexOf('}');

    if (start === -1 || end === -1) return existing;

    try {
        const parsed = JSON.parse(cleaned.slice(start, end + 1)) as Partial<ProjectContext>;
        return mergeContextUpdate(existing, parsed);
    } catch {
        return existing;
    }
}
