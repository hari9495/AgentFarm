// ============================================================================
// PAIR MODE ACTION HANDLER — Gap 1: Real-time Pair Programming
//
// Gives the Developer agent the ability to act as an always-on pair
// programmer:
//   workspace_dev_pair_suggest   — watches recent file changes and suggests
//                                  the next concrete implementation step
//   workspace_dev_inline_assist  — reads files containing `// ?` comments
//                                  and fills each with a targeted answer
//
// Architecture:
//   Pure builder helpers in this file; I/O only via executeAction/callLlm.
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PairmodeActionType =
    | 'workspace_dev_pair_suggest'
    | 'workspace_dev_inline_assist';

export const PAIRMODE_ACTION_TYPES = new Set<PairmodeActionType>([
    'workspace_dev_pair_suggest',
    'workspace_dev_inline_assist',
]);

export function isPairmodeActionType(at: string): at is PairmodeActionType {
    return PAIRMODE_ACTION_TYPES.has(at as PairmodeActionType);
}

export type PairmodeActionResult = {
    ok:           boolean;
    output:       string;
    errorOutput?: string;
    [key: string]: unknown;
};

type ExecuteActionFn = (
    actionType: string,
    payload:    Record<string, unknown>,
) => Promise<{ ok: boolean; output: string; errorOutput?: string }>;

type LlmCallFn = (prompt: string, systemPrompt?: string) => Promise<string>;

