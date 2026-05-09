import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
    getZohoSignAccessToken,
    uploadContractDocument,
    submitDocumentForSigning,
    getDocumentStatus,
    downloadSignedDocument,
} from './zoho-sign-client.js';

// ---------------------------------------------------------------------------
// Helper: build a minimal fetch mock response
// ---------------------------------------------------------------------------
function mockFetch(response: unknown, ok = true, status = 200) {
    return () =>
        Promise.resolve({
            ok,
            status,
            json: async () => response,
            text: async () => JSON.stringify(response),
            arrayBuffer: async () => new ArrayBuffer(8),
        });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('zoho-sign-client', () => {
    test('getZohoSignAccessToken returns token on success', async (t) => {
        process.env['ZOHO_CLIENT_ID'] = 'test-client-id';
        process.env['ZOHO_CLIENT_SECRET'] = 'test-client-secret';

        t.mock.method(
            globalThis,
            'fetch',
            mockFetch({ access_token: 'zoho-access-token-123' }),
        );

        const token = await getZohoSignAccessToken();
        assert.equal(token, 'zoho-access-token-123');
    });

    test('getZohoSignAccessToken throws on OAuth error', async (t) => {
        process.env['ZOHO_CLIENT_ID'] = 'test-client-id';
        process.env['ZOHO_CLIENT_SECRET'] = 'test-client-secret';

        t.mock.method(
            globalThis,
            'fetch',
            mockFetch({ error: 'invalid_client' }, false, 401),
        );

        await assert.rejects(
            () => getZohoSignAccessToken(),
            (err: Error) => {
                assert.ok(err.message.includes('Zoho OAuth failed'));
                return true;
            },
        );
    });

    test('uploadContractDocument returns requestId and documentId', async (t) => {
        process.env['ZOHO_CLIENT_ID'] = 'test-client-id';
        process.env['ZOHO_CLIENT_SECRET'] = 'test-client-secret';

        // Two sequential fetch calls: token then upload
        let callCount = 0;
        t.mock.method(globalThis, 'fetch', () => {
            callCount++;
            if (callCount === 1) {
                // Token request
                return Promise.resolve({
                    ok: true,
                    status: 200,
                    json: async () => ({ access_token: 'tok-abc' }),
                    text: async () => '{"access_token":"tok-abc"}',
                });
            }
            // Upload request
            return Promise.resolve({
                ok: true,
                status: 200,
                json: async () => ({
                    requests: {
                        request_id: 'req-001',
                        document_ids: [{ document_id: 'doc-001' }],
                    },
                }),
                text: async () => '',
            });
        });

        const result = await uploadContractDocument({
            pdfBuffer: Buffer.from('%PDF-1.4 fake'),
            fileName: 'contract.pdf',
            recipientName: 'Alice Smith',
            recipientEmail: 'alice@example.com',
            requestName: 'Service Agreement',
        });

        assert.equal(result.requestId, 'req-001');
        assert.equal(result.documentId, 'doc-001');
    });

    test('submitDocumentForSigning returns true on success', async (t) => {
        process.env['ZOHO_CLIENT_ID'] = 'test-client-id';
        process.env['ZOHO_CLIENT_SECRET'] = 'test-client-secret';

        let callCount = 0;
        t.mock.method(globalThis, 'fetch', () => {
            callCount++;
            if (callCount === 1) {
                return Promise.resolve({
                    ok: true,
                    status: 200,
                    json: async () => ({ access_token: 'tok-xyz' }),
                    text: async () => '',
                });
            }
            return Promise.resolve({
                ok: true,
                status: 200,
                json: async () => ({ code: 0, message: 'OK' }),
                text: async () => '',
            });
        });

        const result = await submitDocumentForSigning('req-001');
        assert.equal(result, true);
    });

    test('getDocumentStatus returns status object', async (t) => {
        process.env['ZOHO_CLIENT_ID'] = 'test-client-id';
        process.env['ZOHO_CLIENT_SECRET'] = 'test-client-secret';

        let callCount = 0;
        t.mock.method(globalThis, 'fetch', () => {
            callCount++;
            if (callCount === 1) {
                return Promise.resolve({
                    ok: true,
                    status: 200,
                    json: async () => ({ access_token: 'tok-xyz' }),
                    text: async () => '',
                });
            }
            return Promise.resolve({
                ok: true,
                status: 200,
                json: async () => ({
                    requests: {
                        request_status: 'completed',
                        completed_time: '2025-01-15T10:30:00Z',
                        actions: [{ recipient_email: 'alice@example.com' }],
                    },
                }),
                text: async () => '',
            });
        });

        const status = await getDocumentStatus('req-001');
        assert.equal(status.status, 'completed');
        assert.equal(status.signerEmail, 'alice@example.com');
        assert.equal(status.completedAt, '2025-01-15T10:30:00Z');
    });

    test('downloadSignedDocument returns Buffer', async (t) => {
        process.env['ZOHO_CLIENT_ID'] = 'test-client-id';
        process.env['ZOHO_CLIENT_SECRET'] = 'test-client-secret';

        const fakePdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF

        let callCount = 0;
        t.mock.method(globalThis, 'fetch', () => {
            callCount++;
            if (callCount === 1) {
                return Promise.resolve({
                    ok: true,
                    status: 200,
                    json: async () => ({ access_token: 'tok-xyz' }),
                    text: async () => '',
                });
            }
            return Promise.resolve({
                ok: true,
                status: 200,
                json: async () => ({}),
                text: async () => '',
                arrayBuffer: async () => fakePdfBytes.buffer,
            });
        });

        const buf = await downloadSignedDocument('req-001');
        assert.ok(Buffer.isBuffer(buf));
        assert.equal(buf[0], 0x25); // %
        assert.equal(buf[1], 0x50); // P
    });
});
