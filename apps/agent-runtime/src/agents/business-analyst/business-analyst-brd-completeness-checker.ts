/**
 * Business Analyst — BRD Completeness Checker
 *
 * Scores a Business Requirements Document draft against a fixed checklist:
 *   1. All required sections are present (structural check — no LLM)
 *   2. Every user story has at least one acceptance criterion (heuristic)
 *   3. No open contradictions remain (LLM check — lightweight)
 *
 * The result feeds the approval gate: a draft whose completeness score exceeds
 * the configured threshold can be promoted from 'medium' risk to 'low' risk,
 * bypassing the human approval gate for the draft stage.
 *
 * Finalize actions are NEVER auto-approved regardless of score — that guard
 * lives in the approval gate (business-analyst-approval-gate.ts), not here.
 *
 * All exports are pure or use an injectable caller so the module is testable
 * without a live LLM endpoint.
 */

import type { BaProseCallerFn } from './business-analyst-tone-adapter.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The BRD sections that must be present for a draft to be considered complete. */
export const REQUIRED_BRD_SECTIONS = [
    'objectives',
    'scope',
    'requirements',
    'stakeholders',
    'success criteria',
] as const;

export type RequiredBrdSection = (typeof REQUIRED_BRD_SECTIONS)[number];

export interface SectionCheckResult {
    section: RequiredBrdSection;
    present: boolean;
    /** Confidence that the section is present (heuristic keyword match = 1.0; absent = 0.0). */
    confidence: number;
}

export interface UserStoryCoverageResult {
    /** Total user stories detected in the document. */
    totalStories: number;
    /** Stories that have at least one acceptance criterion. */
    storiesWithAc: number;
    /** Coverage ratio in [0, 1]. 1.0 when there are no stories (not applicable). */
    coverageRatio: number;
}

export interface ContradictionCheckResult {
    /** Whether the LLM found any open contradictions. */
    hasContradictions: boolean;
    /** Human-readable description of each contradiction found. */
    contradictions: string[];
    /** Skipped when body is too short or caller is unavailable. */
    skipped: boolean;
}

/** Full completeness check result for a single BRD draft. */
export interface BrdCompletenessResult {
    sectionChecks: SectionCheckResult[];
    userStoryCoverage: UserStoryCoverageResult;
    contradictionCheck: ContradictionCheckResult;
    /**
     * Weighted completeness score in [0, 1].
     * Weights: sections 50%, user-story coverage 30%, no-contradictions 20%.
     */
    score: number;
    /**
     * Human-readable list of what is missing or needs attention.
     * Empty when the document is fully complete.
     */
    gaps: string[];
    checkedAt: string;
}

// ---------------------------------------------------------------------------
// Section presence check (pure, no LLM)
// ---------------------------------------------------------------------------

/**
 * Keyword synonyms for each required section.
 * A section is considered present if any synonym appears in the lowercased text.
 */
const SECTION_SYNONYMS: Record<RequiredBrdSection, string[]> = {
    objectives: ['objective', 'goals', 'purpose', 'vision', 'mission'],
    scope: ['scope', 'in scope', 'out of scope', 'inclusions', 'exclusions', 'boundary'],
    requirements: [
        'requirement', 'functional requirement', 'non-functional requirement',
        'user story', 'use case', 'the system must', 'the system should',
    ],
    stakeholders: ['stakeholder', 'interested party', 'key person', 'sponsor', 'owner'],
    'success criteria': [
        'success criteria', 'kpi', 'key performance indicator',
        'acceptance criteria', 'definition of done', 'metric',
    ],
};

export function checkSectionPresence(brdText: string): SectionCheckResult[] {
    const lower = brdText.toLowerCase();
    return REQUIRED_BRD_SECTIONS.map((section) => {
        const synonyms = SECTION_SYNONYMS[section];
        const present = synonyms.some((kw) => lower.includes(kw));
        return { section, present, confidence: present ? 1.0 : 0.0 };
    });
}

// ---------------------------------------------------------------------------
// User story / acceptance criteria coverage check (pure, no LLM)
// ---------------------------------------------------------------------------

/**
 * Heuristic patterns that signal a user story line.
 * Matches "As a ...", "As an ...", or bullet lines starting with a user-story verb.
 */
const USER_STORY_PATTERN = /\bAs an?\b.+\bI want\b/gi;

/**
 * Heuristic patterns that signal acceptance criteria following a story.
 * Matches "Given/When/Then", "AC:", "Acceptance criteria", or "□" / "- [ ]" checkboxes.
 */
const ACCEPTANCE_CRITERIA_PATTERN =
    /\b(Given\b.+When\b|acceptance criteria|criteria:|AC:|given\/when\/then|\[ \]|□)/gi;

export function checkUserStoryCoverage(brdText: string): UserStoryCoverageResult {
    const stories = brdText.match(USER_STORY_PATTERN) ?? [];
    const totalStories = stories.length;

    if (totalStories === 0) {
        return { totalStories: 0, storiesWithAc: 0, coverageRatio: 1.0 };
    }

    const acMatches = brdText.match(ACCEPTANCE_CRITERIA_PATTERN) ?? [];
    // Assume each AC match covers at most one story — cap at total stories
    const storiesWithAc = Math.min(acMatches.length, totalStories);
    const coverageRatio = storiesWithAc / totalStories;

    return { totalStories, storiesWithAc, coverageRatio };
}

