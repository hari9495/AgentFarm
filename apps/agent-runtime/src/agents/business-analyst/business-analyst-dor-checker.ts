/**
 * Business Analyst — Definition of Ready (DoR) Checker
 *
 * Validates whether a user story is ready to be pulled into a development sprint.
 * Mirrors the pattern of business-analyst-brd-completeness-checker.ts but applies
 * sprint-readiness criteria rather than BRD structural criteria.
 *
 * Blocker criteria (auto-approval is blocked until resolved):
 *   1. Story follows "As a [persona], I want [goal]" format
 *   2. Persona is named — not a generic "user" or "system"
 *   3. Acceptance criteria present with Given/When/Then structure
 *   4. No unresolved [TBD] / [TODO] markers
 *   5. Story is self-contained — no explicit blocking dependency clauses
 *
 * Warning criteria (advisory — story is sprint-ready but suboptimal):
 *   6. Benefit clause present ("so that …")
 *   7. At least one error / edge-case acceptance scenario
 *   8. Story points or size estimate mentioned
 *   9. Non-functional requirements noted for API/integration stories
 *
 * With callLlm, also checks for ambiguous language and hidden dependencies
 * that pattern-matching cannot detect.
 */

import type { BaProseCallerFn } from './business-analyst-tone-adapter.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DorCheckItem {
    criterion: string;
    passed: boolean;
    severity: 'blocker' | 'warning';
    detail?: string;
}

export interface DorCheckResult {
    /** True when no blockers are present — story may enter a sprint. */
    ready: boolean;
    /** 0.0–1.0 fraction of all criteria (blockers + warnings) that passed. */
    score: number;
    /** Must-fix items — story cannot enter a sprint until resolved. */
    blockers: string[];
    /** Should-fix items — story is sprint-ready but could be improved. */
    warnings: string[];
    /** Full checklist for display in dashboards or notifications. */
    checklist: DorCheckItem[];
}

// ---------------------------------------------------------------------------
// Heuristic checks
// ---------------------------------------------------------------------------

type HeuristicCheck = (text: string) => { passed: boolean; detail?: string };

const BLOCKER_CHECKS: Array<{ name: string; check: HeuristicCheck }> = [
    {
        name: 'Story format (As a … I want …)',
        check: (text) => {
            const hasAsA = /\bas\s+a\b/i.test(text);
            const hasIWant = /\bi\s+want\b/i.test(text);
            return {
                passed: hasAsA && hasIWant,
                detail: hasAsA && hasIWant
                    ? undefined
                    : 'Story does not follow the "As a [persona], I want [goal]" format.',
            };
        },
    },
    {
        name: 'Named persona (not generic "user")',
        check: (text) => {
            const match = text.match(/\bas\s+an?\s+([\w\s]{2,40}?)\s*,?\s*i\s+want/i);
            if (!match) return { passed: false, detail: 'Could not extract a persona from the story.' };
            const persona = match[1]?.trim() ?? '';
            const isGeneric = /^(user|a user|the user|system|the system|person|someone|customer|end user)$/i.test(persona);
            return {
                passed: !isGeneric,
                detail: isGeneric
                    ? `Persona "${persona}" is too generic. Use a named role (e.g. "warehouse manager", "procurement officer").`
                    : undefined,
            };
        },
    },
    {
        name: 'Acceptance criteria present (Given/When/Then)',
        check: (text) => {
            const lower = text.toLowerCase();
            const hasGwt = lower.includes('given') && lower.includes('when') && lower.includes('then');
            const hasAcHeader = /acceptance\s+criteria/i.test(text);
            return {
                passed: hasGwt || hasAcHeader,
                detail: hasGwt || hasAcHeader
                    ? undefined
                    : 'No acceptance criteria found. Add Given/When/Then scenarios or an "Acceptance Criteria" section.',
            };
        },
    },
    {
        name: 'No unresolved [TBD] / [TODO] markers',
        check: (text) => {
            const markers = text.match(/\[(?:TBD|TODO|TBC|FIXME|PLACEHOLDER)\]/gi) ?? [];
            return {
                passed: markers.length === 0,
                detail: markers.length > 0
                    ? `${markers.length} unresolved marker(s): ${[...new Set(markers)].join(', ')}. Resolve before pulling into a sprint.`
                    : undefined,
            };
        },
    },
    {
        name: 'Self-contained — no blocking dependency clauses',
        check: (text) => {
            const pattern =
                /\b(?:depends?\s+on|blocked\s+by|requires?\s+(?:story|ticket|issue|task)\s+[A-Z0-9-]+|after\s+(?:story|ticket)\s+[A-Z0-9-]+\s+(?:is\s+)?(?:done|complete|merged))\b/i;
            const m = text.match(pattern);
            return {
                passed: !m,
                detail: m
                    ? `Explicit blocking dependency found: "${m[0]}". Remove or split the story.`
                    : undefined,
            };
        },
    },
];

