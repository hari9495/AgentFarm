import { test } from 'node:test';
import * as assert from 'node:assert';
import { stripPii, containsPii, REDACTED } from './pii-filter.js';

// ── stripPii — flat object ────────────────────────────────────────────────────

test('stripPii redacts email field', () => {
    const result = stripPii({ email: 'user@example.com', name: 'Alice' }) as Record<string, unknown>;
    assert.equal(result.email, REDACTED);
    assert.equal(result.name, 'Alice');
});

test('stripPii redacts password field', () => {
    const result = stripPii({ password: 'secret123' }) as Record<string, unknown>;
    assert.equal(result.password, REDACTED);
});

test('stripPii is case-insensitive for field names', () => {
    const result = stripPii({ Email: 'x@y.com', API_KEY: 'abc' }) as Record<string, unknown>;
    assert.equal(result.Email, REDACTED);
    assert.equal(result.API_KEY, REDACTED);
});

test('stripPii does not redact non-PII fields', () => {
    const result = stripPii({ taskId: 'task_1', status: 'running' }) as Record<string, unknown>;
    assert.equal(result.taskId, 'task_1');
    assert.equal(result.status, 'running');
});

// ── stripPii — nested object ──────────────────────────────────────────────────

test('stripPii recursively strips nested PII', () => {
    const input = {
        user: {
            id: 'u_1',
            contact: {
                email: 'user@example.com',
                phone: '+1555',
            },
        },
    };
    const result = stripPii(input) as { user: { contact: { email: string; phone: string }; id: string } };
    assert.equal(result.user.id, 'u_1');
    assert.equal(result.user.contact.email, REDACTED);
    assert.equal(result.user.contact.phone, REDACTED);
});

test('stripPii does not mutate the original object', () => {
    const input = { email: 'x@y.com', name: 'Bob' };
    stripPii(input);
    assert.equal(input.email, 'x@y.com'); // unchanged
});

// ── stripPii — array ──────────────────────────────────────────────────────────

test('stripPii walks arrays and strips PII in each element', () => {
    const input = [{ email: 'a@b.com' }, { email: 'c@d.com', name: 'Carol' }];
    const result = stripPii(input) as Array<{ email: string; name?: string }>;
    assert.equal(result[0].email, REDACTED);
    assert.equal(result[1].email, REDACTED);
    assert.equal(result[1].name, 'Carol');
});

// ── stripPii — primitives pass through ────────────────────────────────────────

test('stripPii returns strings, numbers, booleans unchanged', () => {
    assert.equal(stripPii('hello'), 'hello');
    assert.equal(stripPii(42), 42);
    assert.equal(stripPii(true), true);
    assert.equal(stripPii(null), null);
});

// ── containsPii ───────────────────────────────────────────────────────────────

test('containsPii returns true for flat PII field', () => {
    assert.equal(containsPii({ email: 'x' }), true);
});

test('containsPii returns false for clean object', () => {
    assert.equal(containsPii({ taskId: 'task_1', type: 'file_read' }), false);
});

test('containsPii detects deeply nested PII', () => {
    assert.equal(containsPii({ wrapper: { inner: { ssn: '123' } } }), true);
});

test('containsPii detects PII in arrays', () => {
    assert.equal(containsPii([{ token: 'abc' }]), true);
});

test('containsPii returns false for empty object', () => {
    assert.equal(containsPii({}), false);
});
