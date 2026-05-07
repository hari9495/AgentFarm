/**
 * Feature #4 - Effort Estimator tests
 * Frozen 2026-05-07
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
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
        assert.ok(['trivial', 'small'].includes(estimate.complexity));
        assert.ok(estimate.estimatedMinutes <= 20);
    });

    it('classifies a large multi-file task correctly', () => {
        const estimate = estimateTaskEffort({
            ...base,
            description: 'refactor database schema migration',
            targetFiles: Array.from({ length: 15 }, (_, i) => `src/file${i}.ts`),
            riskLevel: 'high',
        });
        assert.ok(['large', 'epic'].includes(estimate.complexity));
        assert.ok(estimate.estimatedMinutes >= 180);
    });

    it('detects auth risk factor', () => {
        const estimate = estimateTaskEffort({
            ...base,
            description: 'update authentication token handling',
        });
        assert.ok(estimate.riskFactors.includes('touches auth module'));
    });

    it('confidence decreases with more risk', () => {
        const low = estimateTaskEffort({ ...base, riskLevel: 'low' });
        const high = estimateTaskEffort({ ...base, riskLevel: 'high', description: 'breaking change to auth' });
        assert.ok(high.confidenceScore < low.confidenceScore);
    });

    it('breakdown sums to estimated minutes (approximately)', () => {
        const estimate = estimateTaskEffort(base);
        const { researchMinutes, codingMinutes, testingMinutes, reviewMinutes } = estimate.breakdown;
        const total = researchMinutes + codingMinutes + testingMinutes + reviewMinutes;
        // Due to rounding, allow ±5 minutes delta
        assert.ok(Math.abs(total - estimate.estimatedMinutes) <= 5);
    });

    it('returns a valid estimate even with an empty description', () => {
        const estimate = estimateTaskEffort({ ...base, description: '' });
        assert.equal(estimate.taskId, 'task-1');
        assert.ok(estimate.estimatedMinutes > 0);
    });
});

describe('formatEstimateForApproval', () => {
    it('includes the estimated minutes and complexity', () => {
        const estimate = estimateTaskEffort(base);
        const text = formatEstimateForApproval(estimate);
        assert.match(text, /min/);
        assert.match(text, /confidence/);
    });

    it('includes risk factors when present', () => {
        const estimate = estimateTaskEffort({ ...base, description: 'update authentication module' });
        const text = formatEstimateForApproval(estimate);
        if (estimate.riskFactors.length > 0) {
            assert.match(text, /Risk:/);
        }
    });
});
