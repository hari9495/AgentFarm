/**
 * Business Analyst — Approval Gate
 *
 * Tiered risk reclassification engine.  Determines the effective `riskLevel`
 * to pass to `POST /v1/approvals/intake` based on:
 *
 *   1. Action type (draft vs. finalize vs. share)
 *   2. Document audience (internal | external | contractual)
 *   3. Completeness score from the BRD completeness checker
 *
 * Hard constraints (never overridden by completeness score):
 *   - `finalize_*` actions are always `high` — governance requires human sign-off
 *   - External or contractual documents are always `high`
 *   - `share_spec_external` is always `high`
 *
 * Soft promotions (completeness score can lower risk):
 *   - Internal process maps → base `low` (auto-execute by default)
 *   - Internal draft BRDs / user stories → base `medium`; promoted to `low`
 *     when completeness score ≥ `autoApproveThreshold` (default 0.85)
 *   - Internal informational updates → base `medium`; promoted to `low`
 *     when score ≥ threshold
 *
 * All exports are pure — no I/O, no LLM calls.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BaRiskLevel = 'low' | 'medium' | 'high';

/**
 * Who will read / receive this document or action.
 *
 * internal    → only people within the tenant boundary
 * external    → goes to clients, partners, or vendors
 * contractual → has legal or compliance implications (always high risk)
 */
export type DocumentAudience = 'internal' | 'external' | 'contractual';

/**
 * The type of BA document being acted on.  Used for tiered risk lookup.
 */
export type BaDocumentType =
    | 'process_map'          // Internal workflow diagram
    | 'user_story'           // Jira/Linear story with AC
    | 'draft_brd'            // Work-in-progress BRD
    | 'final_brd'            // Finalized BRD — governance gate
    | 'acceptance_criteria'  // Locked AC for a story
    | 'gap_analysis'         // Internal analysis
    | 'impact_analysis'      // Internal analysis
    | 'solution_eval'        // Vendor / approach evaluation
    | 'stakeholder_update'   // Communication to stakeholders
    | 'uat_checklist';       // User Acceptance Testing checklist

/**
 * Describes what level of human oversight a document type + audience combo
 * requires at its base (before completeness scoring is applied).
 */
export interface RiskTierEntry {
    baseRisk: BaRiskLevel;
    /**
     * When true, the base risk can be lowered to 'low' if the completeness
     * score meets or exceeds the auto-approve threshold.
     * Documents with baseRisk 'high' are never promotable.
     */
    promotable: boolean;
    /** Human-readable rationale for the base risk level. */
    rationale: string;
}

/** Fully qualified risk tier key: action type mapped to audience-specific risk. */
export type RiskTierMap = Record<
    BaDocumentType,
    Record<DocumentAudience, RiskTierEntry>
>;

// ---------------------------------------------------------------------------
// BA action type → document type mapping
// ---------------------------------------------------------------------------

/**
 * Maps the BA system-prompt action types to BaDocumentType values so the gate
 * can be called directly with the action_type from the task payload.
 */
export const ACTION_TYPE_TO_DOC_TYPE: Record<string, BaDocumentType> = {
    workspace_ba_draft_user_story: 'user_story',
    workspace_ba_draft_brd: 'draft_brd',
    workspace_ba_finalize_brd: 'final_brd',
    workspace_ba_finalize_acceptance_criteria: 'acceptance_criteria',
    workspace_ba_process_map: 'process_map',
    workspace_ba_gap_analysis: 'gap_analysis',
    workspace_ba_impact_analysis: 'impact_analysis',
    workspace_ba_solution_eval: 'solution_eval',
    workspace_ba_stakeholder_update: 'stakeholder_update',
    workspace_ba_uat_checklist: 'uat_checklist',
    share_spec_external: 'final_brd',    // External share always maps to highest-risk doc type
};

// ---------------------------------------------------------------------------
// Risk tier matrix
// ---------------------------------------------------------------------------

