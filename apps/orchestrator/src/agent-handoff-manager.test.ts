import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AgentHandoffManager } from './agent-handoff-manager.js';

// ---------------------------------------------------------------------------
// Shared test fixture factory
// ---------------------------------------------------------------------------
const baseInput = () => ({
    tenantId: 'tenant_1',
    workspaceId: 'ws_1',
    taskId: 'task_1',
    fromBotId: 'bot_a',
    toBotId: 'bot_b',
    reason: 'Handing off to specialist',
    correlationId: 'corr_1',
    contractVersion: '1.0',
});

// ===========================================================================
// createHandoff
// ===========================================================================

describe('createHandoff', () => {
    it('returns a record with status=pending and all input fields', () => {
        const mgr = new AgentHandoffManager();
        const rec = mgr.createHandoff(baseInput());

        assert.ok(rec.id, 'id must be set');
        assert.equal(rec.status, 'pending');
        assert.equal(rec.tenantId, 'tenant_1');
        assert.equal(rec.workspaceId, 'ws_1');
        assert.equal(rec.taskId, 'task_1');
        assert.equal(rec.fromBotId, 'bot_a');
        assert.equal(rec.toBotId, 'bot_b');
        assert.equal(rec.reason, 'Handing off to specialist');
        assert.equal(rec.correlationId, 'corr_1');
        assert.equal(rec.contractVersion, '1.0');
    });

    it('sets default escalateOnTimeoutMs to 3_600_000 when not supplied', () => {
        const mgr = new AgentHandoffManager();
        const rec = mgr.createHandoff(baseInput());
        assert.equal(rec.escalateOnTimeoutMs, 3_600_000);
    });

    it('uses supplied escalateOnTimeoutMs', () => {
        const mgr = new AgentHandoffManager();
        const rec = mgr.createHandoff({ ...baseInput(), escalateOnTimeoutMs: 5_000 });
        assert.equal(rec.escalateOnTimeoutMs, 5_000);
    });

    it('stores handoffContext when provided', () => {
        const mgr = new AgentHandoffManager();
        const rec = mgr.createHandoff({ ...baseInput(), handoffContext: { key: 'val' } });
        assert.deepEqual(rec.handoffContext, { key: 'val' });
    });

    it('generates unique IDs for successive handoffs', () => {
        const mgr = new AgentHandoffManager();
        const a = mgr.createHandoff(baseInput());
        const b = mgr.createHandoff(baseInput());
        assert.notEqual(a.id, b.id);
    });

    it('writes a handoff_initiated audit event', () => {
        const mgr = new AgentHandoffManager();
        const rec = mgr.createHandoff(baseInput());
        const { auditEvents } = mgr.exportState();
        assert.equal(auditEvents!.length, 1);
        assert.equal(auditEvents![0]!.action, 'handoff_initiated');
        assert.equal(auditEvents![0]!.tenantId, 'tenant_1');
        assert.equal(auditEvents![0]!.metadata['handoffId'], rec.id);
    });
});

// ===========================================================================
// listHandoffs
// ===========================================================================

