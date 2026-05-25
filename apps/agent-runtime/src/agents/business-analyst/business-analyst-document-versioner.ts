/**
 * Business Analyst — Document Version Control
 *
 * Maintains a revision history for BA documents in the gateway's memory
 * patterns API.  Each time a document is revised (e.g., after a rejection),
 * the previous version is archived and a "Changes from Previous Draft"
 * summary is generated.
 *
 * Version pattern key: ba:doc:version:<documentId>:v<n>
 * Current version key: ba:doc:current:<documentId>
 *
 * The `buildVersionedDocument()` function is the primary entry point — it:
 *   1. Reads the current version number from the "current" key
 *   2. Archives the previous content as version n-1 (if this is a revision)
 *   3. Generates a diff summary via LLM (or produces a structural diff)
 *   4. Appends a "## Version History" section to the new content
 *   5. Returns the enriched content ready for KB ingestion + file persistence
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BaDocumentVersion {
    /** Stable document identifier (e.g. taskId + documentType slug). */
    documentId: string;
    /** Monotonically increasing version number starting at 1. */
    version: number;
    /** Full document content at this version. */
    content: string;
    /** Human-readable summary of what changed vs the previous version. */
    changesSummary: string;
    /** ISO-8601 timestamp when this version was saved. */
    savedAt: string;
    /** Who or what produced this version. */
    author?: string;
}

export interface VersionedDocumentResult {
    /** Document content with an appended Version History section. */
    versionedContent: string;
    /** The version number assigned to this revision (1 = first draft). */
    version: number;
    /** Human-readable summary of changes from the previous draft. */
    changesSummary: string;
    /** True when this is the first version (no previous draft). */
    isFirstVersion: boolean;
}

// ---------------------------------------------------------------------------
// Gateway helpers
// ---------------------------------------------------------------------------

const CURRENT_KEY = (id: string) => `ba:doc:current:${id}`;
const VERSION_KEY = (id: string, v: number) => `ba:doc:version:${id}:v${v}`;

async function readPattern(
    key: string,
    workspaceId: string,
    gatewayBaseUrl: string,
    serviceToken: string,
): Promise<{ summary?: string; metadata?: Record<string, unknown> } | null> {
    const base = gatewayBaseUrl.replace(/\/+$/, '');
    try {
        const res = await fetch(
            `${base}/v1/workspaces/${encodeURIComponent(workspaceId)}/memory/patterns`,
            {
                method: 'GET',
                headers: {
                    'content-type': 'application/json',
                    Authorization: `Bearer ${serviceToken}`,
                },
                signal: AbortSignal.timeout(8_000),
            },
        );
        if (!res.ok) return null;
        const data = (await res.json()) as {
            patterns?: Array<{ pattern?: string; summary?: string; metadata?: Record<string, unknown> }>;
        };
        return (data.patterns ?? []).find((p) => p.pattern === key) ?? null;
    } catch {
        return null;
    }
}

async function writePattern(
    key: string,
    summary: string,
    metadata: Record<string, unknown>,
    workspaceId: string,
    gatewayBaseUrl: string,
    serviceToken: string,
): Promise<void> {
    const base = gatewayBaseUrl.replace(/\/+$/, '');
    try {
        await fetch(`${base}/v1/memory/patterns`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                Authorization: `Bearer ${serviceToken}`,
            },
            body: JSON.stringify({
                workspaceId,
                pattern: key,
                summary: summary.slice(0, 500),
                confidence: 1.0,
                observedCount: 1,
                lastSeen: new Date().toISOString(),
                metadata,
            }),
            signal: AbortSignal.timeout(10_000),
        });
    } catch (err) {
        console.warn(`[ba-versioner] writePattern failed for ${key}: ${String(err)}`);
    }
}

// ---------------------------------------------------------------------------
// Current version tracker
// ---------------------------------------------------------------------------

