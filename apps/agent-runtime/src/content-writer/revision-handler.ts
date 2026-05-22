/**
 * Revision Handler
 *
 * Processes editor comments on a content draft and generates targeted
 * section-level revisions using an LLM. Each comment is handled
 * independently so partial failures do not block other revisions.
 *
 * Uses the same injectable ProseCallerFn pattern as llm-prose-writer.ts
 * so tests never require a live LLM endpoint.
 */

import type { ProseCallerFn } from './llm-prose-writer.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EditorComment {
    /** The comment body / feedback text. */
    body: string;
    /**
     * Heading or section name the comment targets.
     * null means the comment applies to the full article.
     */
    section: string | null;
    /** Display name of the person who left the comment. */
    author: string;
}

export interface SectionRevision {
    /** Section the revision targets (null = whole-article comment). */
    section: string | null;
    /** Original excerpt from the draft (up to 300 chars for reference). */
    originalExcerpt: string;
    /** LLM-generated revised text for that section. */
    revisedExcerpt: string;
    /** The comment being addressed. */
    respondToComment: string;
}

export interface ConflictPair {
    /** Zero-based index into the comments array for the first conflicting comment. */
    commentAIndex: number;
    /** Zero-based index into the comments array for the second conflicting comment. */
    commentBIndex: number;
    /** Section both comments target (null = whole article). */
    section: string | null;
    /** Human-readable explanation of the detected conflict. */
    reason: string;
}

export interface RevisionResult {
    revisions: SectionRevision[];
    /** Aggregated summary the agent sends back to the editor. */
    agentResponseMessage: string;
    tokensUsed: number;
    /** Pairs of editor comments that directly contradict each other. */
    conflictsDetected: ConflictPair[];
}

// ---------------------------------------------------------------------------
// Conflict detection
// ---------------------------------------------------------------------------

const LENGTHEN_RE = /\b(expand|lengthen|add more|elaborate|extend|more detail|flesh out)\b/i;
const SHORTEN_RE = /\b(shorten|cut|trim|reduce|more concise|too long|remove)\b/i;
const FORMAL_RE = /\b(formal|professional|more formal|business tone)\b/i;
const INFORMAL_RE = /\b(casual|informal|friendly|conversational|less formal|relaxed)\b/i;
const SIMPLER_RE = /\b(simpler|simplify|plain language|easier to (read|understand)|less jargon)\b/i;
const TECHNICAL_RE = /\b(more technical|technical detail|deeper|advanced|add depth|technical)\b/i;

/**
 * Detect pairs of editor comments that give contradictory instructions.
 *
 * Checks comments targeting the same section (or both whole-article) for
 * known opposing instruction patterns: expand vs. shorten, formal vs. casual,
 * simpler vs. more technical.
 */
