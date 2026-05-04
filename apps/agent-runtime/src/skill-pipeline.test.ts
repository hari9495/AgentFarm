import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import { SkillPipelineEngine } from './skill-pipeline.js';

describe('skill-pipeline: SkillPipelineEngine', () => {
    let engine: SkillPipelineEngine;

    beforeEach(() => {
        engine = new SkillPipelineEngine();
    });

    it('listPipelines returns at least the built-in pipelines', () => {
        const pipelines = engine.listPipelines();
        assert.ok(pipelines.length >= 5);
        const ids = pipelines.map((p) => p.id);
        assert.ok(ids.includes('pr-quality-gate'));
        assert.ok(ids.includes('security-audit'));
        assert.ok(ids.includes('release-readiness'));
    });

    it('getPipeline returns pipeline by id', () => {
        const pipeline = engine.getPipeline('pr-quality-gate');
        assert.ok(pipeline, 'should find pr-quality-gate');
        assert.equal(pipeline?.id, 'pr-quality-gate');
        assert.ok(Array.isArray(pipeline?.steps));
    });

    it('run in dry_run mode returns ok:true', async () => {
        const result = await engine.run({ pipeline_id: 'pr-quality-gate', dry_run: true });
        assert.equal(result.ok, true);
        assert.ok(Array.isArray(result.steps));
        assert.ok(result.steps.length > 0);
    });

    it('run produces step records with required fields', async () => {
        const result = await engine.run({ pipeline_id: 'code-health', dry_run: true });
        for (const step of result.steps) {
            assert.ok(step.step_index >= 0);
            assert.ok(typeof step.skill_id === 'string');
            assert.ok(['completed', 'skipped', 'failed'].includes(step.status));
            assert.ok(typeof step.duration_ms === 'number');
        }
    });

    it('run returns ok:false for nonexistent pipeline', async () => {
        const result = await engine.run({ pipeline_id: 'no-such-pipeline' });
        assert.equal(result.ok, false);
        assert.ok(result.summary.includes('not found'));
    });

    it('registerPipeline adds a custom pipeline', async () => {
        engine.registerPipeline({
            id: 'test-custom',
            name: 'Test Custom',
            description: 'custom',
            tags: [],
            steps: [{ skill_id: 'pr-size-enforcer' }],
        });
        const p = engine.getPipeline('test-custom');
        assert.ok(p, 'custom pipeline should be retrievable');
        const result = await engine.run({ pipeline_id: 'test-custom', dry_run: true });
        assert.equal(result.ok, true);
    });

    it('getRecentRuns returns array', async () => {
        await engine.run({ pipeline_id: 'pr-quality-gate', dry_run: true });
        const runs = engine.getRecentRuns(5);
        assert.ok(Array.isArray(runs));
        assert.ok(runs.length >= 1);
    });

    it('getRunById retrieves a specific run', async () => {
        const result = await engine.run({ pipeline_id: 'security-audit', dry_run: true });
        const fetched = engine.getRunById(result.run_id);
        assert.ok(fetched, 'should find run by id');
        assert.equal(fetched?.run_id, result.run_id);
    });

    it('initial_inputs are available to first step', async () => {
        engine.registerPipeline({
            id: 'input-test',
            name: 'Input Test',
            description: '',
            tags: [],
            steps: [{ skill_id: 'pr-size-enforcer', static_inputs: { mode: 'fast' } }],
        });
        const result = await engine.run({
            pipeline_id: 'input-test',
            initial_inputs: { repo: 'org/repo' },
            dry_run: true,
        });
        assert.equal(result.ok, true);
    });
});
