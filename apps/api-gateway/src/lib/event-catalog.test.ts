import test from 'node:test';
import assert from 'node:assert/strict';
import {
    CATALOG,
    isValidEventType,
    getEventDefinition,
    getAllEventTypes,
} from './event-catalog.js';

// 1. CATALOG has at least 8 event types
test('CATALOG has at least 8 event types', () => {
    const keys = Object.keys(CATALOG);
    assert.ok(
        keys.length >= 8,
        `Expected at least 8 event types in CATALOG, got ${keys.length}: ${keys.join(', ')}`,
    );
});

// 2. isValidEventType returns true for a known event type
test('isValidEventType returns true for a known event type', () => {
    assert.equal(isValidEventType('task_completed'), true);
});

// 3. isValidEventType returns false for an unknown string
test('isValidEventType returns false for an unknown event type', () => {
    assert.equal(isValidEventType('completely_made_up_event'), false);
});

// 4. getEventDefinition returns a definition with a schemaVersion field
test('getEventDefinition returns definition with schemaVersion field', () => {
    const def = getEventDefinition('task_completed');
    assert.ok(def !== null, 'Expected a definition, got null');
    assert.ok(
        typeof def.schemaVersion === 'string' && def.schemaVersion.length > 0,
        `Expected a non-empty schemaVersion string, got: ${JSON.stringify(def.schemaVersion)}`,
    );
});

// 5. getEventDefinition returns null for an unknown event type
test('getEventDefinition returns null for an unknown event type', () => {
    const def = getEventDefinition('not_a_real_event');
    assert.equal(def, null);
});

// 6. getAllEventTypes returns an array of non-empty strings
test('getAllEventTypes returns array of non-empty strings', () => {
    const types = getAllEventTypes();
    assert.ok(Array.isArray(types) && types.length > 0, 'Expected a non-empty array');
    for (const t of types) {
        assert.ok(
            typeof t === 'string' && t.length > 0,
            `Expected each element to be a non-empty string, got: ${JSON.stringify(t)}`,
        );
    }
});

// 7. Every EventDefinition has an examplePayload that includes the eventType field
test('every EventDefinition has examplePayload with eventType field', () => {
    for (const [key, def] of Object.entries(CATALOG)) {
        assert.ok(
            def.examplePayload !== null && typeof def.examplePayload === 'object',
            `${key}: examplePayload must be an object`,
        );
        assert.ok(
            'eventType' in def.examplePayload,
            `${key}: examplePayload must include an 'eventType' field`,
        );
        assert.equal(
            def.examplePayload['eventType'],
            key,
            `${key}: examplePayload.eventType must equal the catalog key`,
        );
    }
});
