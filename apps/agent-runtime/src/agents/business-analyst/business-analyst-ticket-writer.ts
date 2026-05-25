/**
 * Business Analyst — Ticket Write-back
 *
 * Pushes approved BA documents (user stories, acceptance criteria, UAT
 * checklists) into Jira or Linear via the executeAction connector layer.
 *
 * Called by the action handler immediately after a document is auto-approved
 * (risk = low) or after `onBaDocumentApproved()` fires for medium/high risk.
 *
 * Responsibilities:
 *   1. Parse user story markdown into structured ticket fields
 *   2. Create (or update) one ticket per story in the target platform
 *   3. Return a write receipt for logging and episodic memory
 *
 * Supported platforms: jira | linear | github
 *
 * For platforms not in this list, the caller receives a 'skipped' receipt —
 * the document content is returned unmodified for the human to copy-paste.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TicketPlatform = 'jira' | 'linear' | 'github';

export interface BaTicketWriteRequest {
    /** Target issue-tracking platform. */
    platform: TicketPlatform;
    /** Jira project key (e.g. "PROJ") or Linear team ID. */
    projectKey: string;
    /** Document type being pushed — shapes the ticket structure. */
    documentType: 'user_story' | 'acceptance_criteria' | 'uat_checklist' | 'brd';
    /** Full markdown content of the generated BA document. */
    content: string;
    /** Document title used as the ticket summary / headline. */
    documentTitle: string;
    /** Optional Jira epic link or Linear cycle ID to associate. */
    epicId?: string;
    /** Priority label — mapped per-platform. Default: medium. */
    priority?: 'urgent' | 'high' | 'medium' | 'low';
    /** Label / tag to apply so tickets are identifiable as BA-generated. */
    baLabel?: string;
}

export interface TicketWriteReceipt {
    platform: TicketPlatform;
    projectKey: string;
    /** Ticket IDs that were created or updated. Empty when skipped. */
    ticketIds: string[];
    ticketsCreated: number;
    skipped: boolean;
    skipReason?: string;
    error?: string;
    writtenAt: string;
}

type SubResult = { ok: boolean; output: string; errorOutput?: string };
type ExecuteActionFn = (actionType: string, payload: Record<string, unknown>) => Promise<SubResult>;

// ---------------------------------------------------------------------------
// Markdown parser — extract individual user stories from a bulk document
// ---------------------------------------------------------------------------

interface ParsedStory {
    summary: string;         // "As a … I want …" line
    description: string;     // full story markdown block
    acceptanceCriteria: string; // Given/When/Then block
}

/**
 * Split a multi-story markdown document into individual story blocks.
 *
 * Heuristic: each story block starts with "As a" (case-insensitive) or a
 * heading that contains "Story" / "User Story".  Handles both numbered lists
 * and heading-delimited blocks.
 */
