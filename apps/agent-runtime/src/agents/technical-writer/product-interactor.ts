// ============================================================================
// PRODUCT INTERACTOR
// Technical Writer Role
//
// Pure functions for building and interpreting multi-step product interaction
// sessions (navigate → login → fill → click → assert → read).
//
// The executor runs the actual browser interactions via a persistent Playwright
// page; this module only processes the results into structured reports the
// TW agent can use when writing documentation.
//
// buildInteractionReport    — markdown report + observed feature list
// extractObservedFeatures   — pull distinct UI labels from captured page text
//
// All pure functions — no I/O, no browser calls, no LLM calls.
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type InteractionStepType =
    | 'navigate'   // go to a URL (no auth required)
    | 'login'      // navigate + fill credentials
    | 'fill'       // fill named form fields on the current page
    | 'click'      // click a button / link by visible text
    | 'read'       // capture the current page state
    | 'assert';    // verify visible text exists on the current page

/** One instruction in an interaction sequence. */
export interface InteractionStep {
    type: InteractionStepType;
    /** Human-readable label for reports */
    label?: string;
    /** navigate / login: destination URL */
    url?: string;
    /** login: credential pair */
    credentials?: { username: string; password: string };
    /** fill: field-name → value map */
    fields?: Record<string, string>;
    /** click: visible text of the target element */
    target?: string;
    /** assert: text that must appear on the current page */
    expected?: string;
}

/** Outcome of executing one InteractionStep. */
export interface InteractionStepResult {
    step: InteractionStep;
    status: 'pass' | 'fail' | 'error';
    details: string;
    /** Page title after the step completed */
    pageTitle?: string;
    /** First 2000 chars of the page body text */
    pageText?: string;
    /** Absolute path of a screenshot, if captured */
    screenshotPath?: string;
}

/** Aggregate report for one interaction session. */
export interface ProductInteractionReport {
    totalSteps: number;
    passCount: number;
    failCount: number;
    /** Distinct UI feature labels observed across all pages */
    observedFeatures: string[];
    /** Pages seen during the session */
    observedPages: Array<{ title: string; text: string }>;
    results: InteractionStepResult[];
    markdownReport: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Pull out UI labels (button texts, headings) from a page body string. */
function extractFeaturesFromText(text: string): string[] {
    const features = new Set<string>();
    // H1–H3 headings
    for (const m of text.matchAll(/^#{1,3}\s+(.{3,60})/gm)) {
        if (m[1]) features.add(m[1].trim());
    }
    // Lines that look like nav/button labels (short, title-cased, no punctuation)
    for (const line of text.split('\n')) {
        const t = line.trim();
        if (t.length >= 3 && t.length <= 40 && /^[A-Z]/.test(t) && !/[.?!,;]$/.test(t)) {
            features.add(t);
        }
    }
    return [...features].slice(0, 50);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Extract distinct UI feature labels (button texts, headings, nav items)
 * observed across all page captures during an interaction session.
 * These are verbatim product strings the TW agent can use in documentation.
 */
export function extractObservedFeatures(results: InteractionStepResult[]): string[] {
    const all = results
        .filter((r) => r.pageText)
        .flatMap((r) => extractFeaturesFromText(r.pageText!));
    return [...new Set(all)].slice(0, 100);
}

/**
 * Build a structured Markdown interaction report from session results.
 * The report lists every step with its outcome and summarises the UI
 * features the agent observed — ready to include in a documentation PR.
 */
export function buildInteractionReport(results: InteractionStepResult[]): ProductInteractionReport {
    const passCount = results.filter((r) => r.status === 'pass').length;
    const failCount = results.filter((r) => r.status !== 'pass').length;
    const observedFeatures = extractObservedFeatures(results);
    const observedPages = results
        .filter((r) => r.pageTitle && r.pageText)
        .map((r) => ({ title: r.pageTitle!, text: r.pageText!.slice(0, 1000) }));

    const now = new Date().toISOString().split('T')[0]!;
    const lines: string[] = [];

    lines.push('# Product Interaction Report');
    lines.push(`\n_Generated: ${now} — ${results.length} step(s) executed_\n`);

    const tag = failCount === 0
        ? '✅ All steps succeeded'
        : `⚠️ ${failCount} step(s) failed`;
    lines.push(`**Overall:** ${tag}  `);
    lines.push(`**Passed:** ${passCount} / ${results.length}\n`);

    if (observedFeatures.length > 0) {
        lines.push('## Observed UI Labels\n');
        lines.push('_Use these verbatim in documentation — they are the actual product strings:_\n');
        observedFeatures.slice(0, 25).forEach((f) => lines.push(`- ${f}`));
        lines.push('');
    }

    lines.push('## Step Results\n');
    lines.push('| # | Type | Label | Status | Details |');
    lines.push('|---|------|-------|--------|---------|');
    results.forEach((r, i) => {
        const badge = r.status === 'pass' ? '✅' : r.status === 'fail' ? '❌' : '🔴';
        const label = (r.step.label || r.step.url || r.step.target || r.step.type).slice(0, 40);
        const details = r.details.replace(/\|/g, '\\|').slice(0, 100);
        lines.push(`| ${i + 1} | ${r.step.type} | ${label} | ${badge} ${r.status} | ${details} |`);
    });

    if (observedPages.length > 0) {
        lines.push('\n## Pages Observed\n');
        for (const p of observedPages.slice(0, 5)) {
            lines.push(`### ${p.title}\n`);
            lines.push(`> ${p.text.slice(0, 400).replace(/\n+/g, '\n> ')}\n`);
        }
    }

    return {
        totalSteps: results.length,
        passCount,
        failCount,
        observedFeatures,
        observedPages,
        results,
        markdownReport: lines.join('\n'),
    };
}
