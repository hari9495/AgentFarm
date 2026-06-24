import test from 'node:test';
import assert from 'node:assert/strict';
import { parseOpenApiToToolCatalog, resolveOperation, type CustomApiTool } from './openapi-catalog.js';

const SAMPLE_SPEC = {
    openapi: '3.0.0',
    info: { title: 'Tickets API', version: '1.0.0' },
    paths: {
        '/tickets': {
            get: {
                operationId: 'listTickets',
                summary: 'List tickets',
                parameters: [
                    { name: 'status', in: 'query', required: false },
                    { name: 'limit', in: 'query', required: true },
                ],
            },
            post: {
                operationId: 'createTicket',
                summary: 'Create a ticket',
                requestBody: { content: { 'application/json': {} } },
            },
        },
        '/tickets/{id}': {
            get: { operationId: 'getTicket', summary: 'Get a ticket' },
            delete: { summary: 'Delete a ticket' }, // no operationId → name from METHOD + path
        },
    },
};

test('parseOpenApiToToolCatalog extracts one tool per operation', () => {
    const catalog = parseOpenApiToToolCatalog(SAMPLE_SPEC);
    assert.equal(catalog.length, 4);
    const names = catalog.map((t) => t.name).sort();
    assert.deepEqual(names, ['DELETE /tickets/{id}', 'createTicket', 'getTicket', 'listTickets']);
});

test('parse captures method, path params, query params, required params, and body', () => {
    const catalog = parseOpenApiToToolCatalog(SAMPLE_SPEC);
    const list = catalog.find((t) => t.name === 'listTickets')!;
    assert.equal(list.method, 'GET');
    assert.deepEqual(list.queryParams.sort(), ['limit', 'status']);
    assert.deepEqual(list.requiredParams, ['limit']);
    assert.equal(list.hasBody, false);

    const create = catalog.find((t) => t.name === 'createTicket')!;
    assert.equal(create.method, 'POST');
    assert.equal(create.hasBody, true);

    const get = catalog.find((t) => t.name === 'getTicket')!;
    assert.deepEqual(get.pathParams, ['id']);
    assert.deepEqual(get.requiredParams, ['id']);
});

test('parse is tolerant of malformed / empty specs', () => {
    assert.deepEqual(parseOpenApiToToolCatalog(null), []);
    assert.deepEqual(parseOpenApiToToolCatalog({}), []);
    assert.deepEqual(parseOpenApiToToolCatalog({ paths: 'nope' }), []);
    assert.deepEqual(parseOpenApiToToolCatalog({ paths: { '/x': { get: 'bad' } } }), []);
});

test('parse de-duplicates colliding tool names', () => {
    const spec = {
        paths: {
            '/a': { get: { operationId: 'dup' } },
            '/b': { get: { operationId: 'dup' } },
        },
    };
    const catalog = parseOpenApiToToolCatalog(spec);
    const names = catalog.map((t) => t.name).sort();
    assert.deepEqual(names, ['dup', 'dup#2']);
});

test('resolveOperation substitutes path params and appends query string', () => {
    const tool: CustomApiTool = {
        name: 'getTicket',
        description: 'Get a ticket',
        method: 'GET',
        path: '/tickets/{id}',
        pathParams: ['id'],
        queryParams: ['expand'],
        requiredParams: ['id'],
        hasBody: false,
    };
    const result = resolveOperation(tool, { id: 'ABC 1', expand: 'comments' });
    assert.equal(result.ok, true);
    if (result.ok) {
        assert.equal(result.request.method, 'GET');
        assert.equal(result.request.path, '/tickets/ABC%201?expand=comments');
        assert.equal(result.request.body, undefined);
    }
});

test('resolveOperation puts non-path/query args into the body for POST', () => {
    const tool: CustomApiTool = {
        name: 'createTicket',
        description: 'Create',
        method: 'POST',
        path: '/tickets',
        pathParams: [],
        queryParams: [],
        requiredParams: [],
        hasBody: true,
    };
    const result = resolveOperation(tool, { title: 'Bug', priority: 'high' });
    assert.equal(result.ok, true);
    if (result.ok) {
        assert.equal(result.request.method, 'POST');
        assert.equal(result.request.path, '/tickets');
        assert.deepEqual(result.request.body, { title: 'Bug', priority: 'high' });
    }
});

test('resolveOperation fails closed when a required param is missing', () => {
    const tool: CustomApiTool = {
        name: 'getTicket',
        description: 'Get',
        method: 'GET',
        path: '/tickets/{id}',
        pathParams: ['id'],
        queryParams: [],
        requiredParams: ['id'],
        hasBody: false,
    };
    const result = resolveOperation(tool, {});
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /Missing required parameter/);
});
