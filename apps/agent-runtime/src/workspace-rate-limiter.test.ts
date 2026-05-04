import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import { WorkspaceRateLimiter } from './workspace-rate-limiter.js';

describe('workspace-rate-limiter: WorkspaceRateLimiter', () => {
    let limiter: WorkspaceRateLimiter;

    beforeEach(() => {
        limiter = new WorkspaceRateLimiter(5, 60_000);
    });

    it('check returns allowed=true when under limit', () => {
        const result = limiter.check('ws1', 'analyze_code');
        assert.equal(result.allowed, true);
        assert.equal(result.consumed, 0);
        assert.equal(result.remaining, 5);
    });

    it('consume decrements remaining and records usage', () => {
        limiter.consume('ws1', 'analyze_code');
        limiter.consume('ws1', 'analyze_code');
        const result = limiter.check('ws1', 'analyze_code');
        assert.equal(result.consumed, 2);
        assert.equal(result.remaining, 3);
    });

    it('consume returns allowed=false after limit exceeded', () => {
        for (let i = 0; i < 5; i++) limiter.consume('ws1', 'run_tests');
        const result = limiter.consume('ws1', 'run_tests');
        assert.equal(result.allowed, false);
        assert.equal(result.remaining, 0);
    });

    it('different workspaces have independent limits', () => {
        for (let i = 0; i < 5; i++) limiter.consume('ws1', 'skill_a');
        const r1 = limiter.check('ws1', 'skill_a');
        const r2 = limiter.check('ws2', 'skill_a');
        assert.equal(r1.allowed, false);
        assert.equal(r2.allowed, true);
    });

    it('different skills have independent counters', () => {
        for (let i = 0; i < 5; i++) limiter.consume('ws1', 'skill_a');
        const result = limiter.check('ws1', 'skill_b');
        assert.equal(result.allowed, true);
    });

    it('resetWorkspace clears all usage for that workspace', () => {
        for (let i = 0; i < 5; i++) limiter.consume('ws1', 'skill_a');
        limiter.resetWorkspace('ws1');
        const result = limiter.check('ws1', 'skill_a');
        assert.equal(result.allowed, true);
        assert.equal(result.consumed, 0);
    });

    it('resetSkill clears only the given skill', () => {
        limiter.consume('ws1', 'skill_a');
        limiter.consume('ws1', 'skill_b');
        limiter.resetSkill('ws1', 'skill_a');
        assert.equal(limiter.check('ws1', 'skill_a').consumed, 0);
        assert.equal(limiter.check('ws1', 'skill_b').consumed, 1);
    });

    it('setSkillLimit applies custom limit', () => {
        limiter.setSkillLimit('heavy_skill', 2, 60_000);
        limiter.consume('ws1', 'heavy_skill');
        limiter.consume('ws1', 'heavy_skill');
        const result = limiter.consume('ws1', 'heavy_skill');
        assert.equal(result.allowed, false);
    });

    it('getUsage returns correct consumed count', () => {
        limiter.consume('ws1', 'skill_a');
        limiter.consume('ws1', 'skill_a');
        limiter.consume('ws1', 'skill_a');
        const usage = limiter.getUsage('ws1', 'skill_a');
        assert.equal(usage.consumed, 3);
        assert.equal(usage.limit, 5);
    });

    it('reset_at is in the future', () => {
        limiter.consume('ws1', 'skill_c');
        const result = limiter.check('ws1', 'skill_c');
        assert.ok(result.reset_at > Date.now());
    });
});
