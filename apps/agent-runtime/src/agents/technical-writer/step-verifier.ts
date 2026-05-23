// ============================================================================
// STEP VERIFIER
// Technical Writer Role
//
// Pure functions for extracting procedural steps from Markdown documentation,
// classifying each step for automatic verification, and building structured
// reports from verification results.
//
// extractStepsFromMarkdown  — parse numbered / bulleted steps from a doc
// classifyStep              — categorise a step as api_call / ui_navigation /
//                             cli_command / manual
// buildVerificationReport   — turn a list of StepVerificationResult into a
//                             human-readable Markdown report
//
// All pure functions — no I/O, no network calls, no LLM calls.
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type StepType = 'api_call' | 'ui_navigation' | 'cli_command' | 'manual';

/**
 * A single procedural step extracted from a Markdown document.
 */
export interface DocStep {
    /** 1-based position within the document */
    number: number;
    /** Full step text, stripped of leading list markers */
    text: string;
    /** Classified execution type */
    type: StepType;
    /** HTTP/S URL found in the step (api_call / ui_navigation) */
    url?: string;
    /** Shell command found in the step (cli_command) */
    command?: string;
    /** HTTP method extracted (api_call only; defaults to GET) */
    method?: string;
}

export type StepStatus = 'pass' | 'fail' | 'skipped' | 'error';

/**
 * Outcome of attempting to verify one DocStep.
 */
export interface StepVerificationResult {
    step: DocStep;
    status: StepStatus;
    /** Human-readable outcome description */
    details: string;
    /** HTTP response code if applicable */
    responseCode?: number;
    /** Elapsed wall-clock time in ms */
    durationMs?: number;
}

/**
 * Aggregate verification report for an entire document.
 */