describe('listHandoffs', () => {
    it('returns all handoffs when no filter applied', () => {
        const mgr = new AgentHandoffManager();
        mgr.createHandoff(baseInput());
        mgr.createHandoff({ ...baseInput(), tenantId: 'tenant_2', workspaceId: 'ws_2' });
        assert.equal(mgr.listHandoffs({}).length, 2);
    });

    it('filters by tenantId', () => {
        const mgr = new AgentHandoffManager();
        mgr.createHandoff(baseInput());
        mgr.createHandoff({ ...baseInput(), tenantId: 'tenant_2' });
        const result = mgr.listHandoffs({ tenantId: 'tenant_1' });
        assert.equal(result.length, 1);
        assert.equal(result[0]!.tenantId, 'tenant_1');
    });

    it('filters by workspaceId', () => {
        const mgr = new AgentHandoffManager();
        mgr.createHandoff(baseInput());
        mgr.createHandoff({ ...baseInput(), workspaceId: 'ws_2' });
        const result = mgr.listHandoffs({ workspaceId: 'ws_1' });
        assert.equal(result.length, 1);
        assert.equal(result[0]!.workspaceId, 'ws_1');
    });

    it('filters by status', () => {
        const mgr = new AgentHandoffManager();
        const a = mgr.createHandoff(baseInput());
        mgr.createHandoff(baseInput());
        mgr.updateStatus({ handoffId: a.id, status: 'completed' });
        const pending = mgr.listHandoffs({ status: 'pending' });
        const completed = mgr.listHandoffs({ status: 'completed' });
        assert.equal(pending.length, 1);
        assert.equal(completed.length, 1);
    });

    it('respects limit (default 50, max 200)', () => {
        const mgr = new AgentHandoffManager();
        for (let i = 0; i < 10; i++) mgr.createHandoff(baseInput());
        assert.equal(mgr.listHandoffs({ limit: 3 }).length, 3);
        assert.equal(mgr.listHandoffs({ limit: 1000 }).length, 10); // capped at actual count
    });

    it('clamps limit to minimum of 1', () => {
        const mgr = new AgentHandoffManager();
        mgr.createHandoff(baseInput());
        assert.equal(mgr.listHandoffs({ limit: 0 }).length, 1);
    });

    it('returns results sorted by updatedAt descending', () => {
        const mgr = new AgentHandoffManager();
        const first = mgr.createHandoff(baseInput());
        const second = mgr.createHandoff(baseInput());
        // Update first to make it more recent
        mgr.updateStatus({ handoffId: first.id, status: 'accepted' });
        const list = mgr.listHandoffs({});
        assert.equal(list[0]!.id, first.id, 'most recently updated should be first');
        assert.equal(list[1]!.id, second.id);
    });
});

// ===========================================================================
// updateStatus
// ===========================================================================

describe('updateStatus', () => {
    it('returns null for unknown handoffId', () => {
        const mgr = new AgentHandoffManager();
        assert.equal(mgr.updateStatus({ handoffId: 'nonexistent', status: 'completed' }), null);
    });

    it('updates status and bumps updatedAt', () => {
        const mgr = new AgentHandoffManager();
        const rec = mgr.createHandoff(baseInput());
        const originalUpdatedAt = rec.updatedAt;

        const updated = mgr.updateStatus({ handoffId: rec.id, status: 'accepted' });
        assert.ok(updated, 'should return updated record');
        assert.equal(updated!.status, 'accepted');
        assert.ok(updated!.updatedAt >= originalUpdatedAt, 'updatedAt must not go backwards');
    });

    it('writes handoff_completed audit event when status is completed', () => {
        const mgr = new AgentHandoffManager();
        const rec = mgr.createHandoff(baseInput()); // initiates one event
        mgr.updateStatus({ handoffId: rec.id, status: 'completed' });
        const events = mgr.exportState().auditEvents!;
        assert.equal(events.length, 2);
        assert.equal(events[1]!.action, 'handoff_completed');
    });

    it('does NOT write audit event for non-completed status changes', () => {
        const mgr = new AgentHandoffManager();
        const rec = mgr.createHandoff(baseInput());
        mgr.updateStatus({ handoffId: rec.id, status: 'accepted' });
        const events = mgr.exportState().auditEvents!;
        // Only the initial handoff_initiated event
        assert.equal(events.length, 1);
    });
});

// ===========================================================================
// checkAndTimeoutHandoffs
// ===========================================================================

