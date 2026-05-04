import type { MeetingLifecycleStatus, MeetingSessionRecord } from '@agentfarm/shared-types';

/**
 * Allowed lifecycle transitions per the spec in planning/spec-meeting-agent-teams.md.
 *
 * States:
 *   scheduled → join_requested → joining → joined → listening ⇄ speaking
 *   listening | speaking → paused | escalation_required | completed | failed
 *   paused → listening | completed | failed
 *   escalation_required → paused | completed | failed
 *   completed, failed: terminal (no outgoing transitions)
 */
const ALLOWED_TRANSITIONS: Readonly<Record<MeetingLifecycleStatus, MeetingLifecycleStatus[]>> = {
    scheduled: ['join_requested', 'failed'],
    join_requested: ['joining', 'failed'],
    joining: ['joined', 'failed'],
    joined: ['listening', 'paused', 'failed'],
    listening: ['speaking', 'paused', 'escalation_required', 'completed', 'failed'],
    speaking: ['listening', 'paused', 'escalation_required', 'completed', 'failed'],
    paused: ['listening', 'completed', 'failed'],
    escalation_required: ['paused', 'completed', 'failed'],
    completed: [],
    failed: [],
};

export class InvalidTransitionError extends Error {
    constructor(from: MeetingLifecycleStatus, to: MeetingLifecycleStatus) {
        super(`MeetingLifecycle: invalid transition ${from} → ${to}`);
        this.name = 'InvalidTransitionError';
    }
}

/**
 * MeetingLifecycleStateMachine manages the state of a single meeting session.
 *
 * Trust rules (non-negotiable per spec):
 *   - `disclosureAnnounced` must be true before transitioning to `speaking`.
 *   - Once set, disclosure cannot be reverted.
 */
export class MeetingLifecycleStateMachine {
    private session: MeetingSessionRecord;

    constructor(session: MeetingSessionRecord) {
        this.session = { ...session };
    }

    get status(): MeetingLifecycleStatus {
        return this.session.status;
    }

    getSession(): Readonly<MeetingSessionRecord> {
        return this.session;
    }

    /**
     * Marks the AI disclosure as announced to all participants.
     * Required before the agent is permitted to speak.
     */
    announceDisclosure(): void {
        this.session = { ...this.session, disclosureAnnounced: true, updatedAt: now() };
    }

    /**
     * Transitions to a new lifecycle state.
     * Throws `InvalidTransitionError` when the transition is not allowed.
     * Throws `Error` when trying to speak without disclosure.
     */
    transition(to: MeetingLifecycleStatus): void {
        const allowed = ALLOWED_TRANSITIONS[this.session.status];
        if (!allowed.includes(to)) {
            throw new InvalidTransitionError(this.session.status, to);
        }

        if (to === 'speaking' && !this.session.disclosureAnnounced) {
            throw new Error(
                'MeetingLifecycle: agent must announce AI disclosure before speaking',
            );
        }

        const updates: Partial<MeetingSessionRecord> = { status: to, updatedAt: now() };

        if (to === 'joined') updates.joinedAt = now();
        if (to === 'completed') updates.completedAt = now();

        this.session = { ...this.session, ...updates };
    }

    /** Convenience: is the session in a terminal state? */
    isTerminal(): boolean {
        return this.session.status === 'completed' || this.session.status === 'failed';
    }
}

function now(): string {
    return new Date().toISOString();
}