const WARNING_CHECKS: Array<{ name: string; check: HeuristicCheck }> = [
    {
        name: 'Benefit clause present ("so that …")',
        check: (text) => ({
            passed: /\bso\s+that\b/i.test(text),
            detail: /\bso\s+that\b/i.test(text)
                ? undefined
                : 'Missing "so that [benefit]" clause. Helps the team understand business value.',
        }),
    },
    {
        name: 'Error or edge-case acceptance scenario',
        check: (text) => {
            const lower = text.toLowerCase();
            const hasError =
                lower.includes('invalid') || lower.includes('error') ||
                lower.includes('fails') || lower.includes('not found') ||
                lower.includes('unauthori') || lower.includes('exceeds') ||
                lower.includes('empty') || lower.includes('missing') ||
                lower.includes('timeout');
            return {
                passed: hasError,
                detail: hasError ? undefined : 'No error or edge-case scenario in acceptance criteria. Add at least one failure path.',
            };
        },
    },
    {
        name: 'Story points or size estimate present',
        check: (text) => {
            const sized = /\b(\d+\s*(?:story\s+)?points?|SP\s*[:=]\s*\d+|size\s*[:=]\s*(?:XS|S|M|L|XL)|estimate\s*[:=]\s*\d+)\b/i.test(text);
            return {
                passed: sized,
                detail: sized ? undefined : 'No sizing found. Add story points before sprint planning.',
            };
        },
    },
    {
        name: 'NFRs noted for API/integration stories',
        check: (text) => {
            const isApi = /\b(?:api|endpoint|integration|service|webhook|sync|async|microservice)\b/i.test(text);
            if (!isApi) return { passed: true };
            const hasNfr = /\b(?:latency|response\s+time|timeout|throughput|rate\s+limit|sla|performance|retry|idempoten)\b/i.test(text);
            return {
                passed: hasNfr,
                detail: hasNfr
                    ? undefined
                    : 'API/integration story has no performance or SLA requirements. Add latency, timeout, or retry expectations.',
            };
        },
    },
];

// ---------------------------------------------------------------------------
// LLM ambiguity check
// ---------------------------------------------------------------------------

