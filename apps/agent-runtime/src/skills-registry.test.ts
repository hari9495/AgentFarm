import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SkillsRegistry } from './skills-registry.js';

const BASE = { tenantId: 't1', workspaceId: 'ws1' };

function registry() {
    return new SkillsRegistry();
}

// ── crystallize ───────────────────────────────────────────────────────────────

describe('SkillsRegistry.crystallize', () => {
    it('creates a draft SkillRecord from a run', () => {
        const reg = registry();
        const { skill } = reg.crystallize({
            ...BASE,
            runId: 'run-1',
            wakeSource: 'schedule',
            actionTypes: ['file_read', 'shell_exec'],
        });
        assert.equal(skill.status, 'draft');
        assert.equal(skill.trigger, 'auto_crystallized');
        assert.equal(skill.stepCount, 2);
        assert.equal(skill.successCount, 1);
        assert.equal(skill.useCount, 0);
        assert.equal(skill.sourceRunId, 'run-1');
        assert.equal(skill.tenantId, 't1');
        assert.equal(skill.workspaceId, 'ws1');
        assert.equal(reg.size, 1);
    });

    it('creates a SkillCrystallisationRecord linked to the skill', () => {
        const reg = registry();
        const { skill, crystallisationRecord } = reg.crystallize({
            ...BASE,
            runId: 'run-2',
            wakeSource: 'push',
            actionTypes: ['git_commit'],
        });
        assert.equal(crystallisationRecord.skillId, skill.id);
        assert.equal(crystallisationRecord.runId, 'run-2');
        assert.equal(crystallisationRecord.tenantId, 't1');
        assert.equal(crystallisationRecord.trajectoryCompressed, false);
    });

    it('includes contextTags in inputPattern when provided', () => {
        const reg = registry();
        const { skill } = reg.crystallize({
            ...BASE,
            runId: 'run-3',
            wakeSource: 'manual',
            actionTypes: ['api_call'],
            contextTags: ['onboarding', 'tenant-setup'],
        });
        assert.deepEqual(skill.inputPattern['contextTags'], ['onboarding', 'tenant-setup']);
    });
});

// ── setStatus ─────────────────────────────────────────────────────────────────

describe('SkillsRegistry.setStatus', () => {
    it('promotes draft → active', () => {
        const reg = registry();
        const { skill } = reg.crystallize({ ...BASE, runId: 'r', wakeSource: 's', actionTypes: [] });
        const updated = reg.setStatus(skill.id, 'active');
        assert.equal(updated.status, 'active');
    });

    it('deprecates an active skill', () => {
        const reg = registry();
        const { skill } = reg.crystallize({ ...BASE, runId: 'r', wakeSource: 's', actionTypes: [] });
        reg.setStatus(skill.id, 'active');
        const deprecated = reg.setStatus(skill.id, 'deprecated');
        assert.equal(deprecated.status, 'deprecated');
    });

    it('throws when skill id is unknown', () => {
        const reg = registry();
        assert.throws(() => reg.setStatus('non-existent-id', 'active'), /not found/);
    });
});

// ── recordUse ─────────────────────────────────────────────────────────────────

describe('SkillsRegistry.recordUse', () => {
    it('increments useCount on each invocation', () => {
        const reg = registry();
        const { skill } = reg.crystallize({ ...BASE, runId: 'r', wakeSource: 's', actionTypes: [] });
        reg.recordUse(skill.id);
        const after2 = reg.recordUse(skill.id);
        assert.equal(after2.useCount, 2);
    });
});

// ── listActive ────────────────────────────────────────────────────────────────

describe('SkillsRegistry.listActive', () => {
    it('only returns active skills for the given workspace', () => {
        const reg = registry();
        const { skill: s1 } = reg.crystallize({ ...BASE, runId: 'r1', wakeSource: 's', actionTypes: [] });
        const { skill: s2 } = reg.crystallize({ ...BASE, runId: 'r2', wakeSource: 's', actionTypes: [] });
        reg.crystallize({ tenantId: 't2', workspaceId: 'other', runId: 'r3', wakeSource: 's', actionTypes: [] });

        reg.setStatus(s1.id, 'active');
        // s2 stays draft

        const active = reg.listActive('t1', 'ws1');
        assert.equal(active.length, 1);
        assert.equal(active[0].id, s1.id);
    });
});

// ── findMatching ──────────────────────────────────────────────────────────────

describe('SkillsRegistry.findMatching', () => {
    it('finds active skills that share at least one action type', () => {
        const reg = registry();
        const { skill } = reg.crystallize({
            ...BASE,
            runId: 'r1',
            wakeSource: 'schedule',
            actionTypes: ['file_read', 'shell_exec'],
        });
        reg.setStatus(skill.id, 'active');

        const matches = reg.findMatching('t1', 'ws1', ['shell_exec', 'api_call']);
        assert.equal(matches.length, 1);
        assert.equal(matches[0].id, skill.id);
    });

    it('returns empty when no active skills overlap', () => {
        const reg = registry();
        const { skill } = reg.crystallize({
            ...BASE,
            runId: 'r1',
            wakeSource: 'schedule',
            actionTypes: ['file_read'],
        });
        reg.setStatus(skill.id, 'active');

        const matches = reg.findMatching('t1', 'ws1', ['api_call']);
        assert.equal(matches.length, 0);
    });

    it('excludes draft and deprecated skills', () => {
        const reg = registry();
        reg.crystallize({ ...BASE, runId: 'r1', wakeSource: 's', actionTypes: ['file_read'] });

        const matches = reg.findMatching('t1', 'ws1', ['file_read']);
        assert.equal(matches.length, 0);
    });
});