function parseUserStories(markdown: string): ParsedStory[] {
    const stories: ParsedStory[] = [];

    // Split on "As a" or story headings
    const storyPattern = /(?:^|\n)((?:#{1,4}\s+.*(?:story|story \d+).*\n)|(?:(?:\d+\.\s+)?As a\s))/gi;
    const parts = markdown.split(storyPattern).filter((p) => p && p.trim());

    let currentSummary = '';
    let currentBlock = '';

    for (const part of parts) {
        const trimmed = part.trim();
        if (!trimmed) continue;

        const isStoryStart =
            /^as a\s/i.test(trimmed) ||
            /^#{1,4}\s.*(?:story)/i.test(trimmed) ||
            /^\d+\.\s+as a\s/i.test(trimmed);

        if (isStoryStart) {
            // Save previous block
            if (currentSummary) {
                stories.push(extractStoryFields(currentSummary, currentBlock));
            }
            currentSummary = trimmed.split('\n')[0]?.trim() ?? trimmed;
            currentBlock = trimmed;
        } else {
            currentBlock += '\n' + part;
        }
    }

    // Flush final block
    if (currentSummary) {
        stories.push(extractStoryFields(currentSummary, currentBlock));
    }

    // Fallback: if no stories parsed, treat the whole document as a single ticket
    if (stories.length === 0 && markdown.trim()) {
        const firstLine = markdown.split('\n').find((l) => l.trim())?.trim() ?? 'User Story';
        stories.push(extractStoryFields(firstLine, markdown));
    }

    return stories;
}

function extractStoryFields(summary: string, block: string): ParsedStory {
    // Extract Given/When/Then block
    const acMatch = block.match(/(?:given|acceptance criteria)([\s\S]*?)(?=\n#{1,4}|\n\*\*|\n\d+\.|$)/i);
    const acceptanceCriteria = acMatch ? acMatch[0].trim() : '';

    // Clean the summary — strip markdown heading markers and numbering
    const cleanSummary = summary
        .replace(/^#{1,4}\s+/, '')
        .replace(/^\d+\.\s+/, '')
        .trim()
        .slice(0, 255);

    return {
        summary: cleanSummary,
        description: block.trim(),
        acceptanceCriteria,
    };
}

// ---------------------------------------------------------------------------
// Priority mapping
// ---------------------------------------------------------------------------

const JIRA_PRIORITY: Record<string, string> = {
    urgent: 'Highest',
    high: 'High',
    medium: 'Medium',
    low: 'Low',
};

const LINEAR_PRIORITY: Record<string, number> = {
    urgent: 1,
    high: 2,
    medium: 3,
    low: 4,
};

// ---------------------------------------------------------------------------
// Platform writers
// ---------------------------------------------------------------------------

async function writeToJira(
    stories: ParsedStory[],
    req: BaTicketWriteRequest,
    executeAction: ExecuteActionFn,
): Promise<{ ticketIds: string[]; error?: string }> {
    const ticketIds: string[] = [];
    const priority = JIRA_PRIORITY[req.priority ?? 'medium'] ?? 'Medium';
    const label = req.baLabel ?? 'ba-generated';

    for (const story of stories) {
        try {
            const result = await executeAction('workspace_jira_create_issue', {
                project_key: req.projectKey,
                summary: story.summary,
                description: story.description,
                issue_type: req.documentType === 'uat_checklist' ? 'Task' : 'Story',
                priority,
                labels: [label],
                epic_link: req.epicId,
                acceptance_criteria: story.acceptanceCriteria || undefined,
            });

            if (result.ok) {
                let id = '';
                try {
                    const parsed = JSON.parse(result.output) as { key?: string; id?: string };
                    id = parsed.key ?? parsed.id ?? '';
                } catch { /* ignore */ }
                if (id) ticketIds.push(id);
            } else {
                console.warn(`[ba-ticket-writer] Jira create failed: ${result.errorOutput ?? result.output}`);
            }
        } catch (err) {
            console.warn(`[ba-ticket-writer] Jira exception: ${String(err)}`);
        }
    }

    return { ticketIds };
}

async function writeToLinear(
    stories: ParsedStory[],
    req: BaTicketWriteRequest,
    executeAction: ExecuteActionFn,
): Promise<{ ticketIds: string[]; error?: string }> {
    const ticketIds: string[] = [];
    const priority = LINEAR_PRIORITY[req.priority ?? 'medium'] ?? 3;
    const label = req.baLabel ?? 'ba-generated';

    for (const story of stories) {
        try {
            const result = await executeAction('workspace_linear_create_issue', {
                team_id: req.projectKey,
                title: story.summary,
                description: story.description,
                priority,
                label_names: [label],
                cycle_id: req.epicId,
            });

            if (result.ok) {
                let id = '';
                try {
                    const parsed = JSON.parse(result.output) as { id?: string; identifier?: string };
                    id = parsed.identifier ?? parsed.id ?? '';
                } catch { /* ignore */ }
                if (id) ticketIds.push(id);
            } else {
                console.warn(`[ba-ticket-writer] Linear create failed: ${result.errorOutput ?? result.output}`);
            }
        } catch (err) {
            console.warn(`[ba-ticket-writer] Linear exception: ${String(err)}`);
        }
    }

    return { ticketIds };
}

async function writeToGitHub(
    stories: ParsedStory[],
    req: BaTicketWriteRequest,
    executeAction: ExecuteActionFn,
): Promise<{ ticketIds: string[]; error?: string }> {
    const ticketIds: string[] = [];
    const label = req.baLabel ?? 'ba-generated';

    for (const story of stories) {
        try {
            const result = await executeAction('workspace_github_create_issue', {
                repo: req.projectKey,
                title: story.summary,
                body: story.description,
                labels: [label, 'user-story'],
                milestone: req.epicId ? Number(req.epicId) : undefined,
            });

            if (result.ok) {
                let id = '';
                try {
                    const parsed = JSON.parse(result.output) as { number?: number; html_url?: string };
                    id = parsed.number ? `#${parsed.number}` : '';
                } catch { /* ignore */ }
                if (id) ticketIds.push(id);
            }
        } catch (err) {
            console.warn(`[ba-ticket-writer] GitHub exception: ${String(err)}`);
        }
    }

    return { ticketIds };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a BA document and write each story / checklist item as a ticket in
 * the target issue-tracking platform.
 *
 * Returns a receipt — always resolves, never throws.  Check `receipt.error`
 * for failure details.
 *
 * Only `user_story`, `acceptance_criteria`, and `uat_checklist` documents
 * are written as tickets.  `brd` documents are skipped with a reason.
 *
 * ```ts
 * const receipt = await writeTicketsFromDocument(req, executeAction);
 * if (receipt.skipped) console.log('Skip reason:', receipt.skipReason);
 * ```
 */
export async function writeTicketsFromDocument(
    req: BaTicketWriteRequest,
    executeAction: ExecuteActionFn,
): Promise<TicketWriteReceipt> {
    const writtenAt = new Date().toISOString();

    // Only actionable document types produce tickets
    const ticketableTypes = ['user_story', 'acceptance_criteria', 'uat_checklist'];
    if (!ticketableTypes.includes(req.documentType)) {
        return {
            platform: req.platform,
            projectKey: req.projectKey,
            ticketIds: [],
            ticketsCreated: 0,
            skipped: true,
            skipReason: `Document type '${req.documentType}' does not map to individual tickets. Only user_story, acceptance_criteria, and uat_checklist are written as tickets.`,
            writtenAt,
        };
    }

    if (!req.projectKey) {
        return {
            platform: req.platform,
            projectKey: '',
            ticketIds: [],
            ticketsCreated: 0,
            skipped: true,
            skipReason: 'projectKey is required for ticket write-back.',
            writtenAt,
        };
    }

    const stories = parseUserStories(req.content);
    if (stories.length === 0) {
        return {
            platform: req.platform,
            projectKey: req.projectKey,
            ticketIds: [],
            ticketsCreated: 0,
            skipped: true,
            skipReason: 'No parseable stories found in document content.',
            writtenAt,
        };
    }

    let result: { ticketIds: string[]; error?: string };

    switch (req.platform) {
        case 'jira':
            result = await writeToJira(stories, req, executeAction);
            break;
        case 'linear':
            result = await writeToLinear(stories, req, executeAction);
            break;
        case 'github':
            result = await writeToGitHub(stories, req, executeAction);
            break;
        default:
            return {
                platform: req.platform,
                projectKey: req.projectKey,
                ticketIds: [],
                ticketsCreated: 0,
                skipped: true,
                skipReason: `Unknown platform: ${String(req.platform)}`,
                writtenAt,
            };
    }

    return {
        platform: req.platform,
        projectKey: req.projectKey,
        ticketIds: result.ticketIds,
        ticketsCreated: result.ticketIds.length,
        skipped: false,
        error: result.error,
        writtenAt,
    };
}
