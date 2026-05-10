import test from 'node:test';
import assert from 'node:assert/strict';
import { validate } from './validate.js';

test('required field missing returns valid: false with error message', () => {
    const result = validate({}, { name: { required: true, type: 'string' } });
    assert.equal(result.valid, false);
    assert.ok(result.errors.length > 0);
    assert.ok(result.errors[0]?.includes('name'));
});

test('required field present returns valid: true', () => {
    const result = validate({ name: 'Alice' }, { name: { required: true, type: 'string' } });
    assert.equal(result.valid, true);
    assert.deepEqual(result.errors, []);
});

test('string exceeding maxLength returns valid: false', () => {
    const result = validate({ name: 'hello world' }, { name: { type: 'string', maxLength: 5 } });
    assert.equal(result.valid, false);
    assert.ok(result.errors[0]?.includes('name'));
});

test('string within maxLength returns valid: true', () => {
    const result = validate({ name: 'hi' }, { name: { type: 'string', maxLength: 5 } });
    assert.equal(result.valid, true);
});

test('uuid type validates correct UUID format', () => {
    const result = validate(
        { id: '550e8400-e29b-41d4-a716-446655440000' },
        { id: { type: 'uuid' } },
    );
    assert.equal(result.valid, true);
});

test('uuid type rejects non-UUID string', () => {
    const result = validate({ id: 'not-a-uuid' }, { id: { type: 'uuid' } });
    assert.equal(result.valid, false);
    assert.ok(result.errors[0]?.includes('id'));
});

test('email pattern rejects invalid email', () => {
    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const result = validate(
        { email: 'notanemail' },
        { email: { type: 'string', pattern: EMAIL_RE } },
    );
    assert.equal(result.valid, false);
    assert.ok(result.errors[0]?.includes('email'));
});

test('email pattern accepts valid email', () => {
    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const result = validate(
        { email: 'user@example.com' },
        { email: { type: 'string', pattern: EMAIL_RE } },
    );
    assert.equal(result.valid, true);
});

test('multiple errors: returns first error only via errors[0]', () => {
    const result = validate({}, {
        a: { required: true },
        b: { required: true },
        c: { required: true },
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.length >= 2);
    // errors[0] is accessible and references the first failed field
    assert.ok(typeof result.errors[0] === 'string');
});

test('empty schema with empty data returns valid: true', () => {
    const result = validate({}, {});
    assert.equal(result.valid, true);
    assert.deepEqual(result.errors, []);
});

test('minLength rejects string shorter than minimum', () => {
    const result = validate({ pw: 'abc' }, { pw: { type: 'string', minLength: 8 } });
    assert.equal(result.valid, false);
    assert.ok(result.errors[0]?.includes('pw'));
});

test('optional field missing is not an error', () => {
    const result = validate({}, { optionalField: { type: 'string', maxLength: 100 } });
    assert.equal(result.valid, true);
});
