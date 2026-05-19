import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createEmbedFn } from './embedding-service.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFetchStub(
    status: number,
    body: unknown
): typeof globalThis.fetch {
    return async (_url, _init) => ({
        ok: status >= 200 && status < 300,
        status,
        statusText: status === 200 ? 'OK' : 'Error',
        text: async () => JSON.stringify(body),
        json: async () => body,
    } as Response);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createEmbedFn', () => {
    it('returns a 1536-element float array on success', async () => {
        const fakeVector = Array.from({ length: 1536 }, (_, i) => i * 0.001);
        const fakeResponse = { data: [{ embedding: fakeVector }] };

        globalThis.fetch = makeFetchStub(200, fakeResponse);

        const embed = createEmbedFn({
            endpoint: 'https://fake.openai.azure.com',
            deployment: 'text-embedding-3-small',
            apiKey: 'test-key',
        });

        const result = await embed('refactor auth module');
        assert.equal(result.length, 1536);
        assert.equal(result[0], 0);
        assert.ok(result[1] > 0);
    });

    it('throws when response is not ok', async () => {
        globalThis.fetch = makeFetchStub(401, { error: { message: 'Unauthorized' } });

        const embed = createEmbedFn({
            endpoint: 'https://fake.openai.azure.com',
            deployment: 'text-embedding-3-small',
            apiKey: 'bad-key',
        });

        await assert.rejects(
            () => embed('some text'),
            (err: Error) => {
                assert.ok(err.message.includes('401'));
                return true;
            }
        );
    });

    it('throws when input text is empty', async () => {
        const embed = createEmbedFn({
            endpoint: 'https://fake.openai.azure.com',
            deployment: 'text-embedding-3-small',
            apiKey: 'test-key',
        });

        await assert.rejects(
            () => embed(''),
            (err: Error) => {
                assert.ok(err instanceof TypeError);
                return true;
            }
        );
    });

    it('throws when response contains no embedding', async () => {
        globalThis.fetch = makeFetchStub(200, { data: [] });

        const embed = createEmbedFn({
            endpoint: 'https://fake.openai.azure.com',
            deployment: 'text-embedding-3-small',
            apiKey: 'test-key',
        });

        await assert.rejects(
            () => embed('some text'),
            (err: Error) => {
                assert.ok(err.message.includes('valid embedding vector'));
                return true;
            }
        );
    });

    it('uses correct URL with api-version query param', async () => {
        let capturedUrl = '';
        globalThis.fetch = async (url, _init) => {
            capturedUrl = String(url);
            return {
                ok: true,
                status: 200,
                json: async () => ({ data: [{ embedding: [0.1, 0.2] }] }),
            } as Response;
        };

        const embed = createEmbedFn({
            endpoint: 'https://my-resource.openai.azure.com',
            deployment: 'my-embed-model',
            apiKey: 'k',
            apiVersion: '2024-05-01',
        });

        await embed('hello');
        assert.ok(capturedUrl.includes('/openai/deployments/my-embed-model/embeddings'));
        assert.ok(capturedUrl.includes('api-version=2024-05-01'));
    });
});
