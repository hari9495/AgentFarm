// run-recovery-worker.test.ts
// Sprint 4 — F9: Crash Recovery service unit tests
// Recovery success-rate KPI: ≥ 95% of valid run IDs must recover successfully

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { assessRecovery, buildManifest } from '../lib/run-recovery-worker.js';

// ---------------------------------------------------------------------------
// assessRecovery — last_checkpoint strategy
// ---------------------------------------------------------------------------
describe('assessRecovery — last_checkpoint', () => {
    it('returns canResume=true with ckpt_ prefix resumePoint', () => {
        const result = assessRecovery('run-abc12345-xyz', 'last_checkpoint');
        assert.strictEqual(result.canResume, true);
        assert.ok(result.resumePoint.startsWith('ckpt_'));
        assert.strictEqual(result.estimatedLoss, 'minimal');
        assert.strictEqual(result.failureReason, undefined);
    });

    it('resumePoint includes first 8 chars of runId', () => {
        const result = assessRecovery('abcdefghXXX', 'last_checkpoint');
        assert.strictEqual(result.resumePoint, 'ckpt_abcdefgh');
    });
});

// ---------------------------------------------------------------------------
// assessRecovery — latest_state strategy
// ---------------------------------------------------------------------------
describe('assessRecovery — latest_state', () => {
    it('returns canResume=true with state_ prefix resumePoint', () => {
        const result = assessRecovery('run-xyz99999-abc', 'latest_state');
        assert.strictEqual(result.canResume, true);
        assert.ok(result.resumePoint.startsWith('state_'));
        assert.strictEqual(result.estimatedLoss, 'none');
    });

    it('resumePoint includes first 8 chars of runId', () => {
        const result = assessRecovery('12345678YYY', 'latest_state');
        assert.strictEqual(result.resumePoint, 'state_12345678');
    });
});

// ---------------------------------------------------------------------------
// assessRecovery — failure paths
// ---------------------------------------------------------------------------
describe('assessRecovery — failure paths', () => {
    it('returns canResume=false for empty runId', () => {
        const result = assessRecovery('', 'last_checkpoint');
        assert.strictEqual(result.canResume, false);
        assert.ok(result.failureReason);
    });

    it('returns canResume=false for unknown strategy', () => {
        // @ts-expect-error intentional invalid strategy for test
        const result = assessRecovery('run-abc123', 'unknown_strategy');
        assert.strictEqual(result.canResume, false);
        assert.ok(result.failureReason?.includes('unknown strategy'));
    });
});

// ---------------------------------------------------------------------------
// 95% recovery KPI — simulate 100 runs across both strategies
// ---------------------------------------------------------------------------
describe('recovery KPI ≥ 95% success rate', () => {
    it('100 valid runs across both strategies all succeed (100% ≥ 95%)', () => {
        const strategies = ['last_checkpoint', 'latest_state'] as const;
        let successes = 0;
        const total = 100;

        for (let i = 0; i < total; i++) {
            const strategy = strategies[i % 2];
            const runId = `run-kpi-${String(i).padStart(4, '0')}-test`;
            const result = assessRecovery(runId, strategy);
            if (result.canResume) successes++;
        }

        const rate = successes / total;
        assert.ok(
            rate >= 0.95,
            `Recovery success rate ${(rate * 100).toFixed(1)}% is below the 95% KPI threshold`,
        );
    });
});

// ---------------------------------------------------------------------------
// buildManifest
// ---------------------------------------------------------------------------
describe('buildManifest', () => {
    const baseOpts = {
        runId: 'run-manifest-test-001',
        workspaceId: 'ws-1',
        tenantId: 'tenant-1',
        includeScreenshots: true,
        includeDiffs: true,
        includeLogs: true,
        nowIso: '2026-05-01T00:00:00.000Z',
    };

    it('builds manifest with all flags enabled', () => {
        const manifest = buildManifest(baseOpts);
        assert.strictEqual(manifest.runId, baseOpts.runId);
        assert.strictEqual(manifest.workspaceId, baseOpts.workspaceId);
        assert.strictEqual(manifest.tenantId, baseOpts.tenantId);
        assert.strictEqual(manifest.includedLogs, true);
        assert.strictEqual(manifest.includedScreenshots, true);
        assert.strictEqual(manifest.includedDiffs, true);
        assert.strictEqual(manifest.includedActionTraces, true);
        assert.ok(manifest.logBundleRef);
        assert.ok(manifest.screenshotRefs.length > 0);
        assert.ok(manifest.diffRefs.length > 0);
        assert.ok(manifest.timeline.length >= 1);
    });

    it('omits log bundle ref when includeLogs=false', () => {
        const manifest = buildManifest({ ...baseOpts, includeLogs: false });
        assert.strictEqual(manifest.logBundleRef, undefined);
        assert.strictEqual(manifest.includedLogs, false);
    });

    it('omits screenshot refs when includeScreenshots=false', () => {
        const manifest = buildManifest({ ...baseOpts, includeScreenshots: false });
        assert.deepStrictEqual(manifest.screenshotRefs, []);
        assert.strictEqual(manifest.includedScreenshots, false);
    });

    it('omits diff refs when includeDiffs=false', () => {
        const manifest = buildManifest({ ...baseOpts, includeDiffs: false });
        assert.deepStrictEqual(manifest.diffRefs, []);
        assert.strictEqual(manifest.includedDiffs, false);
    });

    it('timeline contains at least the repro_pack_generated event', () => {
        const manifest = buildManifest(baseOpts);
        const generated = manifest.timeline.find((e) => e.event === 'repro_pack_generated');
        assert.ok(generated, 'missing repro_pack_generated timeline event');
        assert.strictEqual(generated.at, '2026-05-01T00:00:00.000Z');
    });
});
