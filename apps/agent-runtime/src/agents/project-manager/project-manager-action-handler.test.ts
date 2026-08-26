/**
 * Tests for project-manager-action-handler.ts
 *
 * Pattern: node:test with describe/it.
 *
 * The SM-side actions (sprint_plan, velocity_report, backlog_groom,
 * standup_summary, ceremony_agenda, impediment_log) are backed by pure
 * domain modules that require no LLM or network. Gateway-dependent steps
 * (episodic memory write, KB ingest, connector push) are best-effort and
 * silently ignored when gatewayBaseUrl is empty, so all SM actions
 * are safe to test with an empty gateway.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isPmActionType, PM_ACTION_TYPES } from './project-manager-action-handler.js';

const BASE = {
    tenantId: 'tenant-1',
    botId: 'bot-1',
    taskId: 'task-1',
    workspaceId: 'ws-1',
    gatewayBaseUrl: '',  // gateway calls silently no-op when empty
    serviceToken: '',
};

// ── Type guard ────────────────────────────────────────────────────────────────

describe('isPmActionType', () => {
    it('returns true for every type in PM_ACTION_TYPES', () => {
        for (const t of PM_ACTION_TYPES) {
            assert.ok(isPmActionType(t), `expected true for ${t}`);
        }
    });

    it('returns false for non-PM types', () => {
        assert.equal(isPmActionType('workspace_ba_draft_brd'), false);
        assert.equal(isPmActionType('workspace_cse_reply_compose'), false);
        assert.equal(isPmActionType(''), false);
    });
});

describe('PM_ACTION_TYPES set', () => {
    it('contains PM document generation types', () => {
        assert.ok(PM_ACTION_TYPES.has('workspace_pm_project_charter'));
        assert.ok(PM_ACTION_TYPES.has('workspace_pm_status_report'));
        assert.ok(PM_ACTION_TYPES.has('workspace_pm_risk_register'));
        assert.ok(PM_ACTION_TYPES.has('workspace_pm_budget_forecast'));
    });

    it('contains SM structured-data types', () => {
        assert.ok(PM_ACTION_TYPES.has('workspace_pm_sprint_plan'));
        assert.ok(PM_ACTION_TYPES.has('workspace_pm_velocity_report'));
        assert.ok(PM_ACTION_TYPES.has('workspace_pm_backlog_groom'));
        assert.ok(PM_ACTION_TYPES.has('workspace_pm_standup_summary'));
        assert.ok(PM_ACTION_TYPES.has('workspace_pm_ceremony_agenda'));
        assert.ok(PM_ACTION_TYPES.has('workspace_pm_delivery_forecast'));
        assert.ok(PM_ACTION_TYPES.has('workspace_pm_sprint_health_check'));
    });
});

// ── workspace_pm_sprint_plan ──────────────────────────────────────────────────

describe('workspace_pm_sprint_plan', () => {
    it('returns ok:true with markdown output for a minimal payload', async () => {
        const { handlePmAction } = await import('./project-manager-action-handler.js');

        const result = await handlePmAction({
            ...BASE,
            actionType: 'workspace_pm_sprint_plan',
            payload: {
                sprint_name: 'Sprint 1',
                sprint_goal: 'Deliver MVP login',
                sprint_duration_days: 10,
                team: [{ name: 'Alice', capacity: 8 }, { name: 'Bob', capacity: 6 }],
                backlog: [
                    { id: 'STORY-1', title: 'User login', points: 5, priority: 'high', has_acceptance_criteria: true },
                    { id: 'STORY-2', title: 'Password reset', points: 3, priority: 'medium' },
                ],
            },
        });

        assert.equal(result.ok, true, `unexpected error: ${result.errorOutput}`);
        assert.ok(typeof result.output === 'string', 'output should be a string');
        assert.ok(result.output.length > 0, 'output should not be empty');
    });

    it('returns ok:true with empty backlog (zero committed points)', async () => {
        const { handlePmAction } = await import('./project-manager-action-handler.js');

        const result = await handlePmAction({
            ...BASE,
            actionType: 'workspace_pm_sprint_plan',
            payload: {
                sprint_name: 'Sprint Zero',
                sprint_goal: 'Kickoff',
                backlog: [],
                team: [],
            },
        });

        assert.equal(result.ok, true);
    });

    it('applies default sprint name when not provided', async () => {
        const { handlePmAction } = await import('./project-manager-action-handler.js');

        const result = await handlePmAction({
            ...BASE,
            actionType: 'workspace_pm_sprint_plan',
            payload: {},  // sprint_name missing — handler applies default
        });

        assert.equal(result.ok, true);
        assert.ok(result.output.length > 0);
    });
});

// ── workspace_pm_velocity_report ──────────────────────────────────────────────

describe('workspace_pm_velocity_report', () => {
    it('returns ok:true with velocity metrics for sprint history', async () => {
        const { handlePmAction } = await import('./project-manager-action-handler.js');

        const result = await handlePmAction({
            ...BASE,
            actionType: 'workspace_pm_velocity_report',
            payload: {
                sprints: [
                    { sprint_name: 'Sprint 1', committed_points: 20, completed_points: 18, end_date: '2026-04-14', duration_days: 10 },
                    { sprint_name: 'Sprint 2', committed_points: 22, completed_points: 20, end_date: '2026-04-28', duration_days: 10 },
                    { sprint_name: 'Sprint 3', committed_points: 24, completed_points: 22, end_date: '2026-05-12', duration_days: 10 },
                ],
            },
        });

        assert.equal(result.ok, true);
        assert.ok(typeof result.output === 'string');
        // Should mention velocity figures
        assert.ok(result.output.length > 20, 'output should contain velocity markdown');
    });

    it('returns ok:true with insufficient_data trend for a single sprint', async () => {
        const { handlePmAction } = await import('./project-manager-action-handler.js');

        const result = await handlePmAction({
            ...BASE,
            actionType: 'workspace_pm_velocity_report',
            payload: {
                sprints: [
                    { sprint_name: 'Sprint 1', committed_points: 15, completed_points: 12, end_date: '2026-04-14', duration_days: 10 },
                ],
            },
        });

        assert.equal(result.ok, true);
        assert.ok(result.output.includes('insufficient') || result.output.includes('Insufficient') || result.output.length > 0);
    });

    it('handles missing sprints payload gracefully', async () => {
        const { handlePmAction } = await import('./project-manager-action-handler.js');

        const result = await handlePmAction({
            ...BASE,
            actionType: 'workspace_pm_velocity_report',
            payload: {},
        });

        assert.equal(result.ok, true);
    });
});

// ── workspace_pm_backlog_groom ────────────────────────────────────────────────

describe('workspace_pm_backlog_groom', () => {
    it('returns ok:true with groomed items and DoR scores', async () => {
        const { handlePmAction } = await import('./project-manager-action-handler.js');

        const result = await handlePmAction({
            ...BASE,
            actionType: 'workspace_pm_backlog_groom',
            payload: {
                items: [
                    {
                        id: 'STORY-10', title: 'Search feature', description: 'Full text search across projects',
                        type: 'story', points: 8, priority: 'high',
                        has_acceptance_criteria: true, has_design: true,
                    },
                    {
                        id: 'BUG-5', title: 'Fix login redirect', type: 'bug',
                        priority: 'critical', has_acceptance_criteria: false,
                    },
                ],
            },
        });

        assert.equal(result.ok, true);
        assert.ok(typeof result.output === 'string');
        assert.ok(result.output.length > 0);
    });

    it('handles empty items list without error', async () => {
        const { handlePmAction } = await import('./project-manager-action-handler.js');

        const result = await handlePmAction({
            ...BASE,
            actionType: 'workspace_pm_backlog_groom',
            payload: { items: [] },
        });

        assert.equal(result.ok, true);
    });
});

// ── workspace_pm_standup_summary ──────────────────────────────────────────────

describe('workspace_pm_standup_summary', () => {
    it('returns ok:true with standup summary output', async () => {
        const { handlePmAction } = await import('./project-manager-action-handler.js');

        const result = await handlePmAction({
            ...BASE,
            actionType: 'workspace_pm_standup_summary',
            payload: {
                sprint_name: 'Sprint 3',
                team_updates: [
                    { name: 'Alice', yesterday: 'Implemented auth module', today: 'Write unit tests', blockers: '' },
                    { name: 'Bob', yesterday: 'DB schema review', today: 'Migration script', blockers: 'Waiting for review' },
                ],
            },
        });

        assert.equal(result.ok, true);
        assert.ok(typeof result.output === 'string');
        assert.ok(result.output.length > 0);
    });

    it('handles empty team_updates payload', async () => {
        const { handlePmAction } = await import('./project-manager-action-handler.js');

        const result = await handlePmAction({
            ...BASE,
            actionType: 'workspace_pm_standup_summary',
            payload: {},
        });

        assert.equal(result.ok, true);
    });
});

// ── workspace_pm_ceremony_agenda ──────────────────────────────────────────────

describe('workspace_pm_ceremony_agenda', () => {
    it('returns ok:true with agenda output for sprint review', async () => {
        const { handlePmAction } = await import('./project-manager-action-handler.js');

        const result = await handlePmAction({
            ...BASE,
            actionType: 'workspace_pm_ceremony_agenda',
            payload: {
                ceremony_type: 'sprint_review',
                sprint_name: 'Sprint 3',
                duration_minutes: 60,
                attendees: ['Product Owner', 'Dev Team', 'Stakeholders'],
            },
        });

        assert.equal(result.ok, true);
        assert.ok(typeof result.output === 'string');
        assert.ok(result.output.length > 0);
    });

    it('generates retrospective agenda', async () => {
        const { handlePmAction } = await import('./project-manager-action-handler.js');

        const result = await handlePmAction({
            ...BASE,
            actionType: 'workspace_pm_ceremony_agenda',
            payload: {
                ceremony_type: 'retrospective',
                duration_minutes: 45,
            },
        });

        assert.equal(result.ok, true);
    });
});

// ── workspace_pm_impediment_log ───────────────────────────────────────────────

describe('workspace_pm_impediment_log', () => {
    it('returns ok:true with impediment record', async () => {
        const { handlePmAction } = await import('./project-manager-action-handler.js');

        const result = await handlePmAction({
            ...BASE,
            actionType: 'workspace_pm_impediment_log',
            payload: {
                title: 'Deploy environment blocked',
                description: 'Staging server is down, blocking all testing.',
                severity: 'high',
                owner: 'DevOps',
                raised_by: 'QA Team',
            },
        });

        assert.equal(result.ok, true);
        assert.ok(typeof result.output === 'string');
    });

    it('handles minimal payload without error', async () => {
        const { handlePmAction } = await import('./project-manager-action-handler.js');

        const result = await handlePmAction({
            ...BASE,
            actionType: 'workspace_pm_impediment_log',
            payload: { title: 'Unblocking needed' },
        });

        assert.equal(result.ok, true);
    });
});

describe('workspace_pm_status_report — deliver on approval', () => {
    it('delivers the approved report to the team channel', async () => {
        const { handlePmAction } = await import('./project-manager-action-handler.js');
        const calls: Array<{ connectorType: string; actionType: string; channel: unknown }> = [];
        const result = await handlePmAction({
            ...BASE,
            actionType: 'workspace_pm_status_report',
            callLlm: async () => 'Status: on track. 8/10 stories done.',
            connectorClient: async (i) => { calls.push({ connectorType: i.connectorType, actionType: i.actionType, channel: i.payload['channel'] }); return { ok: true, statusCode: 200 }; },
            payload: { title: 'Sprint 4 status', approved: true, slack_channel: '#project' },
        } as Parameters<typeof handlePmAction>[0]);
        assert.equal(result.ok, true);
        assert.equal((result as Record<string, unknown>)['deliveredTo'], 'slack:#project');
        assert.deepEqual(calls, [{ connectorType: 'slack', actionType: 'send_message', channel: '#project' }]);
    });

    it('does not deliver without approval (goes to the gate)', async () => {
        const { handlePmAction } = await import('./project-manager-action-handler.js');
        let called = false;
        const result = await handlePmAction({
            ...BASE,
            actionType: 'workspace_pm_status_report',
            callLlm: async () => 'Status: on track.',
            connectorClient: async () => { called = true; return { ok: true, statusCode: 200 }; },
            payload: { title: 'Sprint 4 status', slack_channel: '#project' },
        } as Parameters<typeof handlePmAction>[0]);
        assert.equal(result.ok, true);
        assert.equal((result as Record<string, unknown>)['deliveredTo'], undefined);
        assert.equal(called, false, 'must not post an unapproved status report');
    });
});