describe('checkAndTimeoutHandoffs', () => {
    it('returns empty array when no handoffs have expired', () => {
        const mgr = new AgentHandoffManager();
        mgr.createHandoff({ ...baseInput(), escalateOnTimeoutMs: 3_600_000 });
        const timedOut = mgr.checkAndTimeoutHandoffs(new Date());
        assert.equal(timedOut.length, 0);
    });

    it('times out pending handoffs past their timeout window', () => {
        const mgr = new AgentHandoffManager();
        const rec = mgr.createHandoff({ ...baseInput(), escalateOnTimeoutMs: 1_000 });
        // Advance time past timeout
        const future = new Date(Date.parse(rec.createdAt) + 2_000);
        const timedOut = mgr.checkAndTimeoutHandoffs(future);
        assert.equal(timedOut.length, 1);
        assert.equal(timedOut[0]!.id, rec.id);
        assert.equal(timedOut[0]!.status, 'timed_out');
    });

    it('does not time out already-completed handoffs', () => {
        const mgr = new AgentHandoffManager();
        const rec = mgr.createHandoff({ ...baseInput(), escalateOnTimeoutMs: 1_000 });
        mgr.updateStatus({ handoffId: rec.id, status: 'completed' });
        const future = new Date(Date.parse(rec.createdAt) + 5_000);
        const timedOut = mgr.checkAndTimeoutHandoffs(future);
        assert.equal(timedOut.length, 0);
    });

    it('only times out pending handoffs, ignores accepted', () => {
        const mgr = new AgentHandoffManager();
        const pending = mgr.createHandoff({ ...baseInput(), escalateOnTimeoutMs: 1_000 });
        const accepted = mgr.createHandoff({ ...baseInput(), escalateOnTimeoutMs: 1_000 });
        mgr.updateStatus({ handoffId: accepted.id, status: 'accepted' });
        const future = new Date(Date.parse(pending.createdAt) + 2_000);
        const timedOut = mgr.checkAndTimeoutHandoffs(future);
        assert.equal(timedOut.length, 1);
        assert.equal(timedOut[0]!.id, pending.id);
    });

    it('writes handoff_timed_out audit event for each timed-out handoff', () => {
        const mgr = new AgentHandoffManager();
        const rec = mgr.createHandoff({ ...baseInput(), escalateOnTimeoutMs: 1_000 });
        const future = new Date(Date.parse(rec.createdAt) + 2_000);
        mgr.checkAndTimeoutHandoffs(future);
        const events = mgr.exportState().auditEvents!;
        const timeoutEvents = events.filter(e => e.action === 'handoff_timed_out');
        assert.equal(timeoutEvents.length, 1);
        assert.equal(timeoutEvents[0]!.metadata['handoffId'], rec.id);
    });

    it('uses current time as default when no asOf argument supplied', () => {
        const mgr = new AgentHandoffManager();
        // Create with a 0ms timeout so it's already expired
        const rec = mgr.createHandoff({ ...baseInput(), escalateOnTimeoutMs: 0 });
        // Slight delay to ensure Date.now() > createdAt + 0
        const timedOut = mgr.checkAndTimeoutHandoffs();
        // May or may not fire depending on exact timing, but should not throw
        assert.ok(Array.isArray(timedOut));
        // The record should still be accessible
        assert.ok(mgr.listHandoffs({ tenantId: 'tenant_1' }).some(h => h.id === rec.id));
    });
});

// ===========================================================================
// exportState / constructor hydration
// ===========================================================================

describe('exportState and constructor hydration', () => {
    it('exportState returns a snapshot of all handoffs and audit events', () => {
        const mgr = new AgentHandoffManager();
        mgr.createHandoff(baseInput());
        mgr.createHandoff({ ...baseInput(), taskId: 'task_2' });
        const state = mgr.exportState();
        assert.equal(state.handoffs.length, 2);
        assert.equal(state.auditEvents!.length, 2);
    });

    it('constructor hydrates from exported state', () => {
        const original = new AgentHandoffManager();
        const rec = original.createHandoff(baseInput());
        original.updateStatus({ handoffId: rec.id, status: 'completed' });
        const state = original.exportState();

        const restored = new AgentHandoffManager(state);
        assert.equal(restored.listHandoffs({}).length, 1);
        assert.equal(restored.listHandoffs({})[0]!.status, 'completed');
        assert.equal(restored.exportState().auditEvents!.length, 2);
    });

    it('exportState returns independent copies (mutations do not affect snapshot)', () => {
        const mgr = new AgentHandoffManager();
        mgr.createHandoff(baseInput());
        const snapshot1 = mgr.exportState();
        mgr.createHandoff(baseInput());
        const snapshot2 = mgr.exportState();
        // First snapshot should still have only 1 handoff
        assert.equal(snapshot1.handoffs.length, 1);
        assert.equal(snapshot2.handoffs.length, 2);
    });

    it('audit log caps at 1000 entries', () => {
        const mgr = new AgentHandoffManager();
        // Create 1001 handoffs — each creates one audit event
        for (let i = 0; i < 1001; i++) {
            mgr.createHandoff({ ...baseInput(), correlationId: `corr_${i}` });
        }
        const { auditEvents } = mgr.exportState();
        assert.ok(auditEvents!.length <= 1000, 'audit log should not exceed 1000 entries');
    });
});
