/**
 * MeetingJoinAdapter — common interface every platform adapter must implement.
 *
 * The adapter abstraction lets the MeetingConnectorRouter swap between
 * Teams Graph API, Zoom SDK, FreeSWITCH SIP, and browser-based joining
 * without changing any meeting-agent server code.
 */

export type JoinMethod = 'teams_sdk' | 'zoom_sdk' | 'sip' | 'browser';

export interface MeetingJoinResult {
    ok: boolean;
    /** How the join was achieved. */
    joinMethod: JoinMethod;
    /** Platform-specific handle for the active call (call ID, SIP channel, PID, etc.). */
    sessionHandle?: string;
    error?: string;
}

export interface MeetingLeaveResult {
    ok: boolean;
    error?: string;
}

/** Capabilities declared by an adapter so the router can make informed choices. */
export interface MeetingAdapterCapabilities {
    /** Can send text messages to the meeting chat. */
    chat: boolean;
    /** Can share a screen / video stream. */
    screenShare: boolean;
    /** Can retrieve the attendee list. */
    attendeeList: boolean;
    /** Receives a real-time audio/transcript stream (not browser capture). */
    nativeAudioStream: boolean;
}

export interface MeetingJoinAdapter {
    /**
     * Join the meeting at `meetingUrl` and return a handle for subsequent
     * operations. Resolves when the join is complete (or best-effort started
     * for async flows like SIP dial-in).
     */
    join(meetingUrl: string, displayName?: string): Promise<MeetingJoinResult>;

    /**
     * Leave the meeting. `sessionHandle` is whatever was returned by `join()`.
     * Should not throw — always resolves (errors are surfaced in the result).
     */
    leave(sessionHandle?: string): Promise<MeetingLeaveResult>;

    /** Capabilities this adapter provides. */
    getCapabilities(): MeetingAdapterCapabilities;
}
