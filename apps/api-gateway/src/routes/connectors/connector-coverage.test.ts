// C3 — Connector coverage guard.
//
// Every connector advertised in CONNECTOR_REGISTRY must be consciously categorized into
// exactly one bucket below. This test FAILS CI when a connector is added (or advertised)
// without deciding how it executes — preventing the "shows in the UI but silently does
// nothing" class of bug. To add a connector: either give it a real executor branch in
// provider-clients.ts and list it under FIRST_CLASS / GENERIC_REST_BACKED, or explicitly
// acknowledge it under KNOWN_UNIMPLEMENTED (which the product surface must hide/disable).

import test from 'node:test';
import assert from 'node:assert/strict';
import { CONNECTOR_REGISTRY, type ConnectorTool } from '@agentfarm/connector-contracts';

// Connectors with a dedicated, real provider executor in provider-clients.ts.
const FIRST_CLASS: ReadonlySet<ConnectorTool> = new Set([
    'jira',
    'github',
    'slack',
    'teams',
    'gitlab',
    'linear',
    'asana',
    'trello',
    'clickup',
    'azure_devops',
    'gmail',
    'outlook',
    'hubspot',
    'salesforce',
]);

// Connectors that execute through the generic REST / SMTP escape hatch (custom_api / email
// executors). They are runnable today via a configured base_url + auth.
const GENERIC_REST_BACKED: ReadonlySet<ConnectorTool> = new Set([
    'generic_rest',
    'generic_rest_code',
    'generic_rest_email',
    'generic_rest_messaging',
    'generic_smtp',
]);

// Connectors that are advertised but DO NOT yet have a real executor. These must be hidden
// or disabled in the product surface until implemented. Shrinking this set is the C2/H-tier
// roadmap. Adding to it is a conscious decision, never a silent default.
const KNOWN_UNIMPLEMENTED: ReadonlySet<ConnectorTool> = new Set([
    'amazon_connect',
    'generic_telephony',
    'genesys',
    'monday',
    'twilio',
    'vonage',
]);

test('every advertised connector is categorized (executor, generic-REST, or known-unimplemented)', () => {
    const uncategorized: ConnectorTool[] = [];
    for (const entry of CONNECTOR_REGISTRY) {
        const tool = entry.tool;
        const categorized =
            FIRST_CLASS.has(tool) || GENERIC_REST_BACKED.has(tool) || KNOWN_UNIMPLEMENTED.has(tool);
        if (!categorized) uncategorized.push(tool);
    }
    assert.deepEqual(
        uncategorized,
        [],
        `Connector(s) advertised in CONNECTOR_REGISTRY but not categorized: ${uncategorized.join(', ')}. ` +
            `Add a real executor (FIRST_CLASS), route via generic REST (GENERIC_REST_BACKED), ` +
            `or explicitly mark KNOWN_UNIMPLEMENTED in connector-coverage.test.ts.`,
    );
});

test('the categorization buckets are mutually exclusive', () => {
    const all = [...FIRST_CLASS, ...GENERIC_REST_BACKED, ...KNOWN_UNIMPLEMENTED];
    const seen = new Set<string>();
    const dupes: string[] = [];
    for (const t of all) {
        if (seen.has(t)) dupes.push(t);
        seen.add(t);
    }
    assert.deepEqual(dupes, [], `Connector(s) appear in more than one bucket: ${dupes.join(', ')}`);
});

test('categorization references only real registry connectors (no stale entries)', () => {
    const registryTools = new Set(CONNECTOR_REGISTRY.map((e) => e.tool));
    const stale = [...FIRST_CLASS, ...GENERIC_REST_BACKED, ...KNOWN_UNIMPLEMENTED].filter(
        (t) => !registryTools.has(t),
    );
    assert.deepEqual(stale, [], `Categorized connector(s) no longer in CONNECTOR_REGISTRY: ${stale.join(', ')}`);
});
