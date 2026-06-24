// ============================================================================
// Shift gate (C5) — runtime evaluation of AgentPersona.workingHours.
//
// `workingHours` was cosmetic: stored but never consulted. This module turns it
// into an enforced shift, so autonomous work (pulled tickets, scheduled jobs,
// inbound triggers) outside an agent's working window is DEFERRED to the next
// shift instead of run 24/7. Pure + timezone-aware (IANA) via Intl — no deps.
// ============================================================================

import type { WorkingHours } from './persona.js';

/** Parse "HH:MM" → minutes since midnight; null when malformed. */
function parseHm(value: string | undefined): number | null {
    if (!value) return null;
    const m = value.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (h < 0 || h > 23 || min < 0 || min > 59) return null;
    return h * 60 + min;
}

/** Wall-clock fields of `date` as observed in `timeZone`. */
function zonedParts(date: Date, timeZone: string): {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    weekday: number;
} {
    const dtf = new Intl.DateTimeFormat('en-US', {
        timeZone,
        hourCycle: 'h23',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        weekday: 'short',
    });
    const parts = dtf.formatToParts(date);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
    const weekdayMap: Record<string, number> = {
        Sun: 0,
        Mon: 1,
        Tue: 2,
        Wed: 3,
        Thu: 4,
        Fri: 5,
        Sat: 6,
    };
    return {
        year: Number(get('year')),
        month: Number(get('month')),
        day: Number(get('day')),
        hour: Number(get('hour')),
        minute: Number(get('minute')),
        weekday: weekdayMap[get('weekday')] ?? 0,
    };
}

/** Milliseconds `timeZone` is ahead of UTC at the given instant. */
function tzOffsetMs(date: Date, timeZone: string): number {
    const p = zonedParts(date, timeZone);
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, 0);
    // zonedParts gives wall-clock; round `date` to the minute for a clean diff.
    const flooredActual = Math.floor(date.getTime() / 60000) * 60000;
    return asUtc - flooredActual;
}

/** Convert a wall-clock Y/M/D H:M in `timeZone` to the corresponding UTC Date. */
function zonedWallClockToUtc(
    timeZone: string,
    year: number,
    month: number,
    day: number,
    minutes: number,
): Date {
    const hour = Math.floor(minutes / 60);
    const minute = minutes % 60;
    const guess = Date.UTC(year, month - 1, day, hour, minute, 0);
    // Refine twice to settle DST boundaries.
    let offset = tzOffsetMs(new Date(guess), timeZone);
    let result = guess - offset;
    offset = tzOffsetMs(new Date(result), timeZone);
    result = guess - offset;
    return new Date(result);
}

/** Validate a WorkingHours object; returns null when it's unusable (→ always on). */
export function normalizeWorkingHours(wh: unknown): WorkingHours | null {
    if (!wh || typeof wh !== 'object') return null;
    const w = wh as Partial<WorkingHours>;
    const start = parseHm(w.start);
    const end = parseHm(w.end);
    const days = Array.isArray(w.days) ? w.days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6) : [];
    if (start === null || end === null || days.length === 0) return null;
    return { start: w.start!, end: w.end!, days };
}

/**
 * Is `now` inside the persona's working window?
 * No / invalid workingHours → always available (back-compat: 24/7).
 * Supports overnight windows (end <= start spans midnight).
 */
export function isWithinShift(
    workingHours: unknown,
    timeZone: string,
    now: Date = new Date(),
): boolean {
    const wh = normalizeWorkingHours(workingHours);
    if (!wh) return true;
    const tz = timeZone || 'UTC';
    const p = zonedParts(now, tz);
    const start = parseHm(wh.start)!;
    const end = parseHm(wh.end)!;
    const cur = p.hour * 60 + p.minute;

    if (start === end) return true; // full-day shift
    if (start < end) {
        return wh.days.includes(p.weekday) && cur >= start && cur < end;
    }
    // Overnight: active from `start` today through `end` tomorrow.
    if (cur >= start) return wh.days.includes(p.weekday);
    if (cur < end) {
        const prevWeekday = (p.weekday + 6) % 7;
        return wh.days.includes(prevWeekday);
    }
    return false;
}

/**
 * The next UTC instant the shift opens, searching up to 14 days ahead.
 * Returns null when workingHours is empty/invalid (always on → no next start).
 */
export function nextShiftStart(
    workingHours: unknown,
    timeZone: string,
    now: Date = new Date(),
): Date | null {
    const wh = normalizeWorkingHours(workingHours);
    if (!wh) return null;
    const tz = timeZone || 'UTC';
    const start = parseHm(wh.start)!;

    for (let offset = 0; offset <= 14; offset += 1) {
        const probe = new Date(now.getTime() + offset * 24 * 60 * 60 * 1000);
        const parts = zonedParts(probe, tz);
        if (!wh.days.includes(parts.weekday)) continue;
        const candidate = zonedWallClockToUtc(tz, parts.year, parts.month, parts.day, start);
        if (candidate.getTime() > now.getTime()) return candidate;
    }
    return null;
}

export type ShiftStatus = {
    available: boolean;
    /** ISO instant the shift next opens; null when available now or always-on. */
    nextWindowStart: string | null;
    timezone: string;
    workingHours: WorkingHours | null;
};

/** One-shot availability evaluation for an API response. */
export function evaluateShift(input: {
    workingHours: unknown;
    timezone: string;
    now?: Date;
}): ShiftStatus {
    const now = input.now ?? new Date();
    const tz = input.timezone || 'UTC';
    const wh = normalizeWorkingHours(input.workingHours);
    const available = isWithinShift(input.workingHours, tz, now);
    return {
        available,
        nextWindowStart: available ? null : nextShiftStart(input.workingHours, tz, now)?.toISOString() ?? null,
        timezone: tz,
        workingHours: wh,
    };
}
