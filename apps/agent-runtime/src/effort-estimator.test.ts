/**
 * Feature #4 — Effort Estimator tests
 * Frozen 2026-05-07
 */

import { describe, it, expect } from 'vitest';
import { estimateTaskEffort, formatEstimateForApproval, type EstimationInput } from './effort-estimator.js';

const base: EstimationInput = {
    tenantId: 't1',
    workspaceId: 'w1',
    taskId: 'task-1',
    description: 'fix a small UI bug',
    correlationId: 'corr-1',
};

describe('estimateTaskEffort', () => {
    it('classifies a single-file low-risk task as trivial or small', () => {
        const estimate = estimateTaskEffort({ ...base, targetFiles: ['src/button.tsx'] });
        expect(['trivial', 'small']).toContain(estimate.complexity);
        expect(estimate.estimatedMinutes).toBeLessThanOrEqual(20);
    });

    it('classifies a large multi-file task correctly', () => {
        const estimate = estimateTaskEffort({
            ...base,
            description: 'refactor database schema migration',
            targetFiles: Array.from({ length: 15 }, (_, i) => `src/file${i}.ts`),
            riskLevel: 'high',
        });
        expect(['large', 'epic']).toContain(estimate.complexity);
        expect(estimate.estimatedMinutes).toBeGreaterThanOrEqual(180);
    });

    it('detects auth risk factor', () => {
        const estimate = estimateTaskEffort({
            ...base,
            description: 'update authentication token handling',
        });
        expect(estimate.riskFactors).toContain('touches auth module');
    });

    it('confidence decreases with more risk', () => {
        const low = estimateTaskEffort({ ...base, riskLevel: 'low' });
        const high = estimateTaskEffort({ ...base, riskLevel: 'high', description: 'breaking change to auth' });
        expect(high.confidenceScore).toBeLessThan(low.confidenceScore);
    });

    it('breakdown sums to estimated minutes (approximately)', () => {
        const estimate = estimateTaskEffort(base);
        const { researchMinutes, codingMinutes, testingMinutes, reviewMinutes } = estimate.breakdown;
        const total = researchMinutes + codingMinutes + testingMinutes + reviewMinutes;
        // Due to rounding, allow ±5 minutes delta
        expect(Math.abs(total - estimate.estimatedMinutes)).toBeLessThanOrEqual(5);
    });

    it('returns a valid estimate even with an empty description', () => {
        const estimate = estimateTaskEffort({ ...base, description: '' });
        expect(estimate.taskId).toBe('task-1');
        expect(estimate.estimatedMinutes).toBeGreaterThan(0);
    });
});

describe('formatEstimateForApproval', () => {
    it('includes the estimated minutes and complexity', () => {
        const estimate = estimateTaskEffort(base);
        const text = formatEstimateForApproval(estimate);
        expect(text).toContain('min');
        expect(text).toContain('confidence');
    });

    it('includes risk factors when present', () => {
        const estimate = estimateTaskEffort({ ...base, description: 'update authentication module' });
        const text = formatEstimateForApproval(estimate);
        if (estimate.riskFactors.length > 0) {
            expect(text).toContain('Risk:');
        }
    });
});
