import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { MeetingSessionRecord } from '@agentfarm/shared-types';
import { CONTRACT_VERSIONS } from '@agentfarm/shared-types';
import { InvalidTransitionError, MeetingLifecycleStateMachine } from './meeting-lifecycle.js';

function makeSession(overrides: Partial<MeetingSessionRecord> = {}): MeetingSessionRecord {
    return {
        id: 'session-1',
        contractVersion: CONTRACT_VERSIONS.MEETING_SESSION,
        tenantId: 't1',
        workspaceId: 'ws1',
        botId: 'bot1',
        platform: 'teams',
        mode: 'interactive_qa',
        meetingId: 'meet-abc',
        status: 'scheduled',
        disclosureAnnounced: false,
        evidenceIds: [],
        correlationId: 'corr-1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...overrides,
    };
}

// ── Happy-path transitions ────────────────────────────────────────────────────

describe('MeetingLifecycleStateMachine — happy path', () => {
    it('transitions scheduled → join_requested → joining → joined', () => {
        const sm = new MeetingLifecycleStateMachine(makeSession());
        sm.transition('join_requested');
        assert.equal(sm.status, 'join_requested');
        sm.transition('joining');
        assert.equal(sm.status, 'joining');
        sm.transition('joined');
        assert.equal(sm.status, 'joined');
        assert.ok(sm.getSession().joinedAt, 'joinedAt must be set on joined');
    });

    it('transitions joined → listening → speaking (with disclosure)', () => {
        const sm = new MeetingLifecycleStateMachine(makeSession({ status: 'joined' }));
        sm.transition('listening');
        sm.announceDisclosure();
        sm.transition('speaking');
        assert.equal(sm.status, 'speaking');
    });

    it('transitions speaking → listening (back-and-forth)', () => {
        const sm = new MeetingLifecycleStateMachine(
            makeSession({ status: 'speaking', disclosureAnnounced: true }),
        );
        sm.transition('listening');
        assert.equal(sm.status, 'listening');
        sm.transition('speaking');
        assert.equal(sm.status, 'speaking');
    });

    it('transitions to completed and sets completedAt', () => {
        const sm = new MeetingLifecycleStateMachine(
            makeSession({ status: 'listening' }),
        );
        sm.transition('completed');
        assert.equal(sm.status, 'completed');
        assert.ok(sm.getSession().completedAt);
    });

    it('transitions to failed from joining', () => {
        const sm = new MeetingLifecycleStateMachine(makeSession({ status: 'joining' }));
        sm.transition('failed');
        assert.equal(sm.status, 'failed');
        assert.equal(sm.isTerminal(), true);
    });

    it('goes through paused → listening', () => {
        const sm = new MeetingLifecycleStateMachine(makeSession({ status: 'listening' }));
        sm.transition('paused');
        assert.equal(sm.status, 'paused');
        sm.transition('listening');
        assert.equal(sm.status, 'listening');
    });

    it('goes through escalation_required → paused → completed', () => {
        const sm = new MeetingLifecycleStateMachine(makeSession({ status: 'listening' }));
        sm.transition('escalation_required');
        sm.transition('paused');
        sm.transition('completed');
        assert.equal(sm.status, 'completed');
    });
});

// ── Disclosure enforcement ────────────────────────────────────────────────────

describe('MeetingLifecycleStateMachine — disclosure enforcement', () => {
    it('blocks speaking when disclosure has not been announced', () => {
        const sm = new MeetingLifecycleStateMachine(makeSession({ status: 'listening' }));
        assert.throws(
            () => sm.transition('speaking'),
            /disclosure/i,
        );
    });

    it('allows speaking after disclosure is announced', () => {
        const sm = new MeetingLifecycleStateMachine(makeSession({ status: 'listening' }));
        sm.announceDisclosure();
        assert.doesNotThrow(() => sm.transition('speaking'));
    });
});

// ── Invalid transitions ───────────────────────────────────────────────────────

describe('MeetingLifecycleStateMachine — invalid transitions', () => {
    it('throws InvalidTransitionError for scheduled → speaking', () => {
        const sm = new MeetingLifecycleStateMachine(makeSession());
        assert.throws(() => sm.transition('speaking'), InvalidTransitionError);
    });

    it('throws InvalidTransitionError for completed → listening (terminal)', () => {
        const sm = new MeetingLifecycleStateMachine(makeSession({ status: 'completed' }));
        assert.throws(() => sm.transition('listening'), InvalidTransitionError);
    });

    it('throws InvalidTransitionError for failed → joining (terminal)', () => {
        const sm = new MeetingLifecycleStateMachine(makeSession({ status: 'failed' }));
        assert.throws(() => sm.transition('joining'), InvalidTransitionError);
    });
});

// ── isTerminal ────────────────────────────────────────────────────────────────

describe('MeetingLifecycleStateMachine.isTerminal', () => {
    it('returns false for non-terminal states', () => {
        const sm = new MeetingLifecycleStateMachine(makeSession({ status: 'listening' }));
        assert.equal(sm.isTerminal(), false);
    });

    it('returns true for completed', () => {
        assert.equal(
            new MeetingLifecycleStateMachine(makeSession({ status: 'completed' })).isTerminal(),
            true,
        );
    });

    it('returns true for failed', () => {
        assert.equal(
            new MeetingLifecycleStateMachine(makeSession({ status: 'failed' })).isTerminal(),
            true,
        );
    });
});
