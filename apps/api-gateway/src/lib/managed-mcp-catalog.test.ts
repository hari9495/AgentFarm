import test from 'node:test';
import assert from 'node:assert/strict';
import {
    MANAGED_MCP_CATALOG,
    findConnectorById,
    buildConnectorHeaders,
} from './managed-mcp-catalog.js';

test('catalog has grown beyond the original 6 and every entry is well-formed', () => {
    assert.ok(MANAGED_MCP_CATALOG.length >= 12, `expected >=12 managed connectors, got ${MANAGED_MCP_CATALOG.length}`);
    for (const c of MANAGED_MCP_CATALOG) {
        assert.ok(c.id && typeof c.id === 'string', 'id');
        assert.ok(c.displayName, `${c.id} displayName`);
        assert.ok(c.category, `${c.id} category`);
        assert.ok(c.serverUrl.startsWith('https://'), `${c.id} serverUrl`);
        assert.ok(c.requiredFields.length > 0, `${c.id} requiredFields`);
        assert.ok(c.tools.length > 0, `${c.id} tools`);
        assert.ok(c.supportedRoles.length > 0, `${c.id} supportedRoles`);
    }
});

test('connector ids are unique', () => {
    const ids = MANAGED_MCP_CATALOG.map((c) => c.id);
    assert.equal(new Set(ids).size, ids.length, 'duplicate connector id');
});

test('newly added connectors are present and discoverable', () => {
    for (const id of ['gitlab', 'sentry', 'asana', 'postgres', 'google-drive', 'hubspot']) {
        assert.ok(findConnectorById(id), `connector ${id} should be in the catalog`);
    }
});

test('catalog covers the non-dev agent domains (support, CRM, recruiting, marketing, payments, docs)', () => {
    for (const id of ['zendesk', 'intercom', 'freshdesk', 'pipedrive', 'greenhouse', 'mailchimp', 'google-analytics', 'stripe', 'confluence', 'airtable']) {
        assert.ok(findConnectorById(id), `connector ${id} should be in the catalog`);
    }
    const categories = new Set(MANAGED_MCP_CATALOG.map((c) => c.category));
    for (const cat of ['Support', 'CRM', 'Recruiting', 'Marketing', 'Payments']) {
        assert.ok(categories.has(cat), `catalog should cover the "${cat}" domain`);
    }
});

test('buildConnectorHeaders maps the token field to a Bearer Authorization header', () => {
    const gitlab = findConnectorById('gitlab')!;
    const headers = buildConnectorHeaders(gitlab, { token: 'glpat-abc', base_url: 'https://gitlab.example.com' });
    assert.equal(headers['Authorization'], 'Bearer glpat-abc');
    assert.equal(headers['X-Connector-base_url'], 'https://gitlab.example.com');
});