export const BA_RISK_TIERS: RiskTierMap = {
    process_map: {
        internal:     { baseRisk: 'low',    promotable: false, rationale: 'Internal workflow diagrams carry minimal risk — no external exposure, no code changes.' },
        external:     { baseRisk: 'high',   promotable: false, rationale: 'Sharing process maps externally reveals internal architecture; requires human review.' },
        contractual:  { baseRisk: 'high',   promotable: false, rationale: 'Contractual process maps have legal implications.' },
    },
    user_story: {
        internal:     { baseRisk: 'medium', promotable: true,  rationale: 'Internal stories can be auto-approved if all AC are present and complete.' },
        external:     { baseRisk: 'high',   promotable: false, rationale: 'Externally visible stories carry product commitment risk.' },
        contractual:  { baseRisk: 'high',   promotable: false, rationale: 'Contractual requirements lock scope.' },
    },
    draft_brd: {
        internal:     { baseRisk: 'medium', promotable: true,  rationale: 'Internal BRD drafts can skip approval when completeness is verified.' },
        external:     { baseRisk: 'high',   promotable: false, rationale: 'External BRDs expose internal requirements to clients or partners.' },
        contractual:  { baseRisk: 'high',   promotable: false, rationale: 'Contractual BRDs define scope with legal weight.' },
    },
    final_brd: {
        internal:     { baseRisk: 'high',   promotable: false, rationale: 'Finalizing a BRD locks scope for development — always requires human sign-off.' },
        external:     { baseRisk: 'high',   promotable: false, rationale: 'External finalized BRDs are binding documents.' },
        contractual:  { baseRisk: 'high',   promotable: false, rationale: 'Contractual BRDs have direct legal consequences.' },
    },
    acceptance_criteria: {
        internal:     { baseRisk: 'medium', promotable: true,  rationale: 'Internal AC can be auto-approved when all stories have complete criteria.' },
        external:     { baseRisk: 'high',   promotable: false, rationale: 'External AC define deliverable acceptance — client-facing.' },
        contractual:  { baseRisk: 'high',   promotable: false, rationale: 'Contractual AC form part of the acceptance agreement.' },
    },
    gap_analysis: {
        internal:     { baseRisk: 'low',    promotable: false, rationale: 'Internal gap analyses are analytical only — no external commitment.' },
        external:     { baseRisk: 'medium', promotable: true,  rationale: 'External gap analyses can reveal sensitive process information.' },
        contractual:  { baseRisk: 'high',   promotable: false, rationale: 'Contractual gap analyses carry scope implications.' },
    },
    impact_analysis: {
        internal:     { baseRisk: 'medium', promotable: true,  rationale: 'Internal impact analyses describe change scope — review recommended but can be auto-approved if complete.' },
        external:     { baseRisk: 'high',   promotable: false, rationale: 'External impact analyses disclose internal dependencies.' },
        contractual:  { baseRisk: 'high',   promotable: false, rationale: 'Contractual impacts affect scope and cost commitments.' },
    },
    solution_eval: {
        internal:     { baseRisk: 'low',    promotable: false, rationale: 'Solution evaluations are advisory — no binding commitment to a vendor or approach.' },
        external:     { baseRisk: 'medium', promotable: true,  rationale: 'External evaluations may imply vendor preference to partners.' },
        contractual:  { baseRisk: 'high',   promotable: false, rationale: 'Contractual solution choices bind the organisation.' },
    },
    stakeholder_update: {
        internal:     { baseRisk: 'low',    promotable: false, rationale: 'Internal status updates are low-risk communication.' },
        external:     { baseRisk: 'medium', promotable: true,  rationale: 'External stakeholder updates carry client communication risk; auto-approvable when complete.' },
        contractual:  { baseRisk: 'high',   promotable: false, rationale: 'Contractual stakeholder updates may imply project commitments.' },
    },
    uat_checklist: {
        internal:     { baseRisk: 'medium', promotable: true,  rationale: 'Internal UAT checklists can be auto-approved when all items are defined.' },
        external:     { baseRisk: 'high',   promotable: false, rationale: 'External UAT checklists are shared with clients and define acceptance gates.' },
        contractual:  { baseRisk: 'high',   promotable: false, rationale: 'Contractual UAT checklists define the formal acceptance process.' },
    },
};

// ---------------------------------------------------------------------------
// Risk classification
// ---------------------------------------------------------------------------

/**
 * Default auto-approve threshold — completeness score at or above this value
 * allows a 'medium' promotable action to be reclassified to 'low'.
 */
export const DEFAULT_AUTO_APPROVE_THRESHOLD = 0.85;

export interface RiskClassificationInput {
    actionType: string;
    audience: DocumentAudience;
    /**
     * Completeness score in [0, 1] from checkBrdCompleteness().
     * Pass 0 to always use the base risk (no auto-promotion).
     */
    completenessScore: number;
    /** Override for the auto-approve threshold. Defaults to 0.85. */
    autoApproveThreshold?: number;
}

