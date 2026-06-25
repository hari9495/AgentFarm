/**
 * Phase 4 — Time-window governance evaluator.
 *
 * A `timeWindow` on a governance rule defines the ALLOWED hours; the rule's deny
 * effect fires when "now" is OUTSIDE the window (a working-hours restriction).
 *
 * tz-aware (via Intl), handles overnight windows (start > end wraps past
 * midnight) and an optional day-of-week filter (0=Sun..6=Sat, in the target tz).
 * Unknown/invalid tz falls back to UTC (never throws).
 */

export interface TimeWindow {
    /** Allowed days of week in the target tz (0=Sun..6=Sat). Default: all days. */
    days?: number[];
    /** Allowed start time, 'HH:MM' (inclusive). */
    start: string;
    /** Allowed end time, 'HH:MM' (exclusive). */
    end: string;
    /** IANA timezone (e.g. 'America/New_York'). Default: 'UTC'. */
    tz?: string;
}

function parseHHMM(v: string): number | null {
    const m = /^(\d{1,2}):(\d{2})$/.exec(v?.trim() ?? '');
    if (!m) return null;
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (h < 0 || h > 23 || min < 0 || min > 59) return null;
    return h * 60 + min;
}

/** Local day-of-week (0..6) and minutes-of-day for an instant in a timezone. */
function localParts(now: Date, tz: string): { day: number; minutes: number } {
    let parts: Intl.DateTimeFormatPart[];
    try {
        parts = new Intl.DateTimeFormat('en-US', {
            timeZone: tz,
            weekday: 'short',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
        }).formatToParts(now);
    } catch {
        // Invalid tz → fall back to UTC.
        return { day: now.getUTCDay(), minutes: now.getUTCHours() * 60 + now.getUTCMinutes() };
    }
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
    const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const day = weekdayMap[get('weekday')] ?? now.getUTCDay();
    let hour = Number(get('hour'));
    if (hour === 24) hour = 0; // some environments render midnight as 24
    const minutes = hour * 60 + Number(get('minute'));
    return { day, minutes };
}

/** True when `now` is within the allowed window (day + time), in the window's tz. */
export function isWithinWindow(window: TimeWindow, now: Date): boolean {
    const start = parseHHMM(window.start);
    const end = parseHHMM(window.end);
    if (start === null || end === null) return false; // malformed → not within (fail-safe)

    const { day, minutes } = localParts(now, window.tz ?? 'UTC');

    if (window.days && window.days.length > 0 && !window.days.includes(day)) {
        return false;
    }

    if (start === end) return false; // zero-length window
    if (start < end) {
        return minutes >= start && minutes < end;
    }
    // Overnight window (e.g. 22:00–06:00): wraps past midnight.
    return minutes >= start || minutes < end;
}

/** True when a rule's time window denies `now` (now is OUTSIDE the allowed window). */
export function isTimeDenied(rule: { timeWindow?: TimeWindow }, now: Date): boolean {
    if (!rule.timeWindow) return false;
    return !isWithinWindow(rule.timeWindow, now);
}