export interface PairmodeActionParams {
    actionType:    PairmodeActionType;
    tenantId:      string;
    botId:         string;
    taskId:        string;
    payload:       Record<string, unknown>;
    workspaceDir:  string;
    executeAction: ExecuteActionFn;
    callLlm?:      LlmCallFn;
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function str(v: unknown, fallback = ''): string {
    return typeof v === 'string' ? v.trim() : fallback;
}

function safeJson(obj: Record<string, unknown>): PairmodeActionResult {
    return { ok: true, output: JSON.stringify(obj) };
}

async function callLlmSafe(
    callLlm:     LlmCallFn | undefined,
    prompt:      string,
    systemPrompt?: string,
): Promise<string> {
    if (!callLlm) return '';
    try { return await callLlm(prompt, systemPrompt); }
    catch { return ''; }
}

// ---------------------------------------------------------------------------
// Pair-suggest prompt builder
// ---------------------------------------------------------------------------

/**
 * Builds the pair-programming suggestion prompt.
 * Pure function.
 */
export function buildPairSuggestPrompt(params: {
    changedFiles:    string[];
    fileContents:    Record<string, string>;
    taskContext?:    string;
    techStack?:      string;
    recentMemory?:   string;
    focusFile?:      string;
}): string {
    const lines: string[] = [
        `You are an expert pair programmer reviewing recent code changes.`,
        `Based on what has changed and the current code, suggest the SINGLE most valuable next step.`,
        ``,
    ];

    if (params.taskContext) lines.push(`Task context: ${params.taskContext}`, ``);
    if (params.techStack)   lines.push(`Tech stack: ${params.techStack}`, ``);
    if (params.recentMemory) lines.push(`Recent activity:`, params.recentMemory, ``);

    lines.push(`Recently changed files: ${params.changedFiles.join(', ')}`, ``);

    for (const [filePath, content] of Object.entries(params.fileContents)) {
        lines.push(`=== ${filePath} ===`, content.slice(0, 1500), ``);
    }

    lines.push(
        `Return a JSON object with:`,
        `  suggestion       — string: the next concrete step (1–2 sentences)`,
        `  rationale        — string: why this step is the most valuable now`,
        `  code_example?    — string | null: short code snippet if helpful`,
        `  file_to_edit?    — string | null: most likely file to change`,
        `  priority         — "high" | "medium" | "low"`,
        ``,
        `No markdown fences, no prose — valid JSON only.`,
    );

    return lines.join('\n');
}

/**
 * Parses the LLM pair-suggest response.  Returns a safe fallback on error.
 */
export function parsePairSuggestResponse(raw: string): {
    suggestion:    string;
    rationale:     string;
    codeExample:   string | null;
    fileToEdit:    string | null;
    priority:      'high' | 'medium' | 'low';
} {
    const fallback = {
        suggestion:  'Continue implementing the feature in the most recently changed file.',
        rationale:   'No LLM response available.',
        codeExample: null,
        fileToEdit:  null,
        priority:    'medium' as const,
    };
    try {
        const cleaned = raw.replace(/^```[a-z]*\n?/im, '').replace(/```\s*$/im, '').trim();
        const s = cleaned.indexOf('{');
        const e = cleaned.lastIndexOf('}');
        if (s === -1 || e === -1) return fallback;
        const p = JSON.parse(cleaned.slice(s, e + 1)) as Record<string, unknown>;
        return {
            suggestion:  typeof p['suggestion']   === 'string' ? p['suggestion']   : fallback.suggestion,
            rationale:   typeof p['rationale']    === 'string' ? p['rationale']    : fallback.rationale,
            codeExample: typeof p['code_example'] === 'string' ? p['code_example'] : null,
            fileToEdit:  typeof p['file_to_edit'] === 'string' ? p['file_to_edit'] : null,
            priority:    ['high','medium','low'].includes(String(p['priority'])) ? p['priority'] as 'high' | 'medium' | 'low' : 'medium',
        };
    } catch {
        return fallback;
    }
}

// ---------------------------------------------------------------------------
// Inline-assist helpers
// ---------------------------------------------------------------------------

const INLINE_QUESTION_PATTERN = /\/\/\s*\?([^\n]*)/g;

/**
 * Extracts all `// ? ...` inline questions from source code.
 * Returns array of { lineIndex, question } pairs.
 * Pure function.
 */
export function extractInlineQuestions(source: string): Array<{
    lineIndex: number;
    question:  string;
    line:      string;
}> {
    const lines = source.split('\n');
    const results: Array<{ lineIndex: number; question: string; line: string }> = [];

    lines.forEach((line, idx) => {
        const m = /\/\/\s*\?\s*(.*)/.exec(line);
        if (m) {
            results.push({ lineIndex: idx, question: m[1]?.trim() ?? '', line: line.trim() });
        }
    });

    return results;
}

/**
 * Builds the inline-assist prompt for a single question in context.
 * Pure function.
 */
export function buildInlineAssistPrompt(params: {
    filePath:     string;
    sourceCode:   string;
    lineIndex:    number;
    question:     string;
    techStack?:   string;
}): string {
    const lines = params.sourceCode.split('\n');
    // Show ±10 lines of context around the question
    const contextStart = Math.max(0, params.lineIndex - 10);
    const contextEnd   = Math.min(lines.length, params.lineIndex + 10);
    const contextLines = lines
        .slice(contextStart, contextEnd)
        .map((l, i) => `${contextStart + i + 1}: ${l}`)
        .join('\n');

    return [
        `You are an expert pair programmer.`,
        `A developer has placed a question comment in their code. Answer it concisely and practically.`,
        ``,
        `File: ${params.filePath}${params.techStack ? `  (${params.techStack})` : ''}`,
        `Question at line ${params.lineIndex + 1}: ${params.question || '(no question text — suggest what should go here)'}`,
        ``,
        `Code context:`,
        '```',
        contextLines,
        '```',
        ``,
        `Return ONLY the answer text (no JSON, no markdown fences, no preamble).`,
        `Keep it ≤ 5 lines. If a code snippet helps, include it directly.`,
    ].join('\n');
}

/**
 * Replaces `// ? question` at a given line with `// AI: <answer>` lines.
 * Pure function.
 */
export function applyInlineAnswer(
    source:     string,
    lineIndex:  number,
    answer:     string,
): string {
    const lines = source.split('\n');
    const indent = /^(\s*)/.exec(lines[lineIndex] ?? '')![1] ?? '';
    const answerLines = answer
        .split('\n')
        .map((l) => `${indent}// AI: ${l}`)
        .join('\n');
    lines[lineIndex] = answerLines;
    return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function handlePairmodeAction(
    params: PairmodeActionParams,
): Promise<PairmodeActionResult> {
    const { actionType, payload, workspaceDir, executeAction, callLlm } = params;

    switch (actionType) {

        // ====================================================================
        // workspace_dev_pair_suggest
        // Watches recent git changes and suggests the next implementation step.
        //
        // payload:
        //   files?         — string[] of recently changed file paths
        //                    (if omitted, uses `git diff --name-only HEAD`)
        //   task_context?  — description of the current task
        //   tech_stack?    — e.g. "React + Node.js + PostgreSQL"
        //   max_files?     — max files to read for context (default: 5)
        // ====================================================================
        case 'workspace_dev_pair_suggest': {
            const taskContext = str(payload['task_context']);
            const techStack   = str(payload['tech_stack']);
            const maxFiles    = typeof payload['max_files'] === 'number' ? payload['max_files'] : 5;

            // Discover changed files
            let changedFiles: string[] = Array.isArray(payload['files'])
                ? (payload['files'] as string[])
                : [];

            if (changedFiles.length === 0) {
                // Use git diff to find recently changed files
                const diffResult = await executeAction('workspace_diff', {
                    workspace_dir: workspaceDir,
                    staged:        false,
                });
                if (diffResult.ok && diffResult.output) {
                    // Parse file names from diff header lines (--- a/ or +++ b/)
                    changedFiles = [...new Set(
                        diffResult.output
                            .split('\n')
                            .filter((l) => l.startsWith('diff --git'))
                            .map((l) => {
                                const m = /diff --git a\/(.*?) b\//.exec(l);
                                return m ? m[1] : null;
                            })
                            .filter((f): f is string => f !== null),
                    )].slice(0, maxFiles);
                }
            }

            if (changedFiles.length === 0) {
                // Fallback: list recently modified files via workspace_list_files
                const listResult = await executeAction('workspace_list_files', {
                    path: workspaceDir,
                    pattern: '**/*.{ts,tsx,js,jsx,py,go,java,cs,rs}',
                });
                if (listResult.ok) {
                    changedFiles = listResult.output
                        .split('\n')
                        .map((l) => l.trim())
                        .filter(Boolean)
                        .slice(0, maxFiles);
                }
            }

            // Read contents of changed files
            const fileContents: Record<string, string> = {};
            for (const filePath of changedFiles.slice(0, maxFiles)) {
                const readResult = await executeAction('workspace_read_file', { file_path: filePath });
                if (readResult.ok && readResult.output) {
                    fileContents[filePath] = readResult.output.slice(0, 2000);
                }
            }

            // Team context delta: load the previous pair suggestion from memory to
            // detect which files are NEW since the last session and avoid re-suggesting
            // work the developer already acted on.
            let lastSuggestionFiles: string[] = [];
            let lastSuggestionDate = '';
            try {
                const prevResult = await executeAction('workspace_memory_search', {
                    query: `pair_suggest ${taskContext || 'development'}`,
                    tags:  ['pair_suggest'],
                    limit: 1,
                });
                if (prevResult.ok && prevResult.output.trim()) {
                    const tsMatch  = /pair_suggest \((\d{4}-\d{2}-\d{2})\)/.exec(prevResult.output);
                    if (tsMatch) lastSuggestionDate = tsMatch[1]!;
                    const filesMatch = /Files: ([^\n]+)/.exec(prevResult.output);
                    if (filesMatch) {
                        lastSuggestionFiles = filesMatch[1]!.split(',').map((f) => f.trim()).filter(Boolean);
                    }
                }
            } catch { /* best-effort — delta is advisory */ }

            // Files not seen in the previous suggestion are the delta
            const deltaFiles = lastSuggestionFiles.length > 0
                ? changedFiles.filter((f) => !lastSuggestionFiles.includes(f))
                : changedFiles;

            // Recent memory for additional context
            const memResult = await executeAction('workspace_memory_search', {
                query: taskContext || 'recent development',
                limit: 5,
            });
            const recentMemory = memResult.ok ? memResult.output : undefined;

            // LLM suggestion — prefer delta files when we have prior context
            const filesToSuggestOn = deltaFiles.length > 0 ? deltaFiles : changedFiles;

            let suggestion = 'No suggestion available — LLM not connected.';
            let rationale  = '';
            let codeExample: string | null = null;
            let fileToEdit: string | null  = null;
            let priority: 'high' | 'medium' | 'low' = 'medium';

            if (callLlm && (filesToSuggestOn.length > 0 || taskContext)) {
                const prompt = buildPairSuggestPrompt({
                    changedFiles: filesToSuggestOn,
                    fileContents: Object.fromEntries(
                        Object.entries(fileContents).filter(([k]) => filesToSuggestOn.includes(k)),
                    ),
                    taskContext:  taskContext  || undefined,
                    techStack:    techStack    || undefined,
                    recentMemory: recentMemory || undefined,
                });
                const llmRaw = await callLlmSafe(
                    callLlm,
                    prompt,
                    'You are an expert pair programmer. Be concrete and actionable.',
                );
                const parsed = parsePairSuggestResponse(llmRaw);
                suggestion  = parsed.suggestion;
                rationale   = parsed.rationale;
                codeExample = parsed.codeExample;
                fileToEdit  = parsed.fileToEdit;
                priority    = parsed.priority;
            }

            // Store this suggestion in memory so the next call can compute a delta
            const todayStr = new Date().toISOString().slice(0, 10);
            try {
                await executeAction('workspace_memory_write', {
                    content: [
                        `pair_suggest (${todayStr}):`,
                        `Files: ${changedFiles.join(', ')}`,
                        `Suggestion: ${suggestion.slice(0, 200)}`,
                    ].join('\n'),
                    tags: ['pair_suggest', taskContext || 'development'],
                });
            } catch { /* best-effort */ }

            return safeJson({
                changed_files:     changedFiles,
                files_read:        Object.keys(fileContents).length,
                // Delta: files not seen in the previous suggestion
                monitoring_since:  lastSuggestionDate || null,
                delta_file_count:  deltaFiles.length,
                delta_files:       deltaFiles,
                suggestion,
                rationale,
                code_example:      codeExample,
                file_to_edit:      fileToEdit,
                priority,
                summary: lastSuggestionDate
                    ? `Pair suggestion (since ${lastSuggestionDate}, ${deltaFiles.length} new file(s), ${priority}): ${suggestion.slice(0, 80)}`
                    : `Pair suggestion (${priority}): ${suggestion.slice(0, 100)}`,
            });
        }

        // ====================================================================
        // workspace_dev_inline_assist
        // Reads files with `// ?` comments and fills each with an AI answer.
        // The original file is updated in-place.
        //
        // payload:
        //   files          — string[] of file paths to scan (required)
        //   tech_stack?    — tech stack context
        //   dry_run?       — return answers without writing to disk
        // ====================================================================
        case 'workspace_dev_inline_assist': {
            const files     = Array.isArray(payload['files']) ? (payload['files'] as string[]) : [];
            const techStack = str(payload['tech_stack']);
            const dryRun    = payload['dry_run'] === true;

            if (files.length === 0) {
                return { ok: false, output: '', errorOutput: 'workspace_dev_inline_assist: files array is required' };
            }

            const results: Array<{
                filePath:      string;
                questionsFound: number;
                answered:       number;
                skipped:        boolean;
            }> = [];

            for (const filePath of files) {
                // Read file
                const readResult = await executeAction('workspace_read_file', { file_path: filePath });
                if (!readResult.ok || !readResult.output) {
                    results.push({ filePath, questionsFound: 0, answered: 0, skipped: true });
                    continue;
                }

                let source = readResult.output;
                const questions = extractInlineQuestions(source);

                if (questions.length === 0) {
                    results.push({ filePath, questionsFound: 0, answered: 0, skipped: false });
                    continue;
                }

                let answered = 0;
                // Process questions in reverse line order so line indices remain valid
                const sortedQuestions = [...questions].sort((a, b) => b.lineIndex - a.lineIndex);

                for (const q of sortedQuestions) {
                    let answer = '';

                    if (callLlm) {
                        const prompt = buildInlineAssistPrompt({
                            filePath,
                            sourceCode: source,
                            lineIndex:  q.lineIndex,
                            question:   q.question,
                            techStack:  techStack || undefined,
                        });
                        answer = await callLlmSafe(
                            callLlm,
                            prompt,
                            'You are an expert developer. Answer the developer\'s inline question concisely.',
                        );
                    }

                    if (!answer) {
                        answer = q.question
                            ? `Consider: ${q.question}`
                            : 'TODO: implement this';
                    }

                    source = applyInlineAnswer(source, q.lineIndex, answer.trim());
                    answered++;
                }

                if (!dryRun) {
                    await executeAction('workspace_write_file', {
                        file_path: filePath,
                        content:   source,
                    });
                }

                results.push({ filePath, questionsFound: questions.length, answered, skipped: false });
            }

            const totalQuestions = results.reduce((sum, r) => sum + r.questionsFound, 0);
            const totalAnswered  = results.reduce((sum, r) => sum + r.answered, 0);

            return safeJson({
                files_scanned:    files.length,
                total_questions:  totalQuestions,
                total_answered:   totalAnswered,
                dry_run:          dryRun,
                results,
                summary: `Inline assist: ${totalAnswered}/${totalQuestions} question(s) answered across ${files.length} file(s)${dryRun ? ' (dry-run)' : ''}`,
            });
        }
    }
}
