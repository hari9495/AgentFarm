/**
 * confidence-scorer.ts
 *
 * Evaluates whether an action is safe to auto-approve, bypassing the human
 * approval queue for medium-risk tasks when confidence is high and blast
 * radius is low.
 *
 * A human manager approves every action by default — but a good human
 * manager also delegates routine, low-risk work without micromanaging.
 * This scorer implements that judgement layer.
 *
 * SAFETY CONTRACT:
 * - High-risk actions (production deploys, permission changes, deletions)
 *   are NEVER auto-approved regardless of confidence.
 * - Auto-approval only fires for medium-risk actions with confidence ≥ 0.85.
 * - The scorer is an ADVISORY layer — it never overrides a hard policy block.
 *
 * Integration point: call scoreActionConfidence() inside processOneTask,
 * before the `if (result.status === 'approval_required')` block.
 * If autoApprove=true, downgrade route to 'execute' and log the reason.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Actions that are NEVER auto-approved.
 * Any action with destructive, irreversible, or wide blast-radius effects.
 */
export const NEVER_AUTO_APPROVE = new Set([
    'merge_pr',
    'git_push',                 // push to main/protected branch
    'deploy_production',
    'delete_resource',
    'delete_branch',
    'delete_file',
    'change_permissions',
    'run_pipeline',             // CI/CD pipeline — can deploy
    'workspace_bulk_refactor',  // wide blast radius
    'workspace_autonomous_plan_execute',  // open-ended execution
    'workspace_github_issue_fix',         // may push code
]);

/**
 * Actions that are safe to auto-approve when confidence is high.
 * Read-heavy, test-creation, and draft-stage actions are safe.
 */
const SAFE_FOR_AUTO_APPROVE = new Set([
    'run_tests',
    'workspace_generate_test',
    'workspace_fix_test_failures',
    'workspace_grep',
    'workspace_list_files',
    'workspace_read_file',
    'workspace_read_logs',
    'create_pr',               // draft PR — still needs human to merge
    'comment_issue',
    'create_issue',
    'code_read',
    'workspace_search_symbol',
    'workspace_security_scan', // read-only scan — no changes applied
    'workspace_sast_scan',
    'workspace_dependency_audit',
]);

/** Minimum confidence score for auto-approval of medium-risk actions. */
export const AUTO_APPROVE_CONFIDENCE_THRESHOLD = 0.85;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ActionConfidenceInput {
    actionType: string;
    riskLevel: 'low' | 'medium' | 'high';
    /** Confidence score 0-1 from the LLM decision. */
    confidence: number;
    /** True when the agent has episodic context for this workspace. */
    hasEpisodicContext: boolean;
}

export interface ConfidenceScoreResult {
    /** True when the action can be auto-approved (no human queue needed). */
    autoApprove: boolean;
    /** Human-readable reason for audit logging. */
    reason: string;
    /** The final confidence score used for the decision. */
    effectiveScore: number;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Score an action for auto-approval eligibility.
 *
 * @param input   Action classification + confidence from the LLM decision.
 * @returns       Whether to auto-approve and the audit reason.
 */
export function scoreActionConfidence(
    input: ActionConfidenceInput,
): ConfidenceScoreResult {
    const { actionType, riskLevel, confidence, hasEpisodicContext } = input;

    // Hard block: never auto-approve these actions
    if (NEVER_AUTO_APPROVE.has(actionType)) {
        return {
            autoApprove: false,
            reason: `Action '${actionType}' is in the never-auto-approve list.`,
            effectiveScore: confidence,
        };
    }

    // Hard block: high-risk actions always go to human queue
    if (riskLevel === 'high') {
        return {
            autoApprove: false,
            reason: `High-risk action '${actionType}' always requires human approval.`,
            effectiveScore: confidence,
        };
    }

    // Low-risk actions: auto-approve if confidence meets threshold
    if (riskLevel === 'low') {
        if (confidence >= AUTO_APPROVE_CONFIDENCE_THRESHOLD) {
            return {
                autoApprove: true,
                reason: `Low-risk action '${actionType}' with confidence ${confidence.toFixed(2)} — auto-approved.`,
                effectiveScore: confidence,
            };
        }
        return {
            autoApprove: false,
            reason: `Low-risk action '${actionType}' confidence ${confidence.toFixed(2)} is below threshold ${AUTO_APPROVE_CONFIDENCE_THRESHOLD}.`,
            effectiveScore: confidence,
        };
    }

    // Medium-risk actions: stricter gate
    // Must be in SAFE_FOR_AUTO_APPROVE list AND confidence ≥ threshold AND have episodic context
    if (riskLevel === 'medium') {
        if (!SAFE_FOR_AUTO_APPROVE.has(actionType)) {
            return {
                autoApprove: false,
                reason: `Medium-risk action '${actionType}' is not in the safe-for-auto-approve list.`,
                effectiveScore: confidence,
            };
        }

        // Bonus: if the agent has episodic context it knows this workspace — boost effective score
        const effectiveScore = hasEpisodicContext
            ? Math.min(1.0, confidence + 0.05)
            : confidence;

        if (effectiveScore >= AUTO_APPROVE_CONFIDENCE_THRESHOLD) {
            return {
                autoApprove: true,
                reason:
                    `Medium-risk action '${actionType}' with effective confidence ${effectiveScore.toFixed(2)}` +
                    (hasEpisodicContext ? ' (boosted by episodic context)' : '') +
                    ' — auto-approved.',
                effectiveScore,
            };
        }

        return {
            autoApprove: false,
            reason: `Medium-risk '${actionType}' effective confidence ${effectiveScore.toFixed(2)} below threshold.`,
            effectiveScore,
        };
    }

    // Fallback: require human approval
    return {
        autoApprove: false,
        reason: `Unknown risk level for '${actionType}' — defaulting to require approval.`,
        effectiveScore: confidence,
    };
}
