import test from 'node:test';
import assert from 'node:assert/strict';
import {
    formatCustomApiCatalog,
    getCustomApiCatalogs,
    type CustomApiConnectorCatalog,
} from './custom-api-catalog-client.js';

const SAMPLE: CustomApiConnectorCatalog[] = [
    {
        connectorId: 'custom_api:t1:ws1',
        displayName: 'Acme Tickets',
        catalog: [
            { name: 'getTicket', description: 'Get a ticket', method: 'GET', path: '/tickets/{id}', requiredParams: ['id'] },
            { name: 'createTicket', description: 'Create a ticket', method: 'POST', path: '/tickets', requiredParams: [], hasBody: true },
        ],
    },
];

test('formatCustomApiCatalog lists each operation with method, path and required args', () => {
    const block = formatCustomApiCatalog(SAMPLE);
    assert.match(block, /Custom API operations/);
    assert.match(block, /operation="getTicket" \(GET \/tickets\/\{id\}\)/);
    assert.match(block, /required args: id/);
    assert.match(block, /operation="createTicket" \(POST \/tickets\)/);
    assert.match(block, /custom_api/);
});

test('formatCustomApiCatalog returns empty string when there are no catalogs', () => {
    assert.equal(formatCustomApiCatalog([]), '');
    assert.equal(formatCustomApiCatalog([{ connectorId: 'x', displayName: null, catalog: [] }]), '');
});

test('getCustomApiCatalogs returns [] when API_GATEWAY_URL is unset', async () => {
    const prev = process.env['API_GATEWAY_URL'];
    delete process.env['API_GATEWAY_URL'];
    try {
        const result = await getCustomApiCatalogs('t1');
        assert.deepEqual(result, []);
    } finally {
        if (prev !== undefined) process.env['API_GATEWAY_URL'] = prev;
    }
});

test('getCustomApiCatalogs sends tenant + bearer headers and parses connectors', async () => {
    process.env['API_GATEWAY_URL'] = 'http://gateway.test';
    process.env['CONNECTOR_EXEC_SHARED_TOKEN'] = 'svc-tok';
    const seen: { url: string; headers: Record<string, string> } = { url: '', headers: {} };
    const fakeFetch = (async (url: string | URL, init?: RequestInit) => {
        seen.url = String(url);
        seen.headers = (init?.headers ?? {}) as Record<string, string>;
        return new Response(JSON.stringify({ connectors: SAMPLE }), { status: 200 });
    }) as typeof fetch;

    const result = await getCustomApiCatalogs('tenant-9', 'ws-1', fakeFetch);
    assert.equal(result.length, 1);
    assert.equal(result[0]?.connectorId, 'custom_api:t1:ws1');
    assert.match(seen.url, /\/v1\/connectors\/custom-api-catalog\?workspace_id=ws-1/);
    assert.equal(seen.headers['x-tenant-id'], 'tenant-9');
    assert.equal(seen.headers['Authorization'], 'Bearer svc-tok');
});
