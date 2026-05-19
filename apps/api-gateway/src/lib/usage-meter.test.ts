/**
 * usage-meter.test.ts — Sprint 7: Billing Metering
 *
 * Tests for computeMeteringPeriodSummary():
 *   1. success — N successful tasks produce correct platformFeeUsd and billableTaskCount
 *   2. fallback — null platformFeeUsd sum falls back to successCount * PER_TASK_PLATFORM_FEE_USD
 *   3. zero tasks — empty period returns all zeros
 *   4. failed tasks only — billableTaskCount=0, platformFeeUsd=0
 */

import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { computeMeteringPeriodSummary } from './usage-meter.js';
import { PER_TASK_PLATFORM_FEE_USD } from '@agentfarm/shared-types';
import type { PrismaClient } from '@prisma/client';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TENANT_ID = 'tenant-meter-001';
const PERIOD_START = new Date('2026-05-01T00:00:00Z');
const PERIOD_END = new Date('2026-05-31T23:59:59Z');

/**
 * Build a minimal mock Prisma client whose taskExecutionRecord returns
 * the provided aggregate and count results.
 */
function makePrisma(opts: {
    count: number;
    sumEstimatedCostUsd: number | null;
    sumPlatformFeeUsd: number | null;
    successCount: number;
}): PrismaClient {
    return {
        taskExecutionRecord: {
            aggregate: async () => ({
                _count: { id: opts.count },
                _sum: {
                    estimatedCostUsd: opts.sumEstimatedCostUsd,
                    platformFeeUsd: opts.sumPlatformFeeUsd,
                },
            }),
            count: async () => opts.successCount,
        },
    } as unknown as PrismaClient;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('computeMeteringPeriodSummary', () => {
    test('calculates platform fee for successful tasks', async () => {
        const prisma = makePrisma({
            count: 5,
            sumEstimatedCostUsd: 0.0312,
            sumPlatformFeeUsd: 0.50,   // 5 * $0.10
            successCount: 5,
        });

        const summary = await computeMeteringPeriodSummary(prisma, TENANT_ID, PERIOD_START, PERIOD_END);

        assert.equal(summary.tenantId, TENANT_ID);
        assert.equal(summary.taskCount, 5);
        assert.equal(summary.billableTaskCount, 5);
        assert.equal(summary.platformFeeUsd, 0.50);
        assert.equal(summary.llmCostUsd, 0.0312);
        // totalChargeUsd = 0.50 + 0.0312 rounded to 4dp
        assert.equal(summary.totalChargeUsd, 0.5312);
    });

    test('falls back to successCount * PER_TASK_PLATFORM_FEE_USD when platformFeeUsd is null', async () => {
        // Pre-Sprint 7 rows have null platformFeeUsd
        const successCount = 3;
        const prisma = makePrisma({
            count: 4,
            sumEstimatedCostUsd: 0.02,
            sumPlatformFeeUsd: null,
            successCount,
        });

        const summary = await computeMeteringPeriodSummary(prisma, TENANT_ID, PERIOD_START, PERIOD_END);

        const expectedFee = successCount * PER_TASK_PLATFORM_FEE_USD;
        assert.equal(summary.platformFeeUsd, Math.round(expectedFee * 100) / 100);
        assert.equal(summary.billableTaskCount, successCount);
    });

    test('returns all zeros for an empty period', async () => {
        const prisma = makePrisma({
            count: 0,
            sumEstimatedCostUsd: null,
            sumPlatformFeeUsd: null,
            successCount: 0,
        });

        const summary = await computeMeteringPeriodSummary(prisma, TENANT_ID, PERIOD_START, PERIOD_END);

        assert.equal(summary.taskCount, 0);
        assert.equal(summary.billableTaskCount, 0);
        assert.equal(summary.platformFeeUsd, 0);
        assert.equal(summary.llmCostUsd, 0);
        assert.equal(summary.totalChargeUsd, 0);
    });

    test('does not charge platform fee for failed tasks', async () => {
        // All 3 tasks failed — successCount = 0
        const prisma = makePrisma({
            count: 3,
            sumEstimatedCostUsd: 0.015,
            sumPlatformFeeUsd: 0,       // persisted zero because none succeeded
            successCount: 0,
        });

        const summary = await computeMeteringPeriodSummary(prisma, TENANT_ID, PERIOD_START, PERIOD_END);

        assert.equal(summary.taskCount, 3);
        assert.equal(summary.billableTaskCount, 0);
        assert.equal(summary.platformFeeUsd, 0);
        assert.equal(summary.llmCostUsd, 0.015);
    });
});
