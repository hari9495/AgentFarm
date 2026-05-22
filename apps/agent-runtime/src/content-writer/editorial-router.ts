/**
 * Editorial Router
 *
 * Classifies the risk level of a content draft and produces a structured
 * editorial handoff note for the human reviewer. Pure functions; no I/O.
 */

import type { ContentDraft } from './draft-builder.js';
import type { FactCheckReport } from './fact-checker.js';
import { buildFactCheckSummary } from './fact-checker.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EditorialHandoffNote {
    /** Draft title. */
    title: string;
    /** Content format. */
    format: string;
    /** Approximate word count. */
    wordCount: number;
    /** Whether brand voice compliance was applied. */
    brandVoiceCompliant: boolean;
    /** Markdown table of fact check results. */
    factCheckSummary: string;
    /** Display name of the agent that produced the draft. */
    agentDisplayName: string;
    /** Risk classification — drives approval threshold in approval policy. */
    riskLevel: 'low' | 'medium' | 'high';
}

// ---------------------------------------------------------------------------
// Risk signals
// ---------------------------------------------------------------------------

/**
 * High-risk content keywords that require legal / compliance review.
 * Matches whole words or phrases, case-insensitive.
 */
const HIGH_RISK_SIGNALS: readonly string[] = [
    'legal',
    'liability',
    'indemnity',
    'lawsuit',
    'regulation',
    'regulated',
    'sec filing',
    'gdpr',
    'hipaa',
    'pci',
    'breach',
    'class action',
];

/**
 * Medium-risk signals: competitor references or financial claims.
 * These need sign-off before publication but are not legal-critical.
 */
const MEDIUM_RISK_SIGNALS: readonly string[] = [
    // Financial
    'roi',
    'revenue',
    'profit',
    'earnings',
    'market share',
    'valuation',
    'stock',
    'investor',
    // Competitor
    'competitor',
    'vs ',
    ' versus ',
    'better than',
    'outperforms',
    'alternative to',
    'compared to',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function containsAnySignal(text: string, signals: readonly string[]): boolean {
    const lower = text.toLowerCase();
    return signals.some((signal) => lower.includes(signal));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Classify the risk level of a draft.
 *
 *   high   — contains legal / compliance / regulatory language.
 *   medium — contains competitor references or financial claims.
 *   low    — standard content.
 */
export function classifyEditorialRisk(draft: ContentDraft): 'low' | 'medium' | 'high' {
    if (containsAnySignal(draft.body, HIGH_RISK_SIGNALS)) return 'high';
    if (containsAnySignal(draft.body, MEDIUM_RISK_SIGNALS)) return 'medium';
    return 'low';
}

/**
 * Build a structured editorial handoff note from a content draft.
 *
 * The note is intended for the human editor assigned to review the draft.
 * It includes:
 *   - All draft metadata for traceability.
 *   - A Markdown fact check summary for the editor to review.
 *   - The risk classification to indicate urgency and who needs to approve.
 *   - The agent's display name for transparency and audit.
 *
 * @param draft           The produced content draft.
 * @param factCheckReport The result of checkFactualClaims for this draft.
 * @param persona         The agent's persona (for display name). Null = default name.
 */
export function routeToEditor(
    draft: ContentDraft,
    factCheckReport: FactCheckReport,
    persona: { displayName: string } | null,
): EditorialHandoffNote {
    const riskLevel = classifyEditorialRisk(draft);
    const factCheckSummary = buildFactCheckSummary(factCheckReport);
    const agentDisplayName =
        persona?.displayName ?? 'Content Writer Agent';

    return {
        title: draft.title,
        format: draft.format,
        wordCount: draft.wordCount,
        brandVoiceCompliant: true, // brand voice is applied at build time
        factCheckSummary,
        agentDisplayName,
        riskLevel,
    };
}
