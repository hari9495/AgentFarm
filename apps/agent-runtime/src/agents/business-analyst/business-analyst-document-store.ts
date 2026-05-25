/**
 * Business Analyst — Document Store
 *
 * Persists generated BA documents to durable storage after approval.
 *
 * Three persistence targets, attempted in order (non-exclusive):
 *   1. Workspace file system  — always attempted when workspaceDir is set
 *   2. Confluence            — when confluenceSpaceKey is set and executeAction
 *                              has a Confluence connector
 *   3. Notion                — when notionDatabaseId is set and executeAction
 *                              has a Notion connector
 *
 * Any combination of the three targets can be active simultaneously.
 * Failures in one target never block the others.
 *
 * File naming convention (workspace FS):
 *   <workspaceDir>/ba-documents/<sanitized_title>_<YYYY-MM-DD>.md
 *
 * Called by the action handler immediately after a document is auto-approved
 * or after onBaDocumentApproved() fires for medium/high risk documents.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BaDocumentPersistRequest {
    documentType: string;
    documentTitle: string;
    content: string;
    /** Local workspace directory for file-system persistence. */
    workspaceDir?: string;
    /** Confluence space key — e.g. "ENG" or "PROD". */
    confluenceSpaceKey?: string;
    /** Parent page ID in Confluence under which this doc is created. */
    confluenceParentPageId?: string;
    /** Notion database ID for creating a new page entry. */
    notionDatabaseId?: string;
    /** Domain label added to document metadata. */
    domain?: string;
    /** ISO-8601 date string — defaults to today. */
    documentDate?: string;
}

export interface BaDocumentPersistResult {
    /** At least one target succeeded. */
    ok: boolean;
    /** Path written on the workspace file system, or null. */
    filePath?: string;
    /** URL of the created Confluence page, or null. */
    confluenceUrl?: string;
    /** URL of the created Notion page, or null. */
    notionUrl?: string;
    /** Human-readable summary of what was written. */
    summary: string;
    /** Individual target errors (non-fatal). */
    errors: string[];
    persistedAt: string;
}

type SubResult = { ok: boolean; output: string; errorOutput?: string };
type ExecuteActionFn = (actionType: string, payload: Record<string, unknown>) => Promise<SubResult>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sanitizeFileName(title: string): string {
    return title
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .slice(0, 80);
}