// ---------------------------------------------------------------------------
// Contradiction check (LLM)
// ---------------------------------------------------------------------------

const CONTRADICTION_SYSTEM_PROMPT =
    'You are a requirements reviewer checking a Business Requirements Document for contradictions. ' +
    'Identify any pairs of statements that directly conflict with each other — e.g. one section ' +
    'says the system must be offline-capable while another says it requires a live connection. ' +
    'Return ONLY valid JSON with this shape: ' +
    '{"hasContradictions": boolean, "contradictions": ["<description>", ...]}. ' +
    'Keep each contradiction description under 20 words. ' +
    'Return an empty contradictions array if there are none. No markdown, no explanation.';

export async function checkContradictions(
    brdText: string,
    caller: BaProseCallerFn,
): Promise<ContradictionCheckResult> {
    // Skip for very short documents (not worth an LLM call)
    if (brdText.trim().split(/\s+/).length < 50) {
        return { hasContradictions: false, contradictions: [], skipped: true };
    }

    // Truncate to avoid excessive token use
    const excerpt = brdText.slice(0, 6000);

    const result = await caller(
        CONTRADICTION_SYSTEM_PROMPT,
        `BRD excerpt:\n\n${excerpt}`,
    );

    if (!result.text) {
        return { hasContradictions: false, contradictions: [], skipped: true };
    }

    try {
        const cleaned = result.text
            .replace(/^```(?:json)?\s*/i, '')
            .replace(/\s*```\s*$/i, '')
            .trim();
        const parsed = JSON.parse(cleaned) as {
            hasContradictions?: boolean;
            contradictions?: string[];
        };

        return {
            hasContradictions: Boolean(parsed.hasContradictions),
            contradictions: Array.isArray(parsed.contradictions)
                ? parsed.contradictions.filter((c) => typeof c === 'string')
                : [],
            skipped: false,
        };
    } catch {
        return { hasContradictions: false, contradictions: [], skipped: true };
    }
}

// ---------------------------------------------------------------------------
// Score computation (pure)
// ---------------------------------------------------------------------------

const WEIGHTS = {
    sections: 0.5,
    userStoryCoverage: 0.3,
    noContradictions: 0.2,
} as const;

/**
 * Compute a weighted completeness score in [0, 1] from the three sub-checks.
 */
export function computeCompletenessScore(
    sectionChecks: SectionCheckResult[],
    userStoryCoverage: UserStoryCoverageResult,
    contradictionCheck: ContradictionCheckResult,
): number {
    const sectionScore =
        sectionChecks.length > 0
            ? sectionChecks.filter((s) => s.present).length / sectionChecks.length
            : 1.0;

    const coverageScore = userStoryCoverage.coverageRatio;

    const contradictionScore =
        contradictionCheck.skipped || !contradictionCheck.hasContradictions ? 1.0 : 0.0;

    return (
        sectionScore * WEIGHTS.sections +
        coverageScore * WEIGHTS.userStoryCoverage +
        contradictionScore * WEIGHTS.noContradictions
    );
}

// ---------------------------------------------------------------------------
// Gap list builder (pure)
// ---------------------------------------------------------------------------

export function buildGapList(
    sectionChecks: SectionCheckResult[],
    userStoryCoverage: UserStoryCoverageResult,
    contradictionCheck: ContradictionCheckResult,
): string[] {
    const gaps: string[] = [];

    for (const check of sectionChecks) {
        if (!check.present) {
            gaps.push(`Missing section: "${check.section}"`);
        }
    }

    if (
        userStoryCoverage.totalStories > 0 &&
        userStoryCoverage.storiesWithAc < userStoryCoverage.totalStories
    ) {
        const missing = userStoryCoverage.totalStories - userStoryCoverage.storiesWithAc;
        gaps.push(
            `${missing} of ${userStoryCoverage.totalStories} user ${missing === 1 ? 'story lacks' : 'stories lack'} acceptance criteria`,
        );
    }

    if (!contradictionCheck.skipped && contradictionCheck.hasContradictions) {
        for (const c of contradictionCheck.contradictions) {
            gaps.push(`Contradiction: ${c}`);
        }
    }

    return gaps;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Run all three completeness checks on a BRD draft and return the full result,
 * including the weighted score and a human-readable gap list.
 *
 * Pass `caller = null` to skip the LLM contradiction check (faster, lower cost).
 */
export async function checkBrdCompleteness(
    brdText: string,
    caller: BaProseCallerFn | null,
): Promise<BrdCompletenessResult> {
    const sectionChecks = checkSectionPresence(brdText);
    const userStoryCoverage = checkUserStoryCoverage(brdText);
    const contradictionCheck =
        caller !== null
            ? await checkContradictions(brdText, caller)
            : { hasContradictions: false, contradictions: [], skipped: true };

    const score = computeCompletenessScore(sectionChecks, userStoryCoverage, contradictionCheck);
    const gaps = buildGapList(sectionChecks, userStoryCoverage, contradictionCheck);

    return {
        sectionChecks,
        userStoryCoverage,
        contradictionCheck,
        score,
        gaps,
        checkedAt: new Date().toISOString(),
    };
}
