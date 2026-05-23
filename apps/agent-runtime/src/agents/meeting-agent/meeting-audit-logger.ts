/**
 * meeting-audit-logger.ts
 *
 * Writes per-event audit trail entries for meeting sessions.
 * Each call logs one row to MeetingAuditEvent via the api-gateway.
 */

const gatewayBase = (): string =>
    (process.env['API_GATEWAY_URL'] ?? 'http://localhost:3001').replace(/\/+$/, '');

export type MeetingEventType =
    | 'joined'
    | 'left'
    | 'spoke'
    | 'listened'
    | 'transcribed'
    | 'summarised'
    | 'summary_distributed'
    | 'avatar_state_changed'
    | 'error';

export interface LogMeetingEventOptions {
    meetingSessionId: string;
    tenantId: string;
    workspaceId: string;
    agentId: string;
    platform: string;
    eventType: MeetingEventType;
    severity?: 'info' | 'warn' | 'error';
    summary: string;
    payload?: Record<string, unknown>;
    durationMs?: number;
}

/**
 * Log a single meeting audit event.
 * Fire-and-forget — failures are logged to console and do not throw.
 */
export async function logMeetingEvent(opts: LogMeetingEventOptions): Promise<void> {
    const {
        meetingSessionId,
        tenantId,
        workspaceId,
        agentId,
        platform,
        eventType,
        severity = 'info',
        summary,
        payload,
        durationMs,
    } = opts;

    try {
        const res = await fetch(
            `${gatewayBase()}/v1/meetings/${encodeURIComponent(meetingSessionId)}/audit-events`,
            {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    'x-tenant-id': tenantId,
                },
                body: JSON.stringify({
                    tenantId,
                    workspaceId,
                    agentId,
                    platform,
                    eventType,
                    severity,
                    summary,
                    payload: payload ?? null,
                    durationMs: durationMs ?? null,
                }),
                signal: AbortSignal.timeout(5_000),
            },
        );

        if (!res.ok) {
            const errText = await res.text().catch(() => '');
            console.error(
                `[meeting-audit] failed to log event "${eventType}" for session ${meetingSessionId}: HTTP ${res.status} ${errText}`,
            );
        }
    } catch (err: unknown) {
        console.error(`[meeting-audit] network error logging event "${eventType}":`, err);
    }
}
