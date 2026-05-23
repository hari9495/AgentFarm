import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach, mock } from 'node:test';

describe('calendar-scheduler', () => {
    // Save and restore env vars around each test
    let savedEnv: Record<string, string | undefined>;

    beforeEach(() => {
        savedEnv = {
            MCP_GOOGLE_CALENDAR_URL: process.env['MCP_GOOGLE_CALENDAR_URL'],
            MCP_OUTLOOK_CALENDAR_URL: process.env['MCP_OUTLOOK_CALENDAR_URL'],
        };
    });

    afterEach(() => {
        process.env['MCP_GOOGLE_CALENDAR_URL'] = savedEnv['MCP_GOOGLE_CALENDAR_URL'];
        process.env['MCP_OUTLOOK_CALENDAR_URL'] = savedEnv['MCP_OUTLOOK_CALENDAR_URL'];
        mock.reset();
    });

    // -------------------------------------------------------------------------
    // checkCalendarAvailability
    // -------------------------------------------------------------------------

    it('checkCalendarAvailability returns empty slots when connector returns none', async () => {
        process.env['MCP_GOOGLE_CALENDAR_URL'] = 'http://localhost:9999';
        process.env['MCP_OUTLOOK_CALENDAR_URL'] = '';

        mock.method(global, 'fetch', async () => ({
            ok: true,
            json: async () => ({ slots: [] }),
        }));

        const {
            checkCalendarAvailability,
        } = await import('./calendar-scheduler.js');

        const result = await checkCalendarAvailability({
            tenantId: 'tenant-1',
            botId: 'bot-1',
            attendeeEmails: ['alice@example.com'],
            durationMinutes: 30,
            dateRangeStart: '2026-06-01T09:00:00Z',
            dateRangeEnd: '2026-06-01T17:00:00Z',
        });

        assert.deepEqual(result.slots, []);
        assert.equal(result.connector, 'google_calendar');
    });

    it('checkCalendarAvailability returns slots when connector finds availability', async () => {
        process.env['MCP_GOOGLE_CALENDAR_URL'] = 'http://localhost:9999';
        process.env['MCP_OUTLOOK_CALENDAR_URL'] = '';

        const expectedSlots = [
            '2026-06-01T10:00:00Z',
            '2026-06-01T14:00:00Z',
        ];

        mock.method(global, 'fetch', async () => ({
            ok: true,
            json: async () => ({ slots: expectedSlots }),
        }));

        const { checkCalendarAvailability } = await import('./calendar-scheduler.js');

        const result = await checkCalendarAvailability({
            tenantId: 'tenant-1',
            botId: 'bot-1',
            attendeeEmails: ['alice@example.com', 'bob@example.com'],
            durationMinutes: 60,
            dateRangeStart: '2026-06-01T09:00:00Z',
            dateRangeEnd: '2026-06-01T17:00:00Z',
        });

        assert.deepEqual(result.slots, expectedSlots);
        assert.equal(result.connector, 'google_calendar');
    });

    // -------------------------------------------------------------------------
    // scheduleCalendarEvent
    // -------------------------------------------------------------------------

    it('scheduleCalendarEvent returns eventId and joinUrl on success', async () => {
        process.env['MCP_GOOGLE_CALENDAR_URL'] = 'http://localhost:9999';
        process.env['MCP_OUTLOOK_CALENDAR_URL'] = '';

        mock.method(global, 'fetch', async () => ({
            ok: true,
            json: async () => ({
                eventId: 'evt-abc-123',
                joinUrl: 'https://meet.google.com/xyz',
            }),
        }));

        const { scheduleCalendarEvent } = await import('./calendar-scheduler.js');

        const result = await scheduleCalendarEvent({
            tenantId: 'tenant-1',
            botId: 'bot-1',
            title: 'Q3 Planning',
            attendeeEmails: ['alice@example.com'],
            startTime: '2026-06-01T10:00:00Z',
            endTime: '2026-06-01T11:00:00Z',
        });

        assert.equal(result.eventId, 'evt-abc-123');
        assert.equal(result.joinUrl, 'https://meet.google.com/xyz');
        assert.equal(result.connector, 'google_calendar');
    });

    it('scheduleCalendarEvent throws when connector is unavailable', async () => {
        delete process.env['MCP_GOOGLE_CALENDAR_URL'];
        delete process.env['MCP_OUTLOOK_CALENDAR_URL'];

        const { scheduleCalendarEvent, CalendarConnectorUnavailableError } =
            await import('./calendar-scheduler.js');

        await assert.rejects(
            () =>
                scheduleCalendarEvent({
                    tenantId: 'tenant-1',
                    botId: 'bot-1',
                    title: 'Meeting',
                    attendeeEmails: [],
                    startTime: '2026-06-01T10:00:00Z',
                    endTime: '2026-06-01T11:00:00Z',
                }),
            CalendarConnectorUnavailableError,
        );
    });

    // -------------------------------------------------------------------------
    // cancelCalendarEvent
    // -------------------------------------------------------------------------

    it('cancelCalendarEvent returns cancelled:true on success', async () => {
        process.env['MCP_GOOGLE_CALENDAR_URL'] = 'http://localhost:9999';
        process.env['MCP_OUTLOOK_CALENDAR_URL'] = '';

        mock.method(global, 'fetch', async () => ({
            ok: true,
            json: async () => ({ cancelled: true }),
        }));

        const { cancelCalendarEvent } = await import('./calendar-scheduler.js');

        const result = await cancelCalendarEvent({
            tenantId: 'tenant-1',
            botId: 'bot-1',
            eventId: 'evt-abc-123',
        });

        assert.equal(result.cancelled, true);
        assert.equal(result.connector, 'google_calendar');
    });

    it('cancelCalendarEvent throws CalendarEventNotFoundError on not_found', async () => {
        process.env['MCP_GOOGLE_CALENDAR_URL'] = 'http://localhost:9999';
        process.env['MCP_OUTLOOK_CALENDAR_URL'] = '';

        mock.method(global, 'fetch', async () => ({
            ok: true,
            json: async () => ({ not_found: true }),
        }));

        const { cancelCalendarEvent, CalendarEventNotFoundError } =
            await import('./calendar-scheduler.js');

        await assert.rejects(
            () =>
                cancelCalendarEvent({
                    tenantId: 'tenant-1',
                    botId: 'bot-1',
                    eventId: 'evt-missing-99',
                }),
            CalendarEventNotFoundError,
        );
    });
});
