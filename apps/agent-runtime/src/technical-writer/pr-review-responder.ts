// ============================================================================
// PR REVIEW RESPONDER
// Technical Writer Role
//
// Pure functions for parsing GitHub PR inline review comments (from
// `gh api repos/{owner}/{repo}/pulls/{number}/comments`) and building
// structured fix records + a response report.
//
// parseGhPrReviewComments  — turn raw JSON array into ReviewComment objects
// isActionableComment      — heuristic: does this comment request a change?
// buildReviewResponseReport — markdown summary of every fix applied
//
// All pure functions — no I/O, no GitHub calls, no LLM calls.
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** One inline review comment as returned by the GitHub REST API. */
export interface ReviewComment {
    id: number;
    /** File path anchored to (relative to repo root) */
    path: string;
    /** 1-based line number in the diff, if present */
    line?: number;
    /** Comment body text */
    body: string;
    /** GitHub login of the reviewer */
    author: string;
    createdAt: string;
}

/** The outcome of attempting to apply one review comment as a doc fix. */
export interface ReviewFix {
    comment: ReviewComment;
    /** 'fixed' = LLM applied a patch; 'skipped' = non-actionable; 'manual' = needs human */
    status: 'fixed' | 'skipped' | 'manual';
    /** One-line description of what was done */
    fixSummary: string;
    /** Updated file content (set when status = 'fixed') */
    newContent?: string;
}

/** Aggregate report for one PR review-response pass. */
export interface ReviewResponseReport {
    totalComments: number;
    fixedCount: number;
    skippedCount: number;
    manualCount: number;
    fixes: ReviewFix[];
    markdownReport: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

type RawObj = Record<string, unknown>;

function str(v: unknown): string {
    return typeof v === 'string' ? v : '';
}
function num(v: unknown): number | undefined {
    return typeof v === 'number' ? v : undefined;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse the JSON array returned by:
 *   gh api repos/{owner}/{repo}/pulls/{number}/comments
 *
 * Filters to comments that have a body and a file path (inline review
 * comments), discarding top-level PR comments without a file anchor.
 */
export function parseGhPrReviewComments(raw: unknown[]): ReviewComment[] {
    return raw
        .filter((c): c is RawObj => typeof c === 'object' && c !== null)
        .map((c) => ({
            id:        num(c['id']) ?? 0,
            path:      str(c['path']),
            line:      num(c['line']) ?? num(c['original_line']),
            body:      str(c['body']),
            author:    str((c['user'] as RawObj | undefined)?.['login']) || 'reviewer',
            createdAt: str(c['created_at']),
        }))
        .filter((c) => c.body.trim().length > 0 && c.path.trim().length > 0);
}

/**
 * Returns true if the comment is likely requesting a documentation change.
 * Used to filter comments the agent should attempt to auto-fix vs skip.
 */
export function isActionableComment(comment: ReviewComment): boolean {
    const lower = comment.body.toLowerCase();
    return /\b(fix|update|change|wrong|incorrect|should|please|typo|outdated|broken|missing|remove|add|reword|clarify|rephrase|stale|inaccurate)\b/.test(lower);
}

/**
 * Build a Markdown report summarising every review comment and its fix status.
 */
export function buildReviewResponseReport(fixes: ReviewFix[]): ReviewResponseReport {
    const fixedCount   = fixes.filter((f) => f.status === 'fixed').length;
    const skippedCount = fixes.filter((f) => f.status === 'skipped').length;
    const manualCount  = fixes.filter((f) => f.status === 'manual').length;

    const now = new Date().toISOString().split('T')[0]!;
    const lines: string[] = [];

    lines.push('# PR Review Response Report');
    lines.push(`\n_Generated: ${now}_\n`);
    lines.push(`**Total inline comments:** ${fixes.length}  `);
    lines.push(`**Auto-fixed:** ${fixedCount}  `);
    lines.push(`**Skipped (not actionable):** ${skippedCount}  `);
    lines.push(`**Requires manual review:** ${manualCount}\n`);

    if (fixedCount > 0) {
        lines.push('## ✅ Auto-Fixed\n');
        lines.push('| File | Line | Reviewer Comment | Fix Summary |');
        lines.push('|------|------|------------------|-------------|');
        fixes
            .filter((f) => f.status === 'fixed')
            .forEach((f) => {
                const lineStr = f.comment.line ? `L${f.comment.line}` : '—';
                const body    = f.comment.body.slice(0, 60).replace(/\|/g, '\\|');
                const fix     = f.fixSummary.slice(0, 80).replace(/\|/g, '\\|');
                lines.push(`| \`${f.comment.path}\` | ${lineStr} | ${body} | ${fix} |`);
            });
        lines.push('');
    }

    if (manualCount > 0) {
        lines.push('## ⚠️ Requires Manual Review\n');
        fixes
            .filter((f) => f.status === 'manual')
            .forEach((f) => {
                const lineStr = f.comment.line ? ` (L${f.comment.line})` : '';
                lines.push(`- **\`${f.comment.path}\`**${lineStr} — _${f.comment.author}_: ${f.comment.body.slice(0, 120)}`);
            });
        lines.push('');
    }

    return {
        totalComments: fixes.length,
        fixedCount,
        skippedCount,
        manualCount,
        fixes,
        markdownReport: lines.join('\n'),
    };
}
