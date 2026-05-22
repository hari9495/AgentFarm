/**
 * Corporate Assistant — Document Preparer
 *
 * Handles document creation and updating through document-store MCP connectors
 * (Google Drive, Confluence, or any compatible MCP document tool).
 *
 * Design decisions:
 *   - createInternalDocument and updateExistingDocument call the provider's
 *     MCP server. No direct Google / Confluence SDK calls are made here.
 *   - formatAsAgenda is a pure function — no IO.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CreateDocumentParams = {
    tenantId: string;
    botId: string;
    title: string;
    body: string;
    provider: 'google_drive' | 'confluence' | string;
    parentId?: string;
};

export type CreateDocumentResult = {
    documentId: string;
    url: string | null;
};

export type UpdateDocumentParams = {
    tenantId: string;
    botId: string;
    documentId: string;
    mode: 'append' | 'replace';
    content: string;
    provider: 'google_drive' | 'confluence' | string;
};

export type UpdateDocumentResult = {
    updated: boolean;
};

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class DocumentProviderUnavailableError extends Error {
    constructor(provider: string) {
        super(
            `Document provider "${provider}" is not available. ` +
            `Check that the corresponding MCP_*_URL env var is set.`,
        );
        this.name = 'DocumentProviderUnavailableError';
    }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const PROVIDER_ENV_MAP: Record<string, string> = {
    google_drive: 'MCP_GOOGLE_DRIVE_URL',
    confluence: 'MCP_CONFLUENCE_URL',
};

function resolveProviderUrl(provider: string): string {
    const envKey = PROVIDER_ENV_MAP[provider] ?? `MCP_${provider.toUpperCase()}_URL`;
    const url = (process.env[envKey] ?? '').trim();
    if (!url) throw new DocumentProviderUnavailableError(provider);
    return url;
}

async function callDocumentMcp<T extends Record<string, unknown>>(
    tool: string,
    input: Record<string, unknown>,
    provider: string,
): Promise<T> {
    const baseUrl = resolveProviderUrl(provider);
    const url = `${baseUrl}/tools/${tool}`;

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
    });

    if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(
            `Document MCP call failed [${provider}/${tool}]: HTTP ${response.status} — ${text.slice(0, 200)}`,
        );
    }

    return response.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create a new internal document via the specified document-store MCP connector.
 *
 * Returns the created document's ID and an optional URL. Both Google Drive and
 * Confluence connectors are supported; the connector is selected via `provider`.
 */
export async function createInternalDocument(
    params: CreateDocumentParams,
): Promise<CreateDocumentResult> {
    const result = await callDocumentMcp<{
        documentId?: string;
        document_id?: string;
        url?: string | null;
    }>(
        'create_document',
        {
            tenantId: params.tenantId,
            botId: params.botId,
            title: params.title,
            body: params.body,
            parentId: params.parentId ?? null,
        },
        params.provider,
    );

    const documentId = result.documentId ?? result.document_id;
    if (!documentId) {
        throw new Error(
            `Document provider "${params.provider}" returned no documentId.`,
        );
    }

    return {
        documentId,
        url: result.url ?? null,
    };
}

/**
 * Update an existing document — either append to the end or replace the full
 * body — via the specified document-store MCP connector.
 */
export async function updateExistingDocument(
    params: UpdateDocumentParams,
): Promise<UpdateDocumentResult> {
    const result = await callDocumentMcp<{ updated?: boolean }>(
        'update_document',
        {
            tenantId: params.tenantId,
            botId: params.botId,
            documentId: params.documentId,
            mode: params.mode,
            content: params.content,
        },
        params.provider,
    );

    return {
        updated: result.updated ?? true,
    };
}

/**
 * Format a list of agenda items as a numbered agenda string.
 *
 * Pure function — no IO. Output is suitable for document body or email body.
 *
 * Example:
 *   formatAsAgenda(['Welcome', 'Q2 Review', 'AOB'])
 *   → "1. Welcome\n2. Q2 Review\n3. AOB"
 */
export function formatAsAgenda(items: string[]): string {
    if (items.length === 0) return '';
    return items
        .map((item, idx) => `${idx + 1}. ${item.trim()}`)
        .join('\n');
}