export function detectRevisionConflicts(comments: EditorComment[]): ConflictPair[] {
    const conflicts: ConflictPair[] = [];

    for (let i = 0; i < comments.length; i++) {
        for (let j = i + 1; j < comments.length; j++) {
            const a = comments[i];
            const b = comments[j];

            // Only check comments targeting the same scope
            const sameSection =
                a.section === b.section || (a.section === null && b.section === null);
            if (!sameSection) continue;

            const aBody = a.body;
            const bBody = b.body;
            const section = a.section ?? null;

            if (LENGTHEN_RE.test(aBody) && SHORTEN_RE.test(bBody)) {
                conflicts.push({ commentAIndex: i, commentBIndex: j, section, reason: 'Conflicting length instructions: expand vs. shorten.' });
            } else if (SHORTEN_RE.test(aBody) && LENGTHEN_RE.test(bBody)) {
                conflicts.push({ commentAIndex: i, commentBIndex: j, section, reason: 'Conflicting length instructions: shorten vs. expand.' });
            } else if (FORMAL_RE.test(aBody) && INFORMAL_RE.test(bBody)) {
                conflicts.push({ commentAIndex: i, commentBIndex: j, section, reason: 'Conflicting tone instructions: formal vs. casual.' });
            } else if (INFORMAL_RE.test(aBody) && FORMAL_RE.test(bBody)) {
                conflicts.push({ commentAIndex: i, commentBIndex: j, section, reason: 'Conflicting tone instructions: casual vs. formal.' });
            } else if (SIMPLER_RE.test(aBody) && TECHNICAL_RE.test(bBody)) {
                conflicts.push({ commentAIndex: i, commentBIndex: j, section, reason: 'Conflicting complexity: simplify vs. add technical depth.' });
            } else if (TECHNICAL_RE.test(aBody) && SIMPLER_RE.test(bBody)) {
                conflicts.push({ commentAIndex: i, commentBIndex: j, section, reason: 'Conflicting complexity: technical detail vs. simplify.' });
            }
        }
    }

    return conflicts;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract the text of the section matching the heading label.
 * Returns the full draft body when section is null or not found.
 */
function extractSectionText(draftBody: string, section: string | null): string {
    if (!section) return draftBody;

    // Match markdown headings (## Section) or plain-text lines ending with ':'
    const headingPattern = new RegExp(
        `(?:^#{1,6}\\s*${escapeRegex(section)}|^${escapeRegex(section)}\\s*:?)\\s*$`,
        'im',
    );
    const match = headingPattern.exec(draftBody);
    if (!match) return draftBody;

    const start = match.index + match[0].length;
    // Find next heading or end of text
    const nextHeading = /^#{1,6}\s/im.exec(draftBody.slice(start));
    const end = nextHeading ? start + nextHeading.index : draftBody.length;

    return draftBody.slice(start, end).trim();
}

function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildRevisionSystemPrompt(): string {
    return (
        'You are a professional content editor. You will receive a section of an article and ' +
        'an editor comment requesting a revision. Rewrite ONLY the section to address the comment. ' +
        'Preserve the overall structure and flow. Return only the rewritten section text, ' +
        'with no additional commentary or explanation.'
    );
}

function buildRevisionUserPrompt(excerpt: string, comment: EditorComment): string {
    return (
        `Editor comment from ${comment.author}: "${comment.body}"\n\n` +
        `Section to revise:\n\n${excerpt}`
    );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate revisions for a list of editor comments against a draft body.
 *
 * Each comment is processed independently. If an LLM call fails for a
 * comment, the original excerpt is preserved in the revision so the caller
 * can surface the failure without losing other revisions.
 */
export async function generateRevisions(
    draftBody: string,
    comments: EditorComment[],
    caller: ProseCallerFn,
): Promise<RevisionResult> {
    if (!draftBody.trim() || comments.length === 0) {
        return {
            revisions: [],
            agentResponseMessage: 'No revisions required.',
            tokensUsed: 0,
            conflictsDetected: [],
        };
    }

    const conflictsDetected = detectRevisionConflicts(comments);
    const system = buildRevisionSystemPrompt();
    let totalTokens = 0;
    const revisions: SectionRevision[] = [];

    for (const comment of comments) {
        const sectionText = extractSectionText(draftBody, comment.section);
        const excerpt = sectionText.slice(0, 300);
        const userPrompt = buildRevisionUserPrompt(sectionText, comment);

        const llmResult = await caller(system, userPrompt);

        const revisedExcerpt = llmResult.text ?? excerpt;
        totalTokens += llmResult.tokensUsed ?? 0;

        revisions.push({
            section: comment.section,
            originalExcerpt: excerpt,
            revisedExcerpt,
            respondToComment: comment.body,
        });
    }

    const successCount = revisions.filter((r) => r.revisedExcerpt !== r.originalExcerpt).length;
    const conflictNote =
        conflictsDetected.length > 0
            ? ` ⚠️ ${conflictsDetected.length} conflicting instruction(s) detected — review before applying.`
            : '';
    const agentResponseMessage =
        `Processed ${comments.length} editor comment(s). ` +
        `${successCount} section(s) were revised. ` +
        `Please review the changes and apply them to the draft.` +
        conflictNote;

    return { revisions, agentResponseMessage, tokensUsed: totalTokens, conflictsDetected };
}
