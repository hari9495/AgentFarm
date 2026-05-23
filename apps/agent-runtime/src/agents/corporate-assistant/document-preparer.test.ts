import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import { formatAsAgenda } from './document-preparer.js';

// ---------------------------------------------------------------------------
// formatAsAgenda — pure function tests (no mocking needed)
// ---------------------------------------------------------------------------

describe('formatAsAgenda', () => {
    it('formats items as a numbered list', () => {
        const result = formatAsAgenda(['Welcome', 'Q2 Review', 'AOB']);
        assert.equal(result, '1. Welcome\n2. Q2 Review\n3. AOB');
    });

    it('returns empty string for empty array', () => {
        assert.equal(formatAsAgenda([]), '');
    });
});

// ---------------------------------------------------------------------------
// createInternalDocument
// ---------------------------------------------------------------------------

describe('createInternalDocument', () => {
    let savedEnv: Record<string, string | undefined>;

    beforeEach(() => {
        savedEnv = {
            MCP_GOOGLE_DRIVE_URL: process.env['MCP_GOOGLE_DRIVE_URL'],
            MCP_CONFLUENCE_URL: process.env['MCP_CONFLUENCE_URL'],
        };
    });

    afterEach(() => {
        process.env['MCP_GOOGLE_DRIVE_URL'] = savedEnv['MCP_GOOGLE_DRIVE_URL'];
        process.env['MCP_CONFLUENCE_URL'] = savedEnv['MCP_CONFLUENCE_URL'];
        mock.reset();
    });

    it('returns documentId and url from provider response', async () => {
        process.env['MCP_GOOGLE_DRIVE_URL'] = 'http://localhost:9998';

        mock.method(global, 'fetch', async () => ({
            ok: true,
            json: async () => ({
                documentId: 'doc-001',
                url: 'https://drive.google.com/doc/001',
            }),
        }));

        const { createInternalDocument } = await import('./document-preparer.js');

        const result = await createInternalDocument({
            tenantId: 'tenant-1',
            botId: 'bot-1',
            title: 'Sprint retrospective notes',
            body: 'What went well: ...',
            provider: 'google_drive',
        });

        assert.equal(result.documentId, 'doc-001');
        assert.equal(result.url, 'https://drive.google.com/doc/001');
    });

    it('throws DocumentProviderUnavailableError when env var is unset', async () => {
        delete process.env['MCP_GOOGLE_DRIVE_URL'];

        const { createInternalDocument, DocumentProviderUnavailableError } =
            await import('./document-preparer.js');

        await assert.rejects(
            () =>
                createInternalDocument({
                    tenantId: 'tenant-1',
                    botId: 'bot-1',
                    title: 'Notes',
                    body: 'Content',
                    provider: 'google_drive',
                }),
            DocumentProviderUnavailableError,
        );
    });
});