export interface DocVerificationReport {
    totalSteps: number;
    passCount: number;
    failCount: number;
    skippedCount: number;
    errorCount: number;
    results: StepVerificationResult[];
    markdownReport: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Extract the first http/https URL from a text string. */
function extractUrl(text: string): string | undefined {
    const m = text.match(/https?:\/\/[^\s'"`,)\]>]+/i);
    return m ? m[0]!.replace(/[.,;!?]+$/, '') : undefined;
}

/** Extract a plausible shell command from code fences, inline code, or $ prompts. */
function extractCommand(text: string): string | undefined {
    // ```shell/bash block (multiline)
    const fenceMatch = text.match(/```(?:bash|sh|shell|zsh|cmd|powershell|console)?\s*\n([\s\S]+?)\n```/i);
    if (fenceMatch) return fenceMatch[1]!.trim().replace(/^\$\s*/, '');
    // inline code `...`
    const inlineMatch = text.match(/`([^`]+)`/);
    if (inlineMatch) return inlineMatch[1]!.trim().replace(/^\$\s*/, '');
    // $ prompt
    const promptMatch = text.match(/(?:^|\n)\s*\$\s+(.+)/m);
    if (promptMatch) return promptMatch[1]!.trim();
    return undefined;
}

/** Extract the first HTTP method word from text. */
function extractMethod(text: string): string | undefined {
    const m = text.match(/\b(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/i);
    return m ? m[1]!.toUpperCase() : undefined;
}

// ---------------------------------------------------------------------------
// Public: step classification
// ---------------------------------------------------------------------------

/**
 * Classify a step text string into one of the four verifiable categories.
 *
 * Order of precedence:
 *   1. cli_command  — code fences, $ prompt, or known CLI tool names
 *   2. api_call     — explicit HTTP method + URL, curl, or /api/ path
 *   3. ui_navigation — navigation verb (go to, open, visit, click) + URL
 *   4. manual       — everything else
 */
export function classifyStep(text: string): StepType {
    const lower = text.toLowerCase();

    // 1. CLI command signals
    const hasCodeFence  = /```/.test(text);
    const hasShellPrompt = /(?:^|\n)\s*\$\s+/m.test(text);
    const hasCliKeyword = /\b(npm |yarn |pnpm |pip |cargo |make |docker |kubectl |git |bash |sh |zsh |python |node |java |mvn |gradle |dotnet |go run|terraform|ansible)\b/.test(lower);
    if (hasCodeFence || hasShellPrompt || hasCliKeyword) return 'cli_command';

    // 2. API call signals
    const hasHttpMethod = /\b(GET|POST|PUT|PATCH|DELETE|HEAD)\b/i.test(text);
    const hasApiPath    = /https?:\/\/[^\s]+(?:\/api\/|\/v[0-9]+\/)/i.test(text);
    const hasCurl       = /\bcurl\b/i.test(lower);
    if (hasHttpMethod || hasApiPath || hasCurl) return 'api_call';

    // 3. UI navigation signals
    const hasNavVerb = /\b(navigate to|go to|open|visit|click|browse to|access|launch)\b/i.test(text);
    const hasUrl     = /https?:\/\//i.test(text);
    const hasPageRef = /\b(page|screen|dashboard|settings|menu|modal|dialog|tab|button)\b/i.test(lower);
    if (hasNavVerb && (hasUrl || hasPageRef)) return 'ui_navigation';
    if (hasNavVerb && hasUrl) return 'ui_navigation';

    return 'manual';
}

// ---------------------------------------------------------------------------
// Public: step extraction
// ---------------------------------------------------------------------------

/**
 * Extract all procedural steps from a Markdown document.
 *
 * Recognises:
 *   - Numbered lists: `1.` `1)` `Step 1:` `Step 1.`
 *   - Bulleted lists: `- ` `* ` `+ `
 *   - Task lists:     `- [ ] ` `- [x] `
 *
 * Multi-line steps (continuation via indentation or inline code fences) are
 * merged into a single `DocStep.text`.
 *
 * Returns an empty array when no step-like content is found.
 */
export function extractStepsFromMarkdown(content: string): DocStep[] {
    const steps: DocStep[] = [];
    let stepNumber = 0;
    let currentText = '';
    let inStep = false;
    let inFence = false;

    function flushStep(): void {
        const trimmed = currentText.trim();
        if (!trimmed) return;

        stepNumber++;
        const type = classifyStep(trimmed);
        const step: DocStep = { number: stepNumber, text: trimmed, type };

        if (type === 'api_call') {
            step.url    = extractUrl(trimmed);
            step.method = extractMethod(trimmed) ?? 'GET';
        } else if (type === 'ui_navigation') {
            step.url = extractUrl(trimmed);
        } else if (type === 'cli_command') {
            step.command = extractCommand(trimmed);
        }

        steps.push(step);
        currentText = '';
    }

    const lines = content.split('\n');
    for (const line of lines) {
        // Track code fences so embedded code doesn't trigger new step detection
        if (/^\s*```/.test(line)) {
            inFence = !inFence;
            if (inStep) currentText += '\n' + line;
            continue;
        }
        if (inFence) {
            if (inStep) currentText += '\n' + line;
            continue;
        }

        // Numbered list markers: "1." "1)" or "Step 1:" / "Step 1."
        const numberedRe = /^[ \t]*(?:\d+[.)]\s+|Step\s+\d+\s*[:.]?\s*)/i;
        // Bullet markers: "- " "* " "+ " with optional task-list prefix
        const bulletRe   = /^[ \t]*[-*+]\s+(?:\[[ xX]\]\s*)?/;

        const numMatch    = line.match(numberedRe);
        const bulletMatch = line.match(bulletRe);
        const isNum    = numMatch !== null;
        const isBullet = !isNum && bulletMatch !== null;

        if (isNum || isBullet) {
            flushStep();
            const marker = (isNum ? numMatch! : bulletMatch!)[0]!;
            currentText = line.slice(marker.length).trim();
            inStep = true;
        } else if (inStep && line.trim() !== '' && /^[ \t]{2,}/.test(line)) {
            // Indented continuation line belonging to the current step
            currentText += '\n' + line.trim();
        } else {
            // Any non-list line ends the current step
            flushStep();
            inStep = false;
        }
    }
    flushStep();

    return steps;
}

// ---------------------------------------------------------------------------
// Public: verification report builder
// ---------------------------------------------------------------------------

/**
 * Build a structured Markdown verification report from step results.
 * The returned `markdownReport` is ready to write to disk or attach to a PR.
 */
export function buildVerificationReport(results: StepVerificationResult[]): DocVerificationReport {
    const passCount    = results.filter((r) => r.status === 'pass').length;
    const failCount    = results.filter((r) => r.status === 'fail').length;
    const skippedCount = results.filter((r) => r.status === 'skipped').length;
    const errorCount   = results.filter((r) => r.status === 'error').length;
    const totalSteps   = results.length;

    const now = new Date().toISOString().split('T')[0]!;
    const lines: string[] = [];

    lines.push('# Documentation Step Verification Report');
    lines.push(`\n_Generated: ${now}_\n`);

    const overallTag = failCount + errorCount === 0
        ? '✅ All checked steps passed'
        : `⚠️ ${failCount + errorCount} step(s) need attention`;
    lines.push(`**Overall:** ${overallTag}  `);
    lines.push(`**Total steps:** ${totalSteps}  `);
    lines.push(`**Passed:** ${passCount}  `);
    lines.push(`**Failed:** ${failCount}  `);
    lines.push(`**Errors:** ${errorCount}  `);
    lines.push(`**Skipped (manual / safe-mode CLI):** ${skippedCount}\n`);

    lines.push('## Step-by-Step Results\n');
    lines.push('| # | Type | Status | Details | Endpoint / Command |');
    lines.push('|---|------|--------|---------|--------------------|');

    for (const r of results) {
        const statusBadge =
            r.status === 'pass'    ? '✅ Pass'   :
            r.status === 'fail'    ? '❌ Fail'   :
            r.status === 'error'   ? '🔴 Error'  :
                                     '⏭ Skip';
        const typeLabel =
            r.step.type === 'api_call'      ? '🌐 API'    :
            r.step.type === 'ui_navigation' ? '🖥 UI'     :
            r.step.type === 'cli_command'   ? '⌨ CLI'    :
                                              '📝 Manual';
        const endpointCol = r.step.url
            ? `\`${r.step.url.slice(0, 60)}${r.step.url.length > 60 ? '…' : ''}\``
            : r.step.command
                ? `\`${r.step.command.slice(0, 60)}${r.step.command.length > 60 ? '…' : ''}\``
                : '—';
        const detailsEscaped = r.details.replace(/\|/g, '\\|');
        lines.push(`| ${r.step.number} | ${typeLabel} | ${statusBadge} | ${detailsEscaped} | ${endpointCol} |`);
    }

    // Detailed section for failures / errors
    const needsAttention = results.filter((r) => r.status === 'fail' || r.status === 'error');
    if (needsAttention.length > 0) {
        lines.push('\n## ❌ Steps Requiring Attention\n');
        for (const r of needsAttention) {
            lines.push(`### Step ${r.step.number}\n`);
            const firstLine = r.step.text.split('\n')[0]!.slice(0, 200);
            lines.push(`**Text:** ${firstLine}`);
            if (r.step.url)     lines.push(`**URL checked:** \`${r.step.url}\``);
            if (r.step.command) lines.push(`**Command:** \`${r.step.command}\``);
            if (r.responseCode !== undefined) lines.push(`**HTTP status:** ${r.responseCode}`);
            if (r.durationMs !== undefined)   lines.push(`**Duration:** ${r.durationMs} ms`);
            lines.push(`**Issue:** ${r.details}\n`);
        }
    }

    return {
        totalSteps,
        passCount,
        failCount,
        skippedCount,
        errorCount,
        results,
        markdownReport: lines.join('\n'),
    };
}
