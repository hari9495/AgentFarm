import type {
    MeetingMode,
    MeetingPlatform,
    MeetingSessionRecord,
} from '@agentfarm/shared-types';
import { CONTRACT_VERSIONS } from '@agentfarm/shared-types';
import { randomUUID } from 'node:crypto';
import { MeetingLifecycleStateMachine } from './meeting-lifecycle.js';

/**
 * Per-session transcript entry recorded by the meeting agent. Stored in
 * memory; production deployments should mirror to durable storage via the
 * voice transcript contract.
 */
export interface TranscriptEntry {
    /** ISO-8601 timestamp the entry was recorded. */
    at: string;
    /**
     * Origin of the utterance:
     *  - `participant` — captured from a remote speaker via STT
     *  - `agent`       — produced by our TTS pipeline (echoed for record)
     *  - `system`      — lifecycle annotations (e.g. join/leave)
     */
    source: 'participant' | 'agent' | 'system';
    /** Optional speaker label when diarisation is available. */
    speaker?: string;
    /** Text of the utterance. */
    text: string;
}

/** Inputs accepted when creating a new meeting session. */
export interface CreateSessionInput {
    tenantId: string;
    workspaceId: string;
    botId: string;
    platform: MeetingPlatform;
    mode: MeetingMode;
    meetingId: string;
    meetingUrl?: string;
    correlationId?: string;
}

/** A managed in-memory session, including its lifecycle FSM and transcript. */
export interface ManagedSession {
    machine: MeetingLifecycleStateMachine;
    transcript: TranscriptEntry[];
}

/**
 * SessionManager owns the lifecycle and transcript log for every active
 * meeting session inside the meeting-agent service. All state is kept in
 * memory; consumers that require durability should snapshot via the
 * `getSession` accessor and persist the returned record.
 */
export class SessionManager {
    private readonly sessions = new Map<string, ManagedSession>();

    /** Create a new meeting session in `scheduled` state and return it. */
    create(input: CreateSessionInput): MeetingSessionRecord {
        const now = new Date().toISOString();
        const record: MeetingSessionRecord = {
            id: randomUUID(),
            contractVersion: CONTRACT_VERSIONS.MEETING_SESSION,
            tenantId: input.tenantId,
            workspaceId: input.workspaceId,
            botId: input.botId,
            platform: input.platform,
            mode: input.mode,
            meetingId: input.meetingId,
            meetingUrl: input.meetingUrl,
            status: 'scheduled',
            disclosureAnnounced: false,
            evidenceIds: [],
            correlationId: input.correlationId ?? randomUUID(),
            createdAt: now,
            updatedAt: now,
        };
        this.sessions.set(record.id, {
            machine: new MeetingLifecycleStateMachine(record),
            transcript: [],
        });
        return record;
    }

    /** Lookup a session by id; returns undefined if not registered. */
    get(id: string): ManagedSession | undefined {
        return this.sessions.get(id);
    }

    /** Return the current immutable snapshot of a session record. */
    getSession(id: string): Readonly<MeetingSessionRecord> | undefined {
        return this.sessions.get(id)?.machine.getSession();
    }

    /** Append a transcript entry to the session. Throws if unknown id. */
    appendTranscript(id: string, entry: Omit<TranscriptEntry, 'at'> & { at?: string }): void {
        const session = this.sessions.get(id);
        if (!session) {
            throw new Error(`SessionManager: unknown session ${id}`);
        }
        session.transcript.push({
            at: entry.at ?? new Date().toISOString(),
            source: entry.source,
            speaker: entry.speaker,
            text: entry.text,
        });
    }

    /** Return a defensive copy of the transcript for a session. */
    getTranscript(id: string): TranscriptEntry[] {
        const session = this.sessions.get(id);
        if (!session) {
            return [];
        }
        return session.transcript.map((entry) => ({ ...entry }));
    }

    /** Remove a session from the in-memory map. */
    delete(id: string): boolean {
        return this.sessions.delete(id);
    }

    /** Number of active sessions (test helper). */
    size(): number {
        return this.sessions.size;
    }
}