async function llmAmbiguityCheck(
    storyText: string,
    callLlm: BaProseCallerFn,
): Promise<{ ambiguousTerms: string[]; hiddenDependencies: string[] }> {
    try {
        const raw = await callLlm(
            'You are a senior business analyst reviewing a user story for sprint readiness. Return valid JSON only, no markdown.',
            `Review this user story and identify:
1. Ambiguous terms needing measurable criteria (e.g. "fast", "easy", "user-friendly", "simple")
2. Hidden dependencies not explicitly flagged as blockers

Story:
${storyText.slice(0, 1500)}

Respond with JSON only:
{"ambiguousTerms": ["term1"], "hiddenDependencies": ["dep1"]}`,
        );
        if (!raw.text) return { ambiguousTerms: [], hiddenDependencies: [] };
        const cleaned = raw.text.replace(/```json?\s*/gi, '').replace(/```\s*/g, '').trim();
        const parsed = JSON.parse(cleaned) as { ambiguousTerms?: unknown; hiddenDependencies?: unknown };
        return {
            ambiguousTerms: Array.isArray(parsed.ambiguousTerms) ? (parsed.ambiguousTerms as string[]).slice(0, 5) : [],
            hiddenDependencies: Array.isArray(parsed.hiddenDependencies) ? (parsed.hiddenDependencies as string[]).slice(0, 3) : [],
        };
    } catch {
        return { ambiguousTerms: [], hiddenDependencies: [] };
    }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check whether a single user story block is sprint-ready.
 *
 * `storyText` should contain one user story. For multi-story documents use
 * `checkDocumentReadiness()` which splits and checks each story individually.
 *
 * With `callLlm`, also checks for ambiguous language and hidden dependencies
 * that heuristics cannot detect.
 */
export async function checkStoryReadiness(
    storyText: string,
    callLlm?: BaProseCallerFn,
): Promise<DorCheckResult> {
    const checklist: DorCheckItem[] = [];

    for (const { name, check } of BLOCKER_CHECKS) {
        const { passed, detail } = check(storyText);
        checklist.push({ criterion: name, passed, severity: 'blocker', detail });
    }

    for (const { name, check } of WARNING_CHECKS) {
        const { passed, detail } = check(storyText);
        checklist.push({ criterion: name, passed, severity: 'warning', detail });
    }

    if (callLlm) {
        const { ambiguousTerms, hiddenDependencies } = await llmAmbiguityCheck(storyText, callLlm);
        checklist.push({
            criterion: 'No ambiguous terms (LLM)',
            passed: ambiguousTerms.length === 0,
            severity: 'warning',
            detail: ambiguousTerms.length > 0
                ? `Ambiguous terms needing measurable criteria: ${ambiguousTerms.join(', ')}.`
                : undefined,
        });
        checklist.push({
            criterion: 'No hidden dependencies (LLM)',
            passed: hiddenDependencies.length === 0,
            severity: 'warning',
            detail: hiddenDependencies.length > 0
                ? `Possible hidden dependencies: ${hiddenDependencies.join('; ')}.`
                : undefined,
        });
    }

    const passed = checklist.filter((c) => c.passed).length;
    const score = checklist.length > 0 ? passed / checklist.length : 0;
    const blockers = checklist.filter((c) => !c.passed && c.severity === 'blocker').map((c) => c.detail ?? c.criterion);
    const warnings = checklist.filter((c) => !c.passed && c.severity === 'warning').map((c) => c.detail ?? c.criterion);

    return { ready: blockers.length === 0, score, blockers, warnings, checklist };
}

/**
 * Check all user stories in a multi-story document.
 *
 * Splits on "As a" / story heading boundaries and checks each story
 * individually. Returns the aggregate result plus per-story details.
 */
export async function checkDocumentReadiness(
    documentText: string,
    callLlm?: BaProseCallerFn,
): Promise<{
    overallReady: boolean;
    storiesChecked: number;
    storiesReady: number;
    storyResults: DorCheckResult[];
    summary: string;
}> {
    const blocks = documentText
        .split(/(?=(?:\n|\r\n)(?:\d+\.\s+)?As\s+a\b|\n#{1,4}\s+.*[Ss]tory)/i)
        .map((b) => b.trim())
        .filter((b) => b.length > 50 && /\bas\s+a\b/i.test(b));

    const stories = blocks.length > 0 ? blocks : [documentText];
    const results = await Promise.all(stories.map((b) => checkStoryReadiness(b, callLlm)));
    const storiesReady = results.filter((r) => r.ready).length;

    return {
        overallReady: storiesReady === results.length,
        storiesChecked: results.length,
        storiesReady,
        storyResults: results,
        summary: formatDorSummary(results),
    };
}

/**
 * Format DoR results for Slack / email notification.
 */
export function formatDorSummary(results: DorCheckResult[]): string {
    const total = results.length;
    const ready = results.filter((r) => r.ready).length;

    if (ready === total) {
        return `✅ All ${total} user ${total === 1 ? 'story is' : 'stories are'} sprint-ready.`;
    }

    const lines: string[] = [
        `⚠️ *${total - ready} of ${total} user ${total === 1 ? 'story is' : 'stories are'} NOT sprint-ready.*`,
        '',
    ];

    results.forEach((r, i) => {
        if (!r.ready) {
            lines.push(`*Story ${i + 1}* — ${r.blockers.length} blocker(s), ${r.warnings.length} warning(s):`);
            r.blockers.forEach((b) => lines.push(`  🔴 ${b}`));
            r.warnings.forEach((w) => lines.push(`  🟡 ${w}`));
            lines.push('');
        }
    });

    return lines.join('\n');
}
