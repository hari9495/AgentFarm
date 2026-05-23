import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { scheduleContentWorkflow } from './content-scheduler.js';
import type { CalendarClientFn, ContentWorkflowDates } from './content-scheduler.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const dates: ContentWorkflowDates = {
    draftDeadline: '2026-07-01',
    reviewDeadline: '2026-07-08',
    publishDate: '2026-07-15',
};

let callCount = 0;
const successClient: CalendarClientFn = async (_event, _connector) => {
    callCount++;
    return { confirmationId: `conf-${callCount}` };
};

const failClient: CalendarClientFn = async () => {
    throw new Error('Calendar API timeout');
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('scheduleContentWorkflow', () => {
    test('returns ok=true and schedule on success', async () => {
        callCount = 0;
        const result = await scheduleContentWorkflow(
            'TypeScript Deep Dive',
            dates,
            'google_calendar',
            successClient,
        );
        assert.equal(result.ok, true);
        assert.ok(result.schedule !== null);
        assert.equal(result.schedule!.events.length, 3);
    });

    test('creates exactly 3 calendar events', async () => {
        callCount = 0;
        let eventsCreated = 0;
        const countingClient: CalendarClientFn = async () => {
            eventsCreated++;
            return { confirmationId: 'c1' };
        };

        await scheduleContentWorkflow('Test Post', dates, 'google_calendar', countingClient);
        assert.equal(eventsCreated, 3);
    });

    test('event titles include the brief title', async () => {
        callCount = 0;
        const capturedEvents: string[] = [];
        const captureClient: CalendarClientFn = async (event) => {
            capturedEvents.push(event.title);
            return { confirmationId: 'c1' };
        };

        await scheduleContentWorkflow('My Campaign', dates, 'google_calendar', captureClient);
        assert.ok(capturedEvents.every((t) => t.includes('My Campaign')));
    });

    test('events are all-day events', async () => {
        callCount = 0;
        const capturedAllDay: boolean[] = [];
        const captureClient: CalendarClientFn = async (event) => {
            capturedAllDay.push(event.allDay);
            return { confirmationId: 'c1' };
        };

        await scheduleContentWorkflow('Post A', dates, 'google_calendar', captureClient);
        assert.ok(capturedAllDay.every((v) => v === true));
    });

    test('dates are normalised to ISO format in events', async () => {
        callCount = 0;
        const capturedDates: string[] = [];
        const captureClient: CalendarClientFn = async (event) => {
            capturedDates.push(event.date);
            return { confirmationId: 'c1' };
        };

        const isoPattern = /^\d{4}-\d{2}-\d{2}$/;
        await scheduleContentWorkflow('Post B', dates, 'google_calendar', captureClient);
        assert.ok(capturedDates.every((d) => isoPattern.test(d)));
    });

    test('summary includes all three dates', async () => {
        callCount = 0;
        const result = await scheduleContentWorkflow('Post C', dates, 'google_calendar', successClient);
        assert.ok(result.schedule!.summary.includes('2026-07-01'));
        assert.ok(result.schedule!.summary.includes('2026-07-08'));
        assert.ok(result.schedule!.summary.includes('2026-07-15'));
    });

    test('returns ok=false and errorMessage on calendar failure', async () => {
        const result = await scheduleContentWorkflow('Post D', dates, 'google_calendar', failClient);
        assert.equal(result.ok, false);
        assert.equal(result.schedule, null);
        assert.ok(result.errorMessage?.includes('Calendar API timeout'));
    });
});

// ---------------------------------------------------------------------------
// pendingCmsPublish / auto-post integration tests
// ---------------------------------------------------------------------------

describe('scheduleContentWorkflow — pendingCmsPublish', () => {
    test('pendingCmsPublish is null when no cmsPublishTarget provided', async () => {
        const result = await scheduleContentWorkflow('Post A', dates, 'google_calendar', successClient);
        assert.equal(result.pendingCmsPublish, null);
    });

    test('pendingCmsPublish is set when cmsPublishTarget is provided', async () => {
        const result = await scheduleContentWorkflow(
            'Post B',
            dates,
            'google_calendar',
            successClient,
            { draftId: 'draft-123', target: { platform: 'wordpress', baseUrl: 'https://my.site', applicationPassword: 'k' } },
        );
        assert.ok(result.pendingCmsPublish !== null);
        assert.equal(result.pendingCmsPublish!.draftId, 'draft-123');
        assert.equal(result.pendingCmsPublish!.target.platform, 'wordpress');
        assert.equal(result.pendingCmsPublish!.scheduledAt, dates.publishDate);
    });

    test('pendingCmsPublish scheduledAt matches normalised publish date', async () => {
        const datesWithSlash: ContentWorkflowDates = {
            draftDeadline: '2026-09-01',
            reviewDeadline: '2026-09-08',
            publishDate: '2026-09-15',
        };
        const result = await scheduleContentWorkflow(
            'Post C',
            datesWithSlash,
            'google_calendar',
            successClient,
            { draftId: 'draft-456', target: { platform: 'hubspot', accessToken: 'hsk', blogId: '42' } },
        );
        assert.equal(result.pendingCmsPublish!.scheduledAt, '2026-09-15');
    });

    test('pendingCmsPublish is null on calendar failure even with cmsPublishTarget', async () => {
        const result = await scheduleContentWorkflow(
            'Post D',
            dates,
            'google_calendar',
            failClient,
            { draftId: 'draft-789', target: { platform: 'ghost', baseUrl: 'https://my.ghost.io', adminApiKey: 'abc123:deadbeef0123456789abcdef' } },
        );
        assert.equal(result.ok, false);
        assert.equal(result.pendingCmsPublish, null);
    });
});