async function getCurrentVersion(
    documentId: string,
    workspaceId: string,
    gatewayBaseUrl: string,
    serviceToken: string,
): Promise<{ version: number; content: string } | null> {
    const record = await readPattern(CURRENT_KEY(documentId), workspaceId, gatewayBaseUrl, serviceToken);
    if (!record) return null;

    const version = typeof record.metadata?.['version'] === 'number' ? record.metadata['version'] : 0;
    const content = typeof record.metadata?.['content'] === 'string' ? record.metadata['content'] : '';
    if (!content || version < 1) return null;

    return { version, content };
}

async function setCurrentVersion(
    documentId: string,
    version: number,
    content: string,
    workspaceId: string,
    gatewayBaseUrl: string,
    serviceToken: string,
): Promise<void> {
    await writePattern(
        CURRENT_KEY(documentId),
        `v${version} — ${new Date().toISOString().slice(0, 10)}`,
        { version, content, updatedAt: new Date().toISOString() },
        workspaceId,
        gatewayBaseUrl,
        serviceToken,
    );
}

// ---------------------------------------------------------------------------
// Diff generation
// ---------------------------------------------------------------------------

/**
 * Generate a structural diff summary comparing two BRD-style documents.
 *
 * Without an LLM, computes a line-count diff and reports which headings
 * appear in new but not old and vice versa.  With an LLM, generates a
 * human-readable "What changed" paragraph.
 */
