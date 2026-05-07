/**
 * Feature #4 — Task Effort Estimator
 * Frozen 2026-05-07
 *
 * Estimates task complexity and effort in minutes before execution starts.
 * Feeds two consumers:
 *   1. The approval UI — operators see "~45 min, touches 6 files" before approving.
 *   2. The LLM quality tracker — actual vs estimated time is a quality signal.
 *
 * Estimation model:
 *   - Uses heuristic rules on task payload fields (file count, risk level, complexity).
 *   - Looks up similarPastTaskIds from the task-intelligence-memory store.
 *   - Production upgrade path: replace heuristic with a lightweight LLM call.
 */

import { randomUUID } from 'node:crypto';
import type {
    EffortEstimate,
    TaskComplexity,
} from '@agentfarm/shared-types';
import { CONTRACT_VERSIONS } from '@agentfarm/shared-types';

export type { EffortEstimate, TaskComplexity };

// ── Heuristic constants ───────────────────────────────────────────────────────

const COMPLEXITY_MINUTES: Record<TaskComplexity, number> = {
    trivial: 5,
    small: 20,
    medium: 60,
    large: 180,
    epic: 480,
};

const COMPLEXITY_THRESHOLDS = [
    { maxFiles: 1, maxRiskScore: 0, complexity: 'trivial' as TaskComplexity },
    { maxFiles: 3, maxRiskScore: 1, complexity: 'small' as TaskComplexity },
    { maxFiles: 8, maxRiskScore: 2, complexity: 'medium' as TaskComplexity },
    { maxFiles: 20, maxRiskScore: 3, complexity: 'large' as TaskComplexity },
    { maxFiles: Infinity, maxRiskScore: Infinity, complexity: 'epic' as TaskComplexity },
];

// ── Risk factor detection ─────────────────────────────────────────────────────

const RISK_PATTERNS: Array<{ pattern: RegExp; factor: string; riskScore: number }> = [
    { pattern: /auth|permission|secret|token|password/i, factor: 'touches auth module', riskScore: 2 },
    { pattern: /no.+test|missing.+test|untested/i, factor: 'no existing tests', riskScore: 1 },
    { pattern: /database|migration|schema/i, factor: 'database migration', riskScore: 2 },
    { pattern: /production|deploy|release/i, factor: 'production deploy', riskScore: 2 },
    { pattern: /breaking.change|remove.+api/i, factor: 'breaking change', riskScore: 3 },
];

function detectRiskFactors(description: string): { factors: string[]; totalRiskScore: number } {
    const factors: string[] = [];
    let totalRiskScore = 0;
    for (const { pattern, factor, riskScore } of RISK_PATTERNS) {
        if (pattern.test(description)) {
            factors.push(factor);
            totalRiskScore += riskScore;
        }
    }
    return { factors, totalRiskScore };
}

// ── Complexity classifier ─────────────────────────────────────────────────────

function classifyComplexity(fileCount: number, riskScore: number): TaskComplexity {
    for (const threshold of COMPLEXITY_THRESHOLDS) {
        if (fileCount <= threshold.maxFiles && riskScore <= threshold.maxRiskScore) {
            return threshold.complexity;
        }
    }
    return 'epic';
}

// ── Breakdown calculator ──────────────────────────────────────────────────────

function buildBreakdown(complexity: TaskComplexity, hasTests: boolean): {
    researchMinutes: number;
    codingMinutes: number;
    testingMinutes: number;
    reviewMinutes: number;
} {
    const total = COMPLEXITY_MINUTES[complexity];
    const testingRatio = hasTests ? 0.3 : 0.15;
    const researchRatio = complexity === 'trivial' ? 0.05 : 0.15;

    return {
        researchMinutes: Math.round(total * researchRatio),
        codingMinutes: Math.round(total * 0.5),
        testingMinutes: Math.round(total * testingRatio),
        reviewMinutes: Math.round(total * (1 - 0.5 - testingRatio - researchRatio)),
    };
}

// ── Task input shape ──────────────────────────────────────────────────────────

export interface EstimationInput {
    tenantId: string;
    workspaceId: string;
    taskId: string;
    description: string;
    targetFiles?: string[];
    riskLevel?: 'low' | 'medium' | 'high';
    hasExistingTests?: boolean;
    similarPastTaskIds?: string[];
    correlationId: string;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Estimate the effort for a task before it begins.
 * Never throws — on unexpected errors it returns a 'medium' complexity fallback.
 */
export function estimateTaskEffort(input: EstimationInput): EffortEstimate {
    try {
        const fileCount = input.targetFiles?.length ?? 0;
        const { factors, totalRiskScore: detectedRiskScore } = detectRiskFactors(input.description);

        const riskBonus = input.riskLevel === 'high' ? 2 : input.riskLevel === 'medium' ? 1 : 0;
        const totalRiskScore = detectedRiskScore + riskBonus;

        const complexity = classifyComplexity(fileCount, totalRiskScore);
        const estimatedMinutes = COMPLEXITY_MINUTES[complexity];
        const breakdown = buildBreakdown(complexity, input.hasExistingTests ?? true);

        // Confidence is inversely proportional to risk and complexity
        const baseConfidence = 0.9;
        const confidenceScore = Math.max(
            0.3,
            baseConfidence - totalRiskScore * 0.08 - (fileCount > 10 ? 0.1 : 0),
        );

        return {
            id: randomUUID(),
            contractVersion: CONTRACT_VERSIONS.EFFORT_ESTIMATE,
            tenantId: input.tenantId,
            workspaceId: input.workspaceId,
            taskId: input.taskId,
            estimatedMinutes,
            confidenceScore: parseFloat(confidenceScore.toFixed(2)),
            complexity,
            breakdown,
            riskFactors: factors,
            similarPastTaskIds: input.similarPastTaskIds ?? [],
            estimatedAt: new Date().toISOString(),
            correlationId: input.correlationId,
        };
    } catch {
        // Fallback — estimation failure must never block task execution
        return {
            id: randomUUID(),
            contractVersion: CONTRACT_VERSIONS.EFFORT_ESTIMATE,
            tenantId: input.tenantId,
            workspaceId: input.workspaceId,
            taskId: input.taskId,
            estimatedMinutes: COMPLEXITY_MINUTES.medium,
            confidenceScore: 0.3,
            complexity: 'medium',
            breakdown: { researchMinutes: 9, codingMinutes: 30, testingMinutes: 12, reviewMinutes: 9 },
            riskFactors: [],
            similarPastTaskIds: [],
            estimatedAt: new Date().toISOString(),
            correlationId: input.correlationId,
        };
    }
}

/**
 * Format estimate for inclusion in an approval request summary.
 */
export function formatEstimateForApproval(estimate: EffortEstimate): string {
    const confidence = Math.round(estimate.confidenceScore * 100);
    const files = estimate.riskFactors.length > 0
        ? `Risk: ${estimate.riskFactors.join(', ')}. `
        : '';
    return (
        `Estimated effort: ~${estimate.estimatedMinutes} min ` +
        `(${estimate.complexity}, ${confidence}% confidence). ` +
        files
    ).trim();
}
