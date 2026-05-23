/**
 * Content Scheduler
 *
 * Creates a structured content workflow by scheduling three calendar events:
 *   1. Draft Due
 *   2. Review Due
 *   3. Publish Date
 *
 * Optionally records a PendingCmsPublish record so the trigger service can
 * invoke workspace_cw_scheduled_publish when the publish date arrives.
 *
 * Delegates calendar event creation to an injectable CalendarClientFn so no
 * real calendar API call is made in tests.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

import type { CmsTarget } from './cms-publisher.js';

export type { CmsTarget } from './cms-publisher.js';

export interface ContentWorkflowDates {
    /** ISO date string — when the draft must be complete. */
    draftDeadline: string;
    /** ISO date string — when the review must be complete. */
    reviewDeadline: string;
    /** ISO date string — planned publish date. */
    publishDate: string;
}

export interface CalendarEvent {
    title: string;
    date: string;
    description: string;
    allDay: boolean;
}

export interface ContentSchedule {
    events: CalendarEvent[];
    /** Human-readable summary returned to the caller. */
    summary: string;
}

export interface ScheduleResult {
    ok: boolean;
    schedule: ContentSchedule | null;
    errorMessage: string | null;
    /**
     * Set when the caller provided a `cmsPublishTarget`.
     * The trigger service should invoke `workspace_cw_scheduled_publish`
     * with this payload on or after the `scheduledAt` date.
     */
    pendingCmsPublish: PendingCmsPublish | null;
}

/**
 * Describes a CMS draft that should be promoted to live at a future date.
 * Produced by `scheduleContentWorkflow` when `cmsPublishTarget` is supplied.
 */
export interface PendingCmsPublish {
    draftId: string;
    target: CmsTarget;
    /** ISO date string of the planned publish date. */
    scheduledAt: string;
}

/**
 * Injectable calendar client.
 * Receives a CalendarEvent and the name of the calendar connector to target.
 * Returns a confirmation ID on success, or throws on failure.
 */
export type CalendarClientFn = (
    event: CalendarEvent,
    calendarConnector: string,
) => Promise<{ confirmationId: string }>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toIsoDate(dateInput: string): string {
    // Accept ISO dates and common locale formats (YYYY-MM-DD, DD/MM/YYYY, MM/DD/YYYY)
    const trimmed = dateInput.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

    // Try direct parse — covers ISO datetime strings
    const parsed = new Date(trimmed);
    if (!isNaN(parsed.getTime())) {
        return parsed.toISOString().slice(0, 10);
    }

    // Fallback: return original and let downstream validate
    return trimmed;
}

function buildCalendarEvents(briefTitle: string, dates: ContentWorkflowDates): CalendarEvent[] {
    return [
        {
            title: `[AgentFarm] Draft Due: ${briefTitle}`,
            date: toIsoDate(dates.draftDeadline),
            description:
                `Content draft for "${briefTitle}" must be complete and ready for editorial review.`,
            allDay: true,
        },
        {
            title: `[AgentFarm] Review Due: ${briefTitle}`,
            date: toIsoDate(dates.reviewDeadline),
            description:
                `Editorial review of "${briefTitle}" must be complete. All feedback addressed.`,
            allDay: true,
        },
        {
            title: `[AgentFarm] Publish: ${briefTitle}`,
            date: toIsoDate(dates.publishDate),
            description: `Scheduled publish date for "${briefTitle}".`,
            allDay: true,
        },
    ];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Schedule a content workflow by creating three calendar events.
 *
 * @param briefTitle          Display title for the content piece.
 * @param dates               Workflow key dates (draft, review, publish).
 * @param calendarConnector   Name of the calendar MCP connector (e.g. 'google_calendar').
 * @param calendarClient      Injectable client function — calls the connector per event.
 * @param cmsPublishTarget    Optional — when provided, records a PendingCmsPublish
 *                            for the trigger service to act on at publish date.
 */
export async function scheduleContentWorkflow(
    briefTitle: string,
    dates: ContentWorkflowDates,
    calendarConnector: string,
    calendarClient: CalendarClientFn,
    cmsPublishTarget?: { draftId: string; target: CmsTarget },
): Promise<ScheduleResult> {
    const events = buildCalendarEvents(briefTitle, dates);
    const confirmationIds: string[] = [];

    try {
        for (const event of events) {
            const result = await calendarClient(event, calendarConnector);
            confirmationIds.push(result.confirmationId);
        }
    } catch (err) {
        return {
            ok: false,
            schedule: null,
            errorMessage: `Calendar event creation failed: ${String(err)}`,
            pendingCmsPublish: null,
        };
    }

    const schedule: ContentSchedule = {
        events,
        summary:
            `Scheduled 3 workflow events for "${briefTitle}": ` +
            `Draft due ${toIsoDate(dates.draftDeadline)}, ` +
            `Review due ${toIsoDate(dates.reviewDeadline)}, ` +
            `Publish on ${toIsoDate(dates.publishDate)}. ` +
            `Confirmation IDs: ${confirmationIds.join(', ')}.`,
    };

    const pendingCmsPublish: PendingCmsPublish | null = cmsPublishTarget
        ? { draftId: cmsPublishTarget.draftId, target: cmsPublishTarget.target, scheduledAt: toIsoDate(dates.publishDate) }
        : null;

    return { ok: true, schedule, errorMessage: null, pendingCmsPublish };
}
