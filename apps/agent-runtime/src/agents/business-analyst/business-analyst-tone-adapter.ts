/**
 * Business Analyst — Stakeholder Tone Adapter
 *
 * Rewrites a BA deliverable body to match the communication style of the
 * target stakeholder.  Uses an injectable BaProseCallerFn so the module is
 * fully testable without a live LLM endpoint.
 *
 * Tone styles are BA-specific, mapping to stakeholder archetypes rather than
 * generic content tones.  The correct tone is selected via
 * detectBaStakeholderTone(), which reads the stored StakeholderProfile.
 *
 * Usage pattern (mirrors content-writer/tone-adapter.ts):
 *   const result = await adaptBaToneForStakeholder(body, profile, caller, {
 *     preserveStructure: true,
 *     documentType: 'acceptance_criteria',
 *   });
 */

import type { StakeholderProfile } from './business-analyst-stakeholder-profile.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Injectable LLM caller — mirrors the ProseCallerFn contract without
 * importing across agent boundaries.
 */
export type BaProseCallerFn = (
    systemPrompt: string,
    userPrompt: string,
) => Promise<{ text: string | null; tokensUsed?: number; error?: string }>;

/**
 * BA-specific tone styles, each mapped to a stakeholder archetype.
 *
 * executive    → C-suite / senior leadership: brief, impact-focused, no jargon
 * technical    → Engineers / architects: precise, mechanism-first, accepts jargon
 * operational  → Ops / team leads: step-by-step, process-oriented, actionable
 * external     → Clients / vendors: formal, polished, no internal references
 * collaborative → Product / design partners: open-ended, invites feedback
 * analytical   → Data analysts / PMs: evidence-first, structured, cites numbers
 */
export type BaStakeholderToneStyle =
    | 'executive'
    | 'technical'
    | 'operational'
    | 'external'
    | 'collaborative'
    | 'analytical';

export interface BaToneAdaptRequest {
    /** The BA document body to adapt (user story, BRD section, AC, etc.). */
    body: string;
    targetTone: BaStakeholderToneStyle;
    /**
     * When true, preserve all heading hierarchy and numbered lists;
     * only rewrite the prose between structural markers.
     */
    preserveStructure: boolean;
    /**
     * Optional hint about the document type — helps the LLM preserve
     * domain conventions (e.g. Given/When/Then in acceptance criteria).
     */
    documentType?: 'user_story' | 'brd' | 'acceptance_criteria' | 'gap_analysis' | 'process_map';
}

export interface BaToneAdaptResult {
    body: string;
    toneApplied: BaStakeholderToneStyle;
    tokensUsed: number;
    adaptedByLlm: boolean;
}

// ---------------------------------------------------------------------------
// Tone instruction map
// ---------------------------------------------------------------------------

const BA_TONE_INSTRUCTIONS: Record<BaStakeholderToneStyle, string> = {
    executive:
        'Rewrite for a senior executive audience. Lead with the business impact or decision required. ' +
        'Use 3–5 bullet points maximum. Eliminate technical jargon and implementation detail. ' +
        'End with a single clear ask or recommendation.',
    technical:
        'Rewrite for a technical audience (engineers or architects). Be precise about mechanisms, ' +
        'constraints, and data flows. Use correct domain terminology. Replace vague language — ' +
        '"fast" becomes a latency figure, "many" becomes a count, "secure" becomes specific controls.',
    operational:
        'Rewrite for an operational audience (team leads or ops managers). Use a step-by-step structure. ' +
        'Make every action item concrete and assignable. Include who does what and by when wherever ' +
        'possible. Favour numbered lists over paragraphs.',
    external:
        'Rewrite for an external audience (clients or vendors). Use formal, polished language. ' +
        'Remove internal acronyms, code names, and references to internal tooling. ' +
        "Frame benefits from the reader's perspective. Close with a professional next-step statement.",
    collaborative:
        'Rewrite in a collaborative tone for a product or design partner. Frame statements as proposals ' +
        'open to discussion ("We\'re proposing...", "One option could be..."). ' +
        'Invite feedback explicitly at the end. Use inclusive language ("we", "together").',
    analytical:
        'Rewrite for a data-driven or analytical audience. Lead with evidence and metrics. ' +
        'Cite sources or reference data points wherever available. ' +
        'Structure the content as hypothesis → evidence → conclusion. ' +
        'Avoid emotive or persuasive language — let the data speak.',
};

const DOCUMENT_TYPE_HINTS: Record<
    NonNullable<BaToneAdaptRequest['documentType']>,
    string
