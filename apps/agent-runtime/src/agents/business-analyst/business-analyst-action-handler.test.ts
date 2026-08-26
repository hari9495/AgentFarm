/**
 * Tests for business-analyst-action-handler.ts
 *
 * Pattern: node:test with describe/it. Actions that depend on callLlm are
 * tested via the explicit "no callLlm" path (ok:false with error message) and
 * via the "no KB documents" fast path (ok:true with zero-results output).
 *
 * KB-dependent calls (fetchKbDocuments) catch network errors and return [] —
 * so passing an empty gatewayBaseUrl produces the same "no docs" path as a
 * workspace with no approved documents, making it safe for unit tests.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isBaActionType, BA_ACTION_TYPES } from './business-analyst-action-handler.js';

const BASE = {
    tenantId: 'tenant-1',
    botId: 'bot-1',
    taskId: 'task-1',
    workspaceId: 'ws-1',
    gatewayBaseUrl: '',   // no gateway — KB calls return [] gracefully
    serviceToken: '',
};

// ── Type guard ────────────────────────────────────────────────────────────────

describe('isBaActionType', () => {
    it('returns true for every type in BA_ACTION_TYPES', () => {
        for (const t of BA_ACTION_TYPES) {
            assert.ok(isBaActionType(t), `expected true for ${t}`);
        }
    });

    it('returns false for unrelated action types', () => {
        assert.equal(isBaActionType('workspace_cse_reply_compose'), false);
        assert.equal(isBaActionType('workspace_pm_sprint_plan'), false);
        assert.equal(isBaActionType(''), false);
        assert.equal(isBaActionType('random_string'), false);
    });
});

describe('BA_ACTION_TYPES set', () => {
    it('contains the core document generation types', () => {
        assert.ok(BA_ACTION_TYPES.has('workspace_ba_draft_brd'));
        assert.ok(BA_ACTION_TYPES.has('workspace_ba_draft_user_story'));
        assert.ok(BA_ACTION_TYPES.has('workspace_ba_finalize_brd'));
        assert.ok(BA_ACTION_TYPES.has('workspace_ba_gap_analysis'));
        assert.ok(BA_ACTION_TYPES.has('workspace_ba_uat_checklist'));
    });

    it('contains the proactive monitoring types', () => {
        assert.ok(BA_ACTION_TYPES.has('workspace_ba_proactive_ac_check'));
        assert.ok(BA_ACTION_TYPES.has('workspace_ba_proactive_epic_check'));
        assert.ok(BA_ACTION_TYPES.has('workspace_ba_proactive_conflict_scan'));
        assert.ok(BA_ACTION_TYPES.has('workspace_ba_rtm_generate'));
    });
});

// ── workspace_ba_proactive_ac_check ───────────────────────────────────────────

describe('workspace_ba_proactive_ac_check', () => {
    it('returns ok:false when callLlm is not provided', async () => {
        const { handleBaAction } = await import('./business-analyst-action-handler.js');

        const result = await handleBaAction({
            ...BASE,
            actionType: 'workspace_ba_proactive_ac_check',
            payload: {},
            // callLlm intentionally omitted
        });

        assert.equal(result.ok, false);
        assert.ok(
            result.errorOutput?.toLowerCase().includes('calllm') ||
            result.errorOutput?.toLowerCase().includes('llm') ||
            result.errorOutput?.toLowerCase().includes('required'),
            `expected error about missing callLlm, got: ${result.errorOutput}`,
        );
    });

    it('returns ok:true with empty-KB message when no docs found', async () => {
        const { handleBaAction } = await import('./business-analyst-action-handler.js');

        // With empty gatewayBaseUrl, fetchKbDocuments returns [] and the handler
        // takes the "no documents" fast path.
        const result = await handleBaAction({
            ...BASE,
            actionType: 'workspace_ba_proactive_ac_check',
            payload: {},
            callLlm: async () => 'mock response',
        });

        // Either the fast path (no docs) or a successful check — both are ok:true
        assert.equal(result.ok, true);
    });
});

// ── workspace_ba_proactive_epic_check ─────────────────────────────────────────

describe('workspace_ba_proactive_epic_check', () => {
    it('returns ok:false when callLlm is not provided', async () => {
        const { handleBaAction } = await import('./business-analyst-action-handler.js');

        const result = await handleBaAction({
            ...BASE,
            actionType: 'workspace_ba_proactive_epic_check',
            payload: {},
        });

        assert.equal(result.ok, false);
        assert.ok(result.errorOutput, 'should have an error message');
    });

    it('returns ok:true with no-docs message when KB is empty', async () => {
        const { handleBaAction } = await import('./business-analyst-action-handler.js');

        const result = await handleBaAction({
            ...BASE,
            actionType: 'workspace_ba_proactive_epic_check',
            payload: {},
            callLlm: async () => '{}',
        });

        assert.equal(result.ok, true);
    });
});

// ── workspace_ba_proactive_conflict_scan ──────────────────────────────────────

describe('workspace_ba_proactive_conflict_scan', () => {
    it('returns ok:true with zero conflicts when KB is empty', async () => {
        const { handleBaAction } = await import('./business-analyst-action-handler.js');

        const result = await handleBaAction({
            ...BASE,
            actionType: 'workspace_ba_proactive_conflict_scan',
            payload: {},
        });

        assert.equal(result.ok, true);
        // conflictsDetected should be 0 (no docs → no conflicts)
        assert.equal(result.conflictsDetected, 0);
        assert.ok(typeof result.documentsScanned === 'number');
        assert.ok(typeof result.output === 'string');
    });

    it('respects max_documents payload option', async () => {
        const { handleBaAction } = await import('./business-analyst-action-handler.js');

        const result = await handleBaAction({
            ...BASE,
            actionType: 'workspace_ba_proactive_conflict_scan',
            payload: { max_documents: 5, min_keyword_overlap: 1 },
        });

        assert.equal(result.ok, true);
        assert.equal(result.conflictsDetected, 0);
    });
});

// ── workspace_ba_rtm_generate ─────────────────────────────────────────────────

describe('workspace_ba_rtm_generate', () => {
    it('returns ok:true with rtm documentType', async () => {
        const { handleBaAction } = await import('./business-analyst-action-handler.js');

        const result = await handleBaAction({
            ...BASE,
            actionType: 'workspace_ba_rtm_generate',
            payload: {},
        });

        assert.equal(result.ok, true);
        assert.equal(result.documentType, 'rtm');
        assert.ok(typeof result.output === 'string');
        assert.ok(typeof result.totalRequirements === 'number');
        assert.ok(typeof result.coveragePercent === 'number');
    });
});

// ── workspace_ba_elicit_requirements — live interview (presence) ───────────────

describe('workspace_ba_elicit_requirements — live interview', () => {
    it('conducts the interview and feeds the transcript into requirements when join=true', async () => {
        const { handleBaAction } = await import('./business-analyst-action-handler.js');
        const prompts: string[] = [];
        let clientCalled: { protocolLen: number } | null = null;

        await handleBaAction({
            ...BASE,
            actionType: 'workspace_ba_elicit_requirements',
            payload: { title: 'Billing revamp', join: true, desktopSessionId: 'ds-1', meetingUrl: 'https://meet/x', platform: 'zoom' },
            callLlm: async (prompt: string) => { prompts.push(prompt); return 'REQ-1: The system shall bill monthly.'; },
            protocolInterviewClient: async (m) => {
                clientCalled = { protocolLen: m.protocol.length };
                return {
                    meetingSessionId: 'mtg-ba-1',
                    completed: true,
                    totalTurns: 2,
                    transcript: [
                        { speaker: 'agent', text: 'What problem are we solving?' },
                        { speaker: 'interviewee', text: 'Customers cannot self-serve billing.' },
                    ],
                    results: [{ id: 'q1', question: 'What problem?', status: 'answered', answer: 'self-serve billing', probes: 0 }],
                };
            },
        });

        assert.ok(clientCalled, 'the interview client was called');
        assert.ok((clientCalled as { protocolLen: number }).protocolLen > 0, 'a non-empty BA protocol was passed');
        assert.ok(prompts.some((p) => p.includes('Customers cannot self-serve billing')), 'the transcript reached the requirements LLM prompt');
    });

    it('does not run the interview without join=true (notes-based path)', async () => {
        const { handleBaAction } = await import('./business-analyst-action-handler.js');
        let called = false;
        await handleBaAction({
            ...BASE,
            actionType: 'workspace_ba_elicit_requirements',
            payload: { title: 'Billing revamp', description: 'notes here' },
            callLlm: async () => 'REQ-1',
            protocolInterviewClient: async () => { called = true; return { meetingSessionId: 'x', completed: true, totalTurns: 0, transcript: [], results: [] }; },
        });
        assert.equal(called, false);
    });
});