export interface RiskClassificationResult {
    effectiveRisk: BaRiskLevel;
    baseRisk: BaRiskLevel;
    wasPromoted: boolean;
    rationale: string;
    promotable: boolean;
    documentType: BaDocumentType;
}

/**
 * Compute the effective risk level for a BA action.
 *
 * Called by the BA action handler before calling `POST /v1/approvals/intake`.
 * The returned `effectiveRisk` is what gets passed as `risk_level`.
 *
 * Hard constraints (always `high`, never overridden):
 *   - Any `finalize_*` action
 *   - Any action targeting an `external` or `contractual` audience with a
 *     non-promotable base risk
 *   - `share_spec_external`
 */
export function classifyBaActionRisk(
    input: RiskClassificationInput,
): RiskClassificationResult {
    const {
        actionType,
        audience,
        completenessScore,
        autoApproveThreshold = DEFAULT_AUTO_APPROVE_THRESHOLD,
    } = input;

    // Hard block: finalize actions always require human sign-off
    const isFinalizeAction =
        actionType.includes('finalize') || actionType === 'share_spec_external';

    if (isFinalizeAction) {
        const docType: BaDocumentType = ACTION_TYPE_TO_DOC_TYPE[actionType] ?? 'final_brd';
        return {
            effectiveRisk: 'high',
            baseRisk: 'high',
            wasPromoted: false,
            promotable: false,
            documentType: docType,
            rationale:
                'Finalizing a BRD or sharing a specification externally always requires ' +
                'human sign-off — this is a governance constraint, not a completeness question.',
        };
    }

    const docType: BaDocumentType = ACTION_TYPE_TO_DOC_TYPE[actionType] ?? 'draft_brd';
    const tierEntry = BA_RISK_TIERS[docType]?.[audience];

    if (!tierEntry) {
        // Unknown combination — default to medium (conservative)
        return {
            effectiveRisk: 'medium',
            baseRisk: 'medium',
            wasPromoted: false,
            promotable: false,
            documentType: docType,
            rationale: 'Unknown document type or audience combination — defaulting to medium risk.',
        };
    }

    const { baseRisk, promotable, rationale } = tierEntry;

    // Non-promotable: return base risk as-is
    if (!promotable || baseRisk === 'high' || baseRisk === 'low') {
        return {
            effectiveRisk: baseRisk,
            baseRisk,
            wasPromoted: false,
            promotable,
            documentType: docType,
            rationale,
        };
    }

    // Promotable medium risk: check completeness score
    const promoted = completenessScore >= autoApproveThreshold;
    return {
        effectiveRisk: promoted ? 'low' : 'medium',
        baseRisk,
        wasPromoted: promoted,
        promotable,
        documentType: docType,
        rationale: promoted
            ? `Document completeness score ${(completenessScore * 100).toFixed(0)}% ≥ threshold ${(autoApproveThreshold * 100).toFixed(0)}% — auto-approving draft stage. ${rationale}`
            : `Document completeness score ${(completenessScore * 100).toFixed(0)}% < threshold ${(autoApproveThreshold * 100).toFixed(0)}% — human approval required. ${rationale}`,
    };
}

// ---------------------------------------------------------------------------
// Convenience helpers
// ---------------------------------------------------------------------------

/**
 * Return true when the effective risk level means the action will execute
 * without a human approval gate.
 */
export function isAutoApproved(result: RiskClassificationResult): boolean {
    return result.effectiveRisk === 'low';
}

/**
 * Return true when the action requires async Slack/email notification
 * (medium risk) rather than a blocking wait (high risk is handled by the
 * existing escalation flow).
 */
export function requiresAsyncNotification(result: RiskClassificationResult): boolean {
    return result.effectiveRisk === 'medium';
}

/**
 * Build a human-readable one-line summary of the gate decision for logging
 * and Slack notification context.
 */
export function formatGateDecisionSummary(
    actionType: string,
    result: RiskClassificationResult,
): string {
    const promoted = result.wasPromoted ? ' (auto-approved by completeness check)' : '';
    const level = result.effectiveRisk.toUpperCase();
    return `[${level}${promoted}] ${actionType} → ${result.documentType} for ${result.rationale.split('—')[0].trim()}`;
}
