import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPersonaForBot, clearPersonaCache } from './persona-context-loader.js';
import type { AgentPersonaRecord } from '@agentfarm/shared-types';

const MOCK_PERSONA: AgentPersonaRecord = {
    id: 'persona_1',
    botId: 'bot_1',
    tenantId: 'tenant_1',
    displayName: 'Alex',
    emailAddress: 'alex@agentfarm.ai',
    avatarUrl: null,
    communicationStyle: 'professional',
    disclosureStatement: 'This message was sent by an AI agent.',
    language: 'en',
    timezone: 'UTC',
    workingHours: null,
    createdAt: '2026-05-15T00:00:00.000Z',
    updatedAt: '2026-05-15T00:00:00.000Z',
};

function setupEnv() {
    process.env['GATEWAY_URL'] = 'http://localhost:4000';
    process.env['INTERNAL_SERVICE_TOKEN'] = 'test-token';
}

function teardownEnv() {
    delete process.env['GATEWAY_URL'];
    delete process.env['INTERNAL_SERVICE_TOKEN'];
}

test.afterEach(() => {
    clearPersonaCache();
});

test('200 response — returns persona record', async (t) => {
    setupEnv();
    t.mock.method(globalThis, 'fetch', async () => ({
        ok: true,
        status: 200,
        json: async () => ({ persona: MOCK_PERSONA }),
    }));

    const result = await loadPersonaForBot('bot_1', 'tenant_1');
    assert.deepEqual(result, MOCK_PERSONA);
    teardownEnv();
});

test('404 response — returns null', async (t) => {
    setupEnv();
    t.mock.method(globalThis, 'fetch', async () => ({
        ok: false,
        status: 404,
        json: async () => ({ error: 'persona_not_found' }),
    }));

    const result = await loadPersonaForBot('bot_1', 'tenant_1');
    assert.equal(result, null);
    teardownEnv();
});

test('network error — returns null (graceful degradation)', async (t) => {
    setupEnv();
    t.mock.method(globalThis, 'fetch', async () => {
        throw new Error('ECONNREFUSED');
    });

    const result = await loadPersonaForBot('bot_1', 'tenant_1');
    assert.equal(result, null);
    teardownEnv();
});

test('cache hit — fetch called only once on second call', async (t) => {
    setupEnv();
    let callCount = 0;
    t.mock.method(globalThis, 'fetch', async () => {
        callCount++;
        return {
            ok: true,
            status: 200,
            json: async () => ({ persona: MOCK_PERSONA }),
        };
    });

    const first = await loadPersonaForBot('bot_1', 'tenant_1');
    const second = await loadPersonaForBot('bot_1', 'tenant_1');

    assert.deepEqual(first, MOCK_PERSONA);
    assert.deepEqual(second, MOCK_PERSONA);
    assert.equal(callCount, 1, 'fetch should be called only once due to cache');
    teardownEnv();
});

test('missing GATEWAY_URL — returns null without calling fetch', async (t) => {
    delete process.env['GATEWAY_URL'];
    let callCount = 0;
    t.mock.method(globalThis, 'fetch', async () => {
        callCount++;
        return { ok: true, status: 200, json: async () => ({ persona: MOCK_PERSONA }) };
    });

    const result = await loadPersonaForBot('bot_1', 'tenant_1');
    assert.equal(result, null);
    assert.equal(callCount, 0, 'fetch should not be called when GATEWAY_URL is missing');
});