function todayIso(): string {
    return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

// ---------------------------------------------------------------------------
// Target: workspace file system
// ---------------------------------------------------------------------------

async function persistToFileSystem(
    req: BaDocumentPersistRequest,
    executeAction: ExecuteActionFn,
): Promise<{ filePath?: string; error?: string }> {
    if (!req.workspaceDir) return {};

    const date = req.documentDate?.slice(0, 10) ?? todayIso();
    const fileName = `${sanitizeFileName(req.documentTitle)}_${date}.md`;
    const filePath = `${req.workspaceDir}/ba-documents/${fileName}`.replace(/\\/g, '/');

    // Prepend a metadata header to the file
    const header = [
        `---`,
        `title: "${req.documentTitle}"`,
        `type: ${req.documentType}`,
        `domain: ${req.domain ?? 'general'}`,
        `created: ${date}`,
        `generator: AgentFarm BA Agent`,
        `---`,
        '',
    ].join('\n');

    const fullContent = header + req.content;

    try {
        const result = await executeAction('workspace_write_file', {
            file_path: filePath,
            content: fullContent,
            create_directories: true,
        });

        if (result.ok) return { filePath };
        return { error: result.errorOutput ?? 'write_file returned not-ok' };
    } catch (err) {
        return { error: String(err) };
    }
}

// ---------------------------------------------------------------------------
// Target: Confluence
// ---------------------------------------------------------------------------

async function persistToConfluence(
    req: BaDocumentPersistRequest,
    executeAction: ExecuteActionFn,
): Promise<{ confluenceUrl?: string; error?: string }> {
    if (!req.confluenceSpaceKey) return {};

    // Convert markdown to Confluence storage format (basic conversion)
    // The Confluence connector handles rendering; we pass markdown as-is.
    const pageTitle = `[BA] ${req.documentTitle} (${todayIso()})`;

    try {
        const result = await executeAction('workspace_confluence_create_page', {
            space_key: req.confluenceSpaceKey,
            title: pageTitle,
            body: req.content,
            body_format: 'markdown',
            parent_page_id: req.confluenceParentPageId,
            labels: ['ba-generated', req.documentType.replace(/_/g, '-')],
        });

        if (!result.ok) {
            return { error: result.errorOutput ?? 'confluence create_page returned not-ok' };
        }

        let url = '';
        try {
            const parsed = JSON.parse(result.output) as { url?: string; _links?: { webui?: string } };
            url = parsed.url ?? parsed._links?.webui ?? '';
        } catch { /* ignore */ }

        return { confluenceUrl: url || undefined };
    } catch (err) {
        return { error: String(err) };
    }
}

// ---------------------------------------------------------------------------
// Target: Notion
// ---------------------------------------------------------------------------

async function persistToNotion(
    req: BaDocumentPersistRequest,
    executeAction: ExecuteActionFn,
): Promise<{ notionUrl?: string; error?: string }> {
    if (!req.notionDatabaseId) return {};

    try {
        const result = await executeAction('workspace_notion_create_page', {
            database_id: req.notionDatabaseId,
            title: req.documentTitle,
            content: req.content,
            properties: {
                Type: req.documentType,
                Domain: req.domain ?? 'general',
                Date: todayIso(),
                Status: 'Draft',
                Generator: 'AgentFarm BA Agent',
            },
        });

        if (!result.ok) {
            return { error: result.errorOutput ?? 'notion create_page returned not-ok' };
        }

        let url = '';
        try {
            const parsed = JSON.parse(result.output) as { url?: string };
            url = parsed.url ?? '';
        } catch { /* ignore */ }

        return { notionUrl: url || undefined };
    } catch (err) {
        return { error: String(err) };
    }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Persist a generated BA document to all configured storage targets.
 *
 * At least one of `workspaceDir`, `confluenceSpaceKey`, or `notionDatabaseId`
 * must be set for any write to occur.  All three can be active simultaneously.
 *
 * Always resolves — failures in individual targets are captured in `errors`
 * and `ok` reflects whether at least one target succeeded.
 *
 * ```ts
 * const result = await persistBaDocument({
 *   documentType: 'brd',
 *   documentTitle: 'Payment Gateway Upgrade',
 *   content: brdMarkdown,
 *   workspaceDir: '/workspace',
 *   confluenceSpaceKey: 'PROD',
 * }, executeAction);
 * ```
 */
export async function persistBaDocument(
    req: BaDocumentPersistRequest,
    executeAction?: ExecuteActionFn,
): Promise<BaDocumentPersistResult> {
    const persistedAt = new Date().toISOString();
    const errors: string[] = [];
    let filePath: string | undefined;
    let confluenceUrl: string | undefined;
    let notionUrl: string | undefined;

    if (!executeAction) {
        // No connector available — can't persist anywhere
        return {
            ok: false,
            summary: 'No executeAction connector provided — document not persisted to any storage target.',
            errors: ['executeAction is required for document persistence'],
            persistedAt,
        };
    }

    // Run all three targets concurrently (non-exclusive)
    const [fsResult, confluenceResult, notionResult] = await Promise.all([
        persistToFileSystem(req, executeAction),
        persistToConfluence(req, executeAction),
        persistToNotion(req, executeAction),
    ]);

    if (fsResult.filePath) filePath = fsResult.filePath;
    else if (fsResult.error) errors.push(`FileSystem: ${fsResult.error}`);

    if (confluenceResult.confluenceUrl) confluenceUrl = confluenceResult.confluenceUrl;
    else if (confluenceResult.error) errors.push(`Confluence: ${confluenceResult.error}`);

    if (notionResult.notionUrl) notionUrl = notionResult.notionUrl;
    else if (notionResult.error) errors.push(`Notion: ${notionResult.error}`);

    const written: string[] = [];
    if (filePath) written.push(`file: ${filePath}`);
    if (confluenceUrl) written.push(`Confluence: ${confluenceUrl}`);
    if (notionUrl) written.push(`Notion: ${notionUrl}`);

    const ok = written.length > 0;
    const summary = ok
        ? `Document persisted to: ${written.join(', ')}`
        : 'No storage targets were configured or all failed.';

    return { ok, filePath, confluenceUrl, notionUrl, summary, errors, persistedAt };
}
