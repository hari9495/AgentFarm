import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import { AgentFeedback } from './agent-feedback.js';

describe('agent-feedback: AgentFeedback', () => {
    let feedback: AgentFeedback;

    beforeEach(() => {
        feedback = new AgentFeedback('/tmp/test-agentfarm-feedback');
        feedback._reset();
    });

    it('submitFeedback stores a record and returns it', () => {
        const record = feedback.submitFeedback({
            task_id: 'task_001',
            skill_id: 'analyze_code',
            rating: 4,
            comment: 'worked well',
        });
        assert.equal(record.task_id, 'task_001');
        assert.equal(record.skill_id, 'analyze_code');
        assert.equal(record.rating, 4);
        assert.equal(record.comment, 'worked well');
        assert.ok(record.id.length > 0);
        assert.ok(record.submitted_at);
    });

    it('getFeedback returns records for given task_id', () => {
        feedback.submitFeedback({ task_id: 't1', skill_id: 'skill_a', rating: 5 });
        feedback.submitFeedback({ task_id: 't1', skill_id: 'skill_b', rating: 3 });
        feedback.submitFeedback({ task_id: 't2', skill_id: 'skill_a', rating: 4 });
        const results = feedback.getFeedback('t1');
        assert.equal(results.length, 2);
        assert.ok(results.every((r) => r.task_id === 't1'));
    });

    it('getSkillRating computes correct average', () => {
        feedback.submitFeedback({ task_id: 't1', skill_id: 'run_tests', rating: 5 });
        feedback.submitFeedback({ task_id: 't2', skill_id: 'run_tests', rating: 3 });
        feedback.submitFeedback({ task_id: 't3', skill_id: 'run_tests', rating: 4 });
        const summary = feedback.getSkillRating('run_tests');
        assert.equal(summary.count, 3);
        assert.equal(summary.average_rating, 4);
        assert.equal(summary.distribution[5], 1);
        assert.equal(summary.distribution[3], 1);
        assert.equal(summary.distribution[4], 1);
    });

    it('getSkillRating returns 0 for unknown skill', () => {
        const summary = feedback.getSkillRating('nonexistent_skill');
        assert.equal(summary.average_rating, 0);
        assert.equal(summary.count, 0);
    });

    it('rating is clamped between 1 and 5', () => {
        const r1 = feedback.submitFeedback({ task_id: 't1', skill_id: 's', rating: 10 });
        const r2 = feedback.submitFeedback({ task_id: 't2', skill_id: 's', rating: -1 });
        assert.equal(r1.rating, 5);
        assert.equal(r2.rating, 1);
    });

    it('listAll returns records in descending order (most recent first)', () => {
        feedback.submitFeedback({ task_id: 't1', skill_id: 's', rating: 3 });
        feedback.submitFeedback({ task_id: 't2', skill_id: 's', rating: 4 });
        const all = feedback.listAll();
        assert.ok(all.length >= 2);
        // Most recent first
        const idx0 = all.findIndex((r) => r.task_id === 't2');
        const idx1 = all.findIndex((r) => r.task_id === 't1');
        assert.ok(idx0 < idx1);
    });

    it('getAllSkillRatings returns one entry per unique skill', () => {
        feedback.submitFeedback({ task_id: 't1', skill_id: 'skill_x', rating: 5 });
        feedback.submitFeedback({ task_id: 't2', skill_id: 'skill_y', rating: 3 });
        feedback.submitFeedback({ task_id: 't3', skill_id: 'skill_x', rating: 4 });
        const all = feedback.getAllSkillRatings();
        const skillIds = all.map((s) => s.skill_id);
        assert.ok(skillIds.includes('skill_x'));
        assert.ok(skillIds.includes('skill_y'));
    });

    it('workspace_id is stored when provided', () => {
        const record = feedback.submitFeedback({
            task_id: 't1',
            skill_id: 's',
            rating: 4,
            workspace_id: 'ws_abc',
        });
        assert.equal(record.workspace_id, 'ws_abc');
    });

    it('listByWorkspace filters correctly', () => {
        feedback.submitFeedback({ task_id: 't1', skill_id: 's', rating: 5, workspace_id: 'ws_a' });
        feedback.submitFeedback({ task_id: 't2', skill_id: 's', rating: 3, workspace_id: 'ws_b' });
        const ws_a = feedback.listByWorkspace('ws_a');
        assert.equal(ws_a.length, 1);
        assert.equal(ws_a[0].workspace_id, 'ws_a');
    });
});
