import test from 'node:test';
import assert from 'node:assert/strict';
import {
    CATALOG,
    isValidEventType,
    getEventDefinition,
    getAllEventTypes,
} from './event-catalog.js';

// 1. CATALOG has at least 15 event types (previously 8; now includes budget alert variants,
//    connector action events, and bot_version_restored)
test('CATALOG has at least 15 event types', () => {
    const keys = Object.keys(CATALOG);
    assert.ok(
        keys.length >= 15,
        `Expected at least 15 event types in CATALOG, got ${keys.length}: ${keys.join(', ')}`,
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

// 8. New budget alert variant event types are in the catalog
test('budget_alert_warn is a valid event type', () => {
    assert.equal(isValidEventType('budget_alert_warn'), true);
});

test('budget_alert_critical is a valid event type', () => {
    assert.equal(isValidEventType('budget_alert_critical'), true);
});

test('budget_alert_exceeded is a valid event type', () => {
    assert.equal(isValidEventType('budget_alert_exceeded'), true);
});

// 9. Connector action event types (underscore) are in the catalog
test('connector_action_executed is a valid event type', () => {
    assert.equal(isValidEventType('connector_action_executed'), true);
});

test('connector_action_failed is a valid event type', () => {
    assert.equal(isValidEventType('connector_action_failed'), true);
});

// 10. bot_version_restored is in the catalog
test('bot_version_restored is a valid event type', () => {
    assert.equal(isValidEventType('bot_version_restored'), true);
});

// 11. Dot-notation event type strings are NOT valid (regression guard for BUG 1 fix)
test('dot-notation event types are rejected as invalid', () => {
    assert.equal(isValidEventType('agent.paused'), false);
    assert.equal(isValidEventType('agent.resumed'), false);
    assert.equal(isValidEventType('connector_action.executed'), false);
    assert.equal(isValidEventType('connector_action.failed'), false);
    assert.equal(isValidEventType('bot.version.restore'), false);
});

// 12. agent_paused and agent_resumed catalog entries dispatch relevant fields
test('agent_paused catalog entry has botId field', () => {
    const def = getEventDefinition('agent_paused');
    assert.ok(def !== null);
    const fieldNames = def.fields.map((f) => f.name);
    assert.ok(fieldNames.includes('botId'), 'agent_paused must have a botId field');
});

test('agent_resumed catalog entry has botId field', () => {
    const def = getEventDefinition('agent_resumed');
    assert.ok(def !== null);
    const fieldNames = def.fields.map((f) => f.name);
    assert.ok(fieldNames.includes('botId'), 'agent_resumed must have a botId field');
});

// 13. No catalog key uses dot notation
test('no catalog key uses dot notation', () => {
    for (const key of Object.keys(CATALOG)) {
        assert.ok(
            !key.includes('.'),
            `Catalog key "${key}" must not use dot notation — use underscores instead`,
        );
    }
});

// 14. getAllEventTypes result does not include any dot-notation keys
test('getAllEventTypes does not include dot-notation keys', () => {
    for (const key of getAllEventTypes()) {
        assert.ok(
            !key.includes('.'),
            `getAllEventTypes returned dot-notation key "${key}"`,
        );
    }
});
