/**
 * Corporate Assistant — Calendar Scheduler
 *
 * Thin integration layer between the corporate assistant runtime and the
 * MCP calendar connector. All three operations (availability check, schedule,
 * cancel) are forwarded to the appropriate calendar MCP server; no direct
 * API calls to Google or Outlook are made here.
 *
 * Connector selection priority:
 *   1. `connector` param (caller-supplied)
 *   2. `MCP_GOOGLE_CALENDAR_URL` env var presence → 'google_calendar'
 *   3. `MCP_OUTLOOK_CALENDAR_URL` env var presence → 'outlook_calendar'
 *   4. Throws CalendarConnectorUnavailableError
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AvailabilityParams = {
    tenantId: string;
    botId: string;
    attendeeEmails: string[];
    durationMinutes: number;
    dateRangeStart: string; // ISO-8601
    dateRangeEnd: string;   // ISO-8601
    connector?: string;
};

export type AvailabilityResult = {
    slots: string[]; // ISO-8601 start times
    connector: string;
};

export type ScheduleEventParams = {
    tenantId: string;
    botId: string;
    title: string;
    attendeeEmails: string[];
    startTime: string; // ISO-8601
    endTime: string;   // ISO-8601
    description?: string;
    connector?: string;
};

export type ScheduleEventResult = {
    eventId: string;
    joinUrl: string | null;
    connector: string;
};

export type CancelEventParams = {
    tenantId: string;
    botId: string;
    eventId: string;
    cancellationNote?: string;
    connector?: string;
};

export type CancelEventResult = {
    cancelled: boolean;
    connector: string;
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function resolveCalendarConnector(connectorOverride?: string): string {
    if (connectorOverride) return connectorOverride;
    if ((process.env['MCP_GOOGLE_CALENDAR_URL'] ?? '').trim()) return 'google_calendar';
    if ((process.env['MCP_OUTLOOK_CALENDAR_URL'] ?? '').trim()) return 'outlook_calendar';
    throw new CalendarConnectorUnavailableError(
        'No calendar MCP connector is available. ' +
        'Set MCP_GOOGLE_CALENDAR_URL or MCP_OUTLOOK_CALENDAR_URL.',
    );
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class CalendarConnectorUnavailableError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'CalendarConnectorUnavailableError';
    }
}

export class CalendarEventNotFoundError extends Error {
    constructor(eventId: string) {
        super(`Calendar event not found: ${eventId}`);
        this.name = 'CalendarEventNotFoundError';
    }
}

// ---------------------------------------------------------------------------
// MCP call helper (internal)
// ---------------------------------------------------------------------------

/** Calls the calendar MCP server tool via a typed fetch. */
async function callCalendarMcp<T extends Record<string, unknown>>(
    tool: string,
    input: Record<string, unknown>,
    connector: string,
): Promise<T> {
    const urlEnvKey =
        connector === 'google_calendar'
            ? 'MCP_GOOGLE_CALENDAR_URL'
            : 'MCP_OUTLOOK_CALENDAR_URL';

    const baseUrl = (process.env[urlEnvKey] ?? '').trim();
    if (!baseUrl) {
        throw new CalendarConnectorUnavailableError(
            `Calendar connector "${connector}" is not configured (${urlEnvKey} is unset).`,
        );
    }

    const url = `${baseUrl}/tools/${tool}`;
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
    });

    if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(
            `Calendar MCP call failed [${connector}/${tool}]: HTTP ${response.status} — ${text.slice(0, 200)}`,
        );
    }

    return response.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Query the calendar MCP server for available meeting slots.
 *
 * Returns an array of ISO-8601 start-time strings representing slots that
 * satisfy the requested duration and have all attendees free.
 */
export async function checkCalendarAvailability(
    params: AvailabilityParams,
): Promise<AvailabilityResult> {
    const connector = resolveCalendarConnector(params.connector);

    const result = await callCalendarMcp<{ slots?: string[] }>(
        'check_availability',
        {
            tenantId: params.tenantId,
            botId: params.botId,
            attendees: params.attendeeEmails,
            durationMinutes: params.durationMinutes,
            rangeStart: params.dateRangeStart,
            rangeEnd: params.dateRangeEnd,
        },
        connector,
    );

    return {
        slots: result.slots ?? [],
        connector,
    };
}

/**
 * Schedule a calendar event via the MCP connector.
 *
 * Returns the created event ID and an optional join URL (e.g. Meet / Teams
 * conference link) if the calendar provider generated one.
 */
export async function scheduleCalendarEvent(
    params: ScheduleEventParams,
): Promise<ScheduleEventResult> {
    const connector = resolveCalendarConnector(params.connector);

    const result = await callCalendarMcp<{
        eventId?: string;
        event_id?: string;
        joinUrl?: string;
        join_url?: string;
    }>(
        'create_event',
        {
            tenantId: params.tenantId,
            botId: params.botId,
            title: params.title,
            attendees: params.attendeeEmails,
            startTime: params.startTime,
            endTime: params.endTime,
            description: params.description ?? '',
        },
        connector,
    );

    const eventId = result.eventId ?? result.event_id;
    if (!eventId) {
        throw new Error(
            `Calendar MCP [${connector}/create_event] returned no eventId.`,
        );
    }

    return {
        eventId,
        joinUrl: result.joinUrl ?? result.join_url ?? null,
        connector,
    };
}

/**
 * Cancel an existing calendar event via the MCP connector.
 *
 * Throws CalendarEventNotFoundError when the event does not exist or has
 * already been cancelled.
 */
export async function cancelCalendarEvent(
    params: CancelEventParams,
): Promise<CancelEventResult> {
    const connector = resolveCalendarConnector(params.connector);

    const result = await callCalendarMcp<{
        cancelled?: boolean;
        canceled?: boolean;
        notFound?: boolean;
        not_found?: boolean;
    }>(
        'cancel_event',
        {
            tenantId: params.tenantId,
            botId: params.botId,
            eventId: params.eventId,
            cancellationNote: params.cancellationNote ?? '',
        },
        connector,
    );

    if (result.notFound ?? result.not_found) {
        throw new CalendarEventNotFoundError(params.eventId);
    }

    return {
        cancelled: result.cancelled ?? result.canceled ?? true,
        connector,
    };
}