async function generateChangesSummary(
    previousContent: string,
    currentContent: string,
    callLlm?: (prompt: string, systemPrompt?: string) => Promise<string>,
): Promise<string> {
    if (callLlm && previousContent) {
        try {
            const summary = await callLlm(
                `Compare these two versions of a business requirements document and write a concise "What Changed" summary (max 5 bullet points).\n\n` +
                `## PREVIOUS VERSION (excerpt)\n${previousContent.slice(0, 1500)}\n\n` +
                `## CURRENT VERSION (excerpt)\n${currentContent.slice(0, 1500)}`,
                'You are a business analyst reviewing document revisions. List ONLY the material changes — new requirements, removed requirements, scope changes, updated success criteria. Do not list formatting changes.',
            );
            return summary.trim().slice(0, 800);
        } catch {
            // Fall through to structural diff
        }
    }

    // Structural diff: compare headings and line counts
    const extractHeadings = (text: string): string[] =>
        text
            .split('\n')
            .filter((l) => /^#{1,4}\s/.test(l))
            .map((l) => l.replace(/^#{1,4}\s+/, '').trim());

    const prevHeadings = new Set(extractHeadings(previousContent));
    const currHeadings = extractHeadings(currentContent);

    const added = currHeadings.filter((h) => !prevHeadings.has(h));
    const removed = [...prevHeadings].filter((h) => !currHeadings.includes(h));

    const prevLines = previousContent.split('\n').length;
    const currLines = currentContent.split('\n').length;
    const lineDelta = currLines - prevLines;
    const deltaStr = lineDelta >= 0 ? `+${lineDelta}` : `${lineDelta}`;

    const bullets: string[] = [`- Document size: ${deltaStr} lines`];
    if (added.length > 0) bullets.push(`- Added sections: ${added.join(', ')}`);
    if (removed.length > 0) bullets.push(`- Removed sections: ${removed.join(', ')}`);
    if (bullets.length === 1) bullets.push('- Content revised within existing structure');

    return bullets.join('\n');
}

// ---------------------------------------------------------------------------
// Version history section builder
// ---------------------------------------------------------------------------

/**
 * Append (or update) a "## Version History" section at the bottom of a document.
 */
function appendVersionHistory(
    content: string,
    version: number,
    changesSummary: string,
    date: string,
): string {
    // Remove any existing version history section
    const withoutHistory = content.replace(/\n---\n## Version History[\s\S]*$/, '').trimEnd();

    const historySection = [
        '',
        '---',
        '## Version History',
        '',
        `### v${version} — ${date}`,
        changesSummary || '_Initial draft._',
        '',
    ].join('\n');

    return withoutHistory + historySection;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Retrieve the full version history for a document.
 *
 * Returns versions in descending order (most recent first).
 * Returns an empty array when no history is found or on gateway failure.
 */
export async function getDocumentVersionHistory(
    documentId: string,
    workspaceId: string,
    gatewayBaseUrl: string,
    serviceToken: string,
): Promise<BaDocumentVersion[]> {
    const base = gatewayBaseUrl.replace(/\/+$/, '');
    try {
        const res = await fetch(
            `${base}/v1/workspaces/${encodeURIComponent(workspaceId)}/memory/patterns`,
            {
                method: 'GET',
                headers: {
                    'content-type': 'application/json',
                    Authorization: `Bearer ${serviceToken}`,
                },
                signal: AbortSignal.timeout(8_000),
            },
        );
        if (!res.ok) return [];

        const data = (await res.json()) as {
            patterns?: Array<{ pattern?: string; metadata?: Record<string, unknown>; summary?: string }>;
        };

        const prefix = `ba:doc:version:${documentId}:v`;
        return (data.patterns ?? [])
            .filter((p) => typeof p.pattern === 'string' && p.pattern.startsWith(prefix))
            .map((p) => {
                const meta = p.metadata ?? {};
                return {
                    documentId,
                    version: typeof meta['version'] === 'number' ? meta['version'] : 0,
                    content: typeof meta['content'] === 'string' ? meta['content'] : '',
                    changesSummary: typeof meta['changesSummary'] === 'string' ? meta['changesSummary'] : p.summary ?? '',
                    savedAt: typeof meta['savedAt'] === 'string' ? meta['savedAt'] : '',
                    author: typeof meta['author'] === 'string' ? meta['author'] : undefined,
                };
            })
            .sort((a, b) => b.version - a.version);
    } catch {
        return [];
    }
}

/**
 * Prepare a versioned document ready for KB ingestion and file persistence.
 *
 * Call this before writing any BA document revision.  It:
 *   1. Reads the current version from the gateway (or treats this as v1)
 *   2. Archives the previous content as a numbered version
 *   3. Generates a changes summary via LLM or structural diff
 *   4. Returns the new content with an appended Version History section
 *
 * ```ts
 * const { versionedContent, version, changesSummary } = await buildVersionedDocument({
 *   documentId: 'brd-payment-gateway',
 *   currentContent: brdMarkdown,
 *   workspaceId,
 *   callLlm,
 *   gatewayBaseUrl,
 *   serviceToken,
 * });
 * ```
 */
export async function buildVersionedDocument(params: {
    documentId: string;
    currentContent: string;
    workspaceId: string;
    callLlm?: (prompt: string, systemPrompt?: string) => Promise<string>;
    gatewayBaseUrl: string;
    serviceToken: string;
    author?: string;
}): Promise<VersionedDocumentResult> {
    const {
        documentId, currentContent, workspaceId,
        callLlm, gatewayBaseUrl, serviceToken, author,
    } = params;

    const savedAt = new Date().toISOString();
    const date = savedAt.slice(0, 10);

    // Read current version (if any)
    const current = await getCurrentVersion(documentId, workspaceId, gatewayBaseUrl, serviceToken);
    const isFirstVersion = !current;
    const newVersion = current ? current.version + 1 : 1;

    let changesSummary = '';

    if (current) {
        // Archive the previous version
        await writePattern(
            VERSION_KEY(documentId, current.version),
            `v${current.version} archived on ${date}`,
            {
                version: current.version,
                content: current.content,
                changesSummary: '',
                savedAt: current ? savedAt : '',
                author,
            },
            workspaceId,
            gatewayBaseUrl,
            serviceToken,
        );

        // Generate diff summary
        changesSummary = await generateChangesSummary(current.content, currentContent, callLlm);
    } else {
        changesSummary = '_Initial draft — no previous version._';
    }

    // Update the "current" pointer to the new version
    await setCurrentVersion(documentId, newVersion, currentContent, workspaceId, gatewayBaseUrl, serviceToken);

    // Append version history section to the content
    const versionedContent = appendVersionHistory(currentContent, newVersion, changesSummary, date);

    return { versionedContent, version: newVersion, changesSummary, isFirstVersion };
}
