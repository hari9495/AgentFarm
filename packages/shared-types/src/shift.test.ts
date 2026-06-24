import test from 'node:test';
import assert from 'node:assert/strict';
import { isWithinShift, nextShiftStart, evaluateShift, normalizeWorkingHours } from './shift.js';

const WEEKDAYS = [1, 2, 3, 4, 5]; // Mon–Fri
const nineToSix = { start: '09:00', end: '18:00', days: WEEKDAYS };

// 1. No workingHours → always available (back-compat 24/7)
test('isWithinShift — null/invalid workingHours is always on', () => {
    const now = new Date('2026-06-25T03:00:00Z'); // a Thursday, middle of night UTC
    assert.equal(isWithinShift(null, 'UTC', now), true);
    assert.equal(isWithinShift({ start: 'bad', end: 'x', days: [] }, 'UTC', now), true);
});

// 2. Inside window on a working day
test('isWithinShift — inside the window on a working day', () => {
    // Thu 2026-06-25 12:00 UTC
    const now = new Date('2026-06-25T12:00:00Z');
    assert.equal(isWithinShift(nineToSix, 'UTC', now), true);
});

// 3. Before the window
test('isWithinShift — before the window is closed', () => {
    const now = new Date('2026-06-25T08:30:00Z');
    assert.equal(isWithinShift(nineToSix, 'UTC', now), false);
});

// 4. After the window
test('isWithinShift — after the window is closed', () => {
    const now = new Date('2026-06-25T18:30:00Z');
    assert.equal(isWithinShift(nineToSix, 'UTC', now), false);
});

// 5. Weekend is closed
test('isWithinShift — weekend (not in days) is closed', () => {
    const now = new Date('2026-06-27T12:00:00Z'); // Saturday
    assert.equal(isWithinShift(nineToSix, 'UTC', now), false);
});

// 6. Timezone awareness — 12:00 UTC is 08:00 New York (before shift)
test('isWithinShift — respects IANA timezone', () => {
    const now = new Date('2026-06-25T12:00:00Z'); // 08:00 EDT
    assert.equal(isWithinShift(nineToSix, 'America/New_York', now), false);
    const later = new Date('2026-06-25T14:00:00Z'); // 10:00 EDT
    assert.equal(isWithinShift(nineToSix, 'America/New_York', later), true);
});

// 7. Overnight window spanning midnight
test('isWithinShift — overnight window (22:00–06:00)', () => {
    const overnight = { start: '22:00', end: '06:00', days: [1, 2, 3, 4, 5] };
    // Fri 23:00 UTC → in shift (Friday is a working day)
    assert.equal(isWithinShift(overnight, 'UTC', new Date('2026-06-26T23:00:00Z')), true);
    // Sat 03:00 UTC → still in the shift that started Friday night
    assert.equal(isWithinShift(overnight, 'UTC', new Date('2026-06-27T03:00:00Z')), true);
    // Sat 23:00 UTC → Saturday not a working day → closed
    assert.equal(isWithinShift(overnight, 'UTC', new Date('2026-06-27T23:00:00Z')), false);
});

// 8. nextShiftStart — same day later
test('nextShiftStart — returns today 09:00 when called before the window', () => {
    const now = new Date('2026-06-25T06:00:00Z'); // Thu 06:00
    const next = nextShiftStart(nineToSix, 'UTC', now);
    assert.ok(next);
    assert.equal(next!.toISOString(), '2026-06-25T09:00:00.000Z');
});

// 9. nextShiftStart — rolls to Monday over the weekend
test('nextShiftStart — skips weekend to next Monday', () => {
    const now = new Date('2026-06-27T12:00:00Z'); // Saturday
    const next = nextShiftStart(nineToSix, 'UTC', now);
    assert.ok(next);
    assert.equal(next!.toISOString(), '2026-06-29T09:00:00.000Z'); // Monday 09:00
});

// 10. nextShiftStart — null when always-on
test('nextShiftStart — null for empty workingHours', () => {
    assert.equal(nextShiftStart(null, 'UTC', new Date()), null);
});

// 11. evaluateShift — closed returns available:false + nextWindowStart
test('evaluateShift — closed window yields next start', () => {
    const now = new Date('2026-06-25T06:00:00Z');
    const status = evaluateShift({ workingHours: nineToSix, timezone: 'UTC', now });
    assert.equal(status.available, false);
    assert.equal(status.nextWindowStart, '2026-06-25T09:00:00.000Z');
    assert.deepEqual(status.workingHours, nineToSix);
});

// 12. evaluateShift — open window returns available:true, null next
test('evaluateShift — open window has no next start', () => {
    const now = new Date('2026-06-25T12:00:00Z');
    const status = evaluateShift({ workingHours: nineToSix, timezone: 'UTC', now });
    assert.equal(status.available, true);
    assert.equal(status.nextWindowStart, null);
});

// 13. normalizeWorkingHours — filters invalid days, rejects bad times
test('normalizeWorkingHours — validates shape', () => {
    assert.equal(normalizeWorkingHours({ start: '09:00', end: '17:00', days: [] }), null);
    assert.equal(normalizeWorkingHours({ start: '25:00', end: '17:00', days: [1] }), null);
    assert.deepEqual(normalizeWorkingHours({ start: '09:00', end: '17:00', days: [1, 9, 2] }), {
        start: '09:00',
        end: '17:00',
        days: [1, 2],
    });
});
