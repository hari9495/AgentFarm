/**
 * Sprint 2 — Role Enforcement Framework: enforceRole() tests
 *
 * 5 valid developer tasks must be allowed.
 * 5 out-of-role tasks must be blocked with the correct suggestedRole.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { enforceRole } from './role-enforcer.js';
import type { TaskEnvelope } from './execution-engine.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTask(actionType: string, prompt: string): TaskEnvelope {
    return {
        taskId: `test-${Math.random().toString(36).slice(2)}`,
        enqueuedAt: Date.now(),
        payload: {
            action_type: actionType,
            prompt,
            tenantId: 'tenant-test',
            workspaceId: 'workspace-test',
            botId: 'bot-developer-1',
        },
    };
}

// Force allow: used to confirm a task passes even when classifier would block.
const allowClassifier = async () => ({
    belongsToRole: true,
    confidence: 0.95,
    reason: 'test-mock: allow',
    suggestedRole: null,
});

// ---------------------------------------------------------------------------
// Valid developer tasks — must return allowed: true
// ---------------------------------------------------------------------------

describe('enforceRole — valid developer tasks', () => {
    it('allows: code_edit for a failing unit test', async () => {
        const task = makeTask('code_edit', 'Fix the failing unit test in auth.ts');
        const result = await enforceRole(task, 'developer', { classifierFn: allowClassifier });
        assert.equal(result.allowed, true);
    });

    it('allows: create_pr for a feature branch', async () => {
        const task = makeTask('create_pr', 'Create a pull request for the login-refactor branch');
        const result = await enforceRole(task, 'developer', { classifierFn: allowClassifier });
        assert.equal(result.allowed, true);
    });

    it('allows: review_code on a utilities module', async () => {
        const task = makeTask('review_code', 'Review the utils.ts code for security issues');
        const result = await enforceRole(task, 'developer', { classifierFn: allowClassifier });
        assert.equal(result.allowed, true);
    });

    it('allows: run_pipeline for the main CI pipeline', async () => {
        const task = makeTask('run_pipeline', 'Run the CI pipeline for the main branch');
        const result = await enforceRole(task, 'developer', { classifierFn: allowClassifier });
        assert.equal(result.allowed, true);
    });

    it('allows: workspace_github_issue_fix for a reported bug', async () => {
        const task = makeTask(
            'workspace_github_issue_fix',
            'Fix GitHub issue #42 — null pointer exception in the login service',
        );
        const result = await enforceRole(task, 'developer', { classifierFn: allowClassifier });
        assert.equal(result.allowed, true);
    });
});

// ---------------------------------------------------------------------------
// Out-of-role tasks — must return allowed: false with the correct suggestedRole
// ---------------------------------------------------------------------------

describe('enforceRole — out-of-role tasks are blocked', () => {
    it('blocks: create_job_posting and suggests recruiter', async () => {
        const task = makeTask(
            'create_job_posting',
            'Write a job posting for a senior backend engineer',
        );
        const result = await enforceRole(task, 'developer');
        assert.equal(result.allowed, false);
        if (!result.allowed) {
            assert.equal(result.declineCode, 'action_blocked');
            assert.equal(result.suggestedRole, 'recruiter');
        }
    });

    it('blocks: search_candidates and suggests recruiter', async () => {
        const task = makeTask(
            'search_candidates',
            'Find candidates for the open DevOps engineering position',
        );
        const result = await enforceRole(task, 'developer');
        assert.equal(result.allowed, false);
        if (!result.allowed) {
            assert.equal(result.declineCode, 'action_blocked');
            assert.equal(result.suggestedRole, 'recruiter');
        }
    });

    it('blocks: find_leads and suggests sales_rep', async () => {
        const task = makeTask(
            'find_leads',
            'Find enterprise sales leads for the Q3 outreach campaign',
        );
        const result = await enforceRole(task, 'developer');
        assert.equal(result.allowed, false);
        if (!result.allowed) {
            assert.equal(result.declineCode, 'action_blocked');
            assert.equal(result.suggestedRole, 'sales_rep');
        }
    });

    it('blocks: escalate_ticket and suggests customer_support_executive', async () => {
        const task = makeTask(
            'escalate_ticket',
            'Escalate the customer support ticket #456 to tier 2',
        );
        const result = await enforceRole(task, 'developer');
        assert.equal(result.allowed, false);
        if (!result.allowed) {
            assert.equal(result.declineCode, 'action_blocked');
            assert.equal(result.suggestedRole, 'customer_support_executive');
        }
    });

    it('blocks: create_campaign and suggests marketing_specialist', async () => {
        const task = makeTask(
            'create_campaign',
            'Create an email marketing campaign for the product launch',
        );
        const result = await enforceRole(task, 'developer');
        assert.equal(result.allowed, false);
        if (!result.allowed) {
            assert.equal(result.declineCode, 'action_blocked');
            assert.equal(result.suggestedRole, 'marketing_specialist');
        }
    });
});
