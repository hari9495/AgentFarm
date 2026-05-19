import test from 'node:test';
import assert from 'node:assert/strict';
import {
    isDisclosurePresent,
    formatDisclosure,
    enforceDisclosure,
    buildDisclosureAuditNote,
} from './disclosure-guard.js';
import type { OutboundChannel } from './disclosure-guard.js';

const STATEMENT = 'This message was sent by an AI agent.';

// ── isDisclosurePresent ───────────────────────────────────────────────────────

test('isDisclosurePresent — statement present → true', () => {
    const body = `Hello!\n\n---\n${STATEMENT}`;
    assert.ok(isDisclosurePresent(body, STATEMENT));
});

test('isDisclosurePresent — statement absent → false', () => {
    assert.ok(!isDisclosurePresent('Hello! How can I help?', STATEMENT));
});

test('isDisclosurePresent — case-insensitive match → true', () => {
    const upper = STATEMENT.toUpperCase();
    assert.ok(isDisclosurePresent(`Hello!\n${upper}`, STATEMENT));
});

test('isDisclosurePresent — empty body → false', () => {
    assert.ok(!isDisclosurePresent('', STATEMENT));
});

test('isDisclosurePresent — empty statement → false', () => {
    assert.ok(!isDisclosurePresent('Hello!', ''));
});

// ── formatDisclosure ──────────────────────────────────────────────────────────

const channels: OutboundChannel[] = ['email', 'slack', 'pr', 'meeting', 'chat'];

for (const channel of channels) {
    test(`formatDisclosure — channel=${channel} contains disclosure statement`, () => {
        const formatted = formatDisclosure({ disclosureStatement: STATEMENT, channel });
        assert.ok(
            formatted.includes(STATEMENT),
            `Expected formatted output to contain statement for channel=${channel}`,
        );
    });
}

test('formatDisclosure — email uses separator', () => {
    const formatted = formatDisclosure({ disclosureStatement: STATEMENT, channel: 'email' });
    assert.ok(formatted.includes('---'));
});

test('formatDisclosure — slack uses blockquote', () => {
    const formatted = formatDisclosure({ disclosureStatement: STATEMENT, channel: 'slack' });
    assert.ok(formatted.includes('>'));
});

test('formatDisclosure — pr includes bold notice', () => {
    const formatted = formatDisclosure({ disclosureStatement: STATEMENT, channel: 'pr' });
    assert.ok(formatted.includes('**'));
});

test('formatDisclosure — agentDisplayName appended', () => {
    const formatted = formatDisclosure({
        disclosureStatement: STATEMENT,
        agentDisplayName: 'Alex',
        channel: 'email',
    });
    assert.ok(formatted.includes('Alex'));
});

// ── enforceDisclosure ─────────────────────────────────────────────────────────

test('enforceDisclosure — already present → not modified', () => {
    const body = `Hi!\n\n---\n${STATEMENT}`;
    const result = enforceDisclosure(body, { disclosureStatement: STATEMENT, channel: 'email' });
    assert.equal(result.wasModified, false);
    assert.equal(result.body, body);
});

test('enforceDisclosure — absent → appended + wasModified=true', () => {
    const body = 'Hi! Please review the PR.';
    const result = enforceDisclosure(body, { disclosureStatement: STATEMENT, channel: 'pr' });
    assert.equal(result.wasModified, true);
    assert.ok(result.body.includes(STATEMENT));
    assert.ok(result.body.startsWith(body));
});

test('enforceDisclosure — email channel formats with separator', () => {
    const body = 'Meeting summary here.';
    const result = enforceDisclosure(body, { disclosureStatement: STATEMENT, channel: 'email' });
    assert.ok(result.body.includes('---'));
});

// ── buildDisclosureAuditNote ──────────────────────────────────────────────────

test('buildDisclosureAuditNote — injected includes disclosure_injected', () => {
    const note = buildDisclosureAuditNote('email', true, 'user@ext.com');
    assert.ok(note.includes('disclosure_injected'));
    assert.ok(note.includes('email'));
    assert.ok(note.includes('user@ext.com'));
});

test('buildDisclosureAuditNote — not modified includes disclosure_present', () => {
    const note = buildDisclosureAuditNote('slack', false);
    assert.ok(note.includes('disclosure_present'));
    assert.ok(note.includes('slack'));
});