> = {
    user_story:
        'Preserve the "As a... I want... So that..." structure if present.',
    brd:
        'Preserve section headings (Objectives, Scope, Requirements, Assumptions, Constraints).',
    acceptance_criteria:
        'Preserve Given/When/Then structure if present. Do not merge or reorder individual criteria.',
    gap_analysis:
        'Preserve the current-state / future-state / gap / recommendation table structure.',
    process_map:
        'Preserve numbered steps and any swim-lane actor labels.',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildBaToneSystemPrompt(req: BaToneAdaptRequest): string {
    const instruction = BA_TONE_INSTRUCTIONS[req.targetTone];
    const structureNote = req.preserveStructure
        ? ' Keep all headings, lists, and structural elements exactly as they are. Only rewrite the prose between them.'
        : ' You may restructure paragraphs as needed to match the tone.';
    const docHint = req.documentType ? ` ${DOCUMENT_TYPE_HINTS[req.documentType]}` : '';
    return (
        `You are a Business Analyst communication specialist. ` +
        instruction +
        structureNote +
        docHint +
        ` Return only the rewritten content — no commentary, no preamble.`
    );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Adapt a BA document body to the target stakeholder tone using an LLM.
 *
 * Falls back to the original body (adaptedByLlm: false) on LLM failure,
 * so the caller can always proceed even if the LLM is unavailable.
 */
export async function adaptBaTone(
    req: BaToneAdaptRequest,
    caller: BaProseCallerFn,
): Promise<BaToneAdaptResult> {
    if (!req.body.trim()) {
        return { body: '', toneApplied: req.targetTone, tokensUsed: 0, adaptedByLlm: false };
    }

    const systemPrompt = buildBaToneSystemPrompt(req);
    const userPrompt = `Here is the BA content to adapt:\n\n${req.body}`;

    const result = await caller(systemPrompt, userPrompt);

    if (!result.text) {
        return {
            body: req.body,
            toneApplied: req.targetTone,
            tokensUsed: 0,
            adaptedByLlm: false,
        };
    }

    return {
        body: result.text,
        toneApplied: req.targetTone,
        tokensUsed: result.tokensUsed ?? 0,
        adaptedByLlm: true,
    };
}

/**
 * Determine the appropriate BA tone style from a stakeholder's stored profile.
 *
 * Mapping logic (in priority order):
 *  1. communicationStyle 'data-driven'  → 'analytical'
 *  2. communicationStyle 'formal'       → 'external'
 *  3. communicationStyle 'collaborative' → 'collaborative'
 *  4. decisionMakingStyle 'top-down' + communicationStyle 'direct' → 'executive'
 *  5. Role-keyword heuristics → 'technical' | 'operational' | 'executive' | 'external' | 'analytical' | 'collaborative'
 *  6. Default fallback → 'operational'
 */
export function detectBaStakeholderTone(profile: StakeholderProfile): BaStakeholderToneStyle {
    const { communicationStyle, decisionMakingStyle, role } = profile;

    if (communicationStyle === 'data-driven') return 'analytical';
    if (communicationStyle === 'formal') return 'external';
    if (communicationStyle === 'collaborative') return 'collaborative';
    if (decisionMakingStyle === 'top-down' && communicationStyle === 'direct') return 'executive';

    // Role-keyword heuristic (case-insensitive)
    const lowerRole = (role ?? '').toLowerCase();
    if (/engineer|architect|developer|technical|tech lead|devops/.test(lowerRole)) return 'technical';
    if (/cto|ceo|coo|vp|director|chief|head of/.test(lowerRole)) return 'executive';
    if (/client|vendor|partner|account|sales/.test(lowerRole)) return 'external';
    if (/analyst|data|bi|reporting/.test(lowerRole)) return 'analytical';
    if (/product|design|ux|researcher/.test(lowerRole)) return 'collaborative';
    if (/ops|operations|manager|team lead|scrum|delivery/.test(lowerRole)) return 'operational';

    return 'operational';
}

/**
 * Convenience wrapper: detect the correct tone from a profile and adapt the
 * content in one call.
 */
export async function adaptBaToneForStakeholder(
    body: string,
    profile: StakeholderProfile,
    caller: BaProseCallerFn,
    options?: {
        preserveStructure?: boolean;
        documentType?: BaToneAdaptRequest['documentType'];
    },
): Promise<BaToneAdaptResult> {
    const targetTone = detectBaStakeholderTone(profile);
    return adaptBaTone(
        {
            body,
            targetTone,
            preserveStructure: options?.preserveStructure ?? true,
            documentType: options?.documentType,
        },
        caller,
    );
}
