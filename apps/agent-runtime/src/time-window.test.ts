import test from 'node:test';
import assert from 'node:assert/strict';

import { isWithinWindow, isTimeDenied } from './time-window.js';

test('A1: same-day window — inside vs outside', () => {
    const now = new Date('2026-06-26T13:00:00Z');
    assert.equal(isWithinWindow({ start: '09:00', end: '17:00', tz: 'UTC' }, now), true);
    assert.equal(isWithinWindow({ start: '14:00', end: '17:00', tz: 'UTC' }, now), false);
});

test('A2: overnight window wraps past midnight', () => {
    const w = { start: '22:00', end: '06:00', tz: 'UTC' };
    assert.equal(isWithinWindow(w, new Date('2026-06-26T23:30:00Z')), true);
    assert.equal(isWithinWindow(w, new Date('2026-06-26T02:00:00Z')), true);
    assert.equal(isWithinWindow(w, new Date('2026-06-26T12:00:00Z')), false);
});

test('A3: day-of-week filter (UTC local day == getUTCDay)', () => {
    const now = new Date('2026-06-26T13:00:00Z');
    const day = now.getUTCDay();
    assert.equal(isWithinWindow({ start: '09:00', end: '17:00', tz: 'UTC', days: [day] }, now), true);
    assert.equal(isWithinWindow({ start: '09:00', end: '17:00', tz: 'UTC', days: [(day + 1) % 7] }, now), false);
});

test('A4: timezone is honored — same instant differs by tz', () => {
    // 02:30 UTC == 22:30 previous day in America/New_York (EDT, UTC-4 in June)
    const now = new Date('2026-06-26T02:30:00Z');
    assert.equal(isWithinWindow({ start: '22:00', end: '23:00', tz: 'America/New_York' }, now), true);
    assert.equal(isWithinWindow({ start: '22:00', end: '23:00', tz: 'UTC' }, now), false);
});

test('A5: unknown/invalid tz falls back to UTC (no throw)', () => {
    const now = new Date('2026-06-26T13:00:00Z');
    assert.equal(isWithinWindow({ start: '09:00', end: '17:00', tz: 'Mars/Phobos' }, now), true);
});

test('A6: isTimeDenied — deny when OUTSIDE the allowed window; no window → not denied', () => {
    const now = new Date('2026-06-26T20:00:00Z'); // outside 09-17
    assert.equal(isTimeDenied({ actionType: '*', effect: 'deny', timeWindow: { start: '09:00', end: '17:00', tz: 'UTC' } }, now), true);
    const inHours = new Date('2026-06-26T13:00:00Z');
    assert.equal(isTimeDenied({ actionType: '*', effect: 'deny', timeWindow: { start: '09:00', end: '17:00', tz: 'UTC' } }, inHours), false);
    assert.equal(isTimeDenied({ actionType: '*', effect: 'deny' }, now), false);
});
