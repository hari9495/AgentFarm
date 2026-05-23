// ============================================================================
// LLM ENHANCER
// Technical Writer Role
//
// Prompt builders for LLM-powered prose generation layered on top of the
// pure-function scaffolding produced by the content builders.
//
// Every builder returns { system, user } — the caller passes these to the
// callLlm callback injected into handleTechnicalWriterAction.
//
// Design rules:
//   - Pure functions; no I/O, no side effects.
//   - Prompts are specific and outcome-oriented — no vague instructions.
//   - Every content prompt instructs the LLM to return the COMPLETE document.
//   - callLlmSafe() wraps every call; LLM failure is always non-fatal.
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Signature of the LLM call callback passed into the action handler.
 * Returns the model's response text, or throws on failure.
 */
export type LlmCallFn = (prompt: string, systemPrompt?: string) => Promise<string>;

export interface LlmPrompt {
    system: string;
    user: string;
}

// ---------------------------------------------------------------------------
// Placeholder detection
// ---------------------------------------------------------------------------

/** Regex that matches _[Add: ...] _ placeholder markers from the builders. */
const PLACEHOLDER_RE = /_\[Add:[^\]]*\]_/;

/**
 * Returns true if the text contains at least one _[Add: ...]_ placeholder.
 * Use this to skip the LLM call when the template has no gaps to fill.
 */
export function hasPlaceholders(text: string): boolean {
    return PLACEHOLDER_RE.test(text);
}

/** Count how many _[Add: ...]_ placeholders exist in the text. */
export function countPlaceholders(text: string): number {
    return (text.match(/_\[Add:[^\]]*\]_/g) ?? []).length;
}

// ---------------------------------------------------------------------------
// Content-format prompt builders
// (manual, tutorial, whitepaper, faq, onboarding)
// ---------------------------------------------------------------------------

export function buildManualProsePrompt(
    template: string,
    context: { title: string; product: string; audience: string },
): LlmPrompt {
    const audienceDesc =
        context.audience === 'developer'
            ? 'software developers integrating or extending the product'
            : context.audience === 'admin'
            ? 'system administrators configuring and managing the product'
            : 'end-users operating the product day-to-day';

    return {
        system:
            'You are an expert technical writer producing user manuals. ' +
            'Write in clear, concise prose. Use active voice. ' +
            'Use numbered steps for procedures and bullet points for lists. ' +
            'Avoid filler phrases and marketing language.',
        user:
            `Complete the user manual for "${context.product}" below.\n` +
            `Target audience: ${audienceDesc}.\n\n` +
            'Fill in EVERY placeholder marked as `_[Add: ...]_` with realistic, ' +
            'professional documentation content appropriate for that section. ' +
            'Keep every heading, table, and code block intact. ' +
            'Return the COMPLETE document — no commentary before or after.\n\n' +
            'MANUAL TEMPLATE:\n' +
            template,
    };
}

export function buildTutorialProsePrompt(
    template: string,
    context: { title: string; level: string; product?: string },
): LlmPrompt {
    const levelDesc =
        context.level === 'advanced'
            ? 'experienced practitioners already familiar with the fundamentals'
            : context.level === 'intermediate'
            ? 'users with basic familiarity who are ready to go deeper'
            : 'complete beginners with no prior experience';

    return {
        system:
            'You are an expert technical writer specializing in step-by-step tutorials. ' +
            'Use a friendly, encouraging tone. Start each step with an imperative verb. ' +
            'Include realistic code examples. Make expected outputs concrete.',
        user:
            `Complete the tutorial "${context.title}"` +
            (context.product ? ` for ${context.product}` : '') +
            `.\nAudience: ${levelDesc}.\n\n` +
            'Fill in EVERY placeholder marked as `_[Add: ...]_` with realistic step ' +
            'descriptions, code examples, expected output snippets, checkpoints, and ' +
            'troubleshooting tips. Keep all Markdown structure intact. ' +
            'Return the COMPLETE tutorial — no commentary.\n\n' +
            'TUTORIAL TEMPLATE:\n' +
            template,
    };
}

export function buildWhitepaperProsePrompt(
    template: string,
    context: { title: string; organization?: string; abstract?: string },
): LlmPrompt {
    return {
        system:
            'You are an expert technical writer specializing in technology white papers. ' +
            'Write in authoritative, evidence-driven prose. ' +
            'Structure arguments logically. Back claims with reasoning. ' +
            'Professional tone throughout — no marketing hyperbole.',
        user:
            `Complete the white paper "${context.title}"` +
            (context.organization ? ` by ${context.organization}` : '') +
            '.\n' +
            (context.abstract ? `Abstract: ${context.abstract}\n\n` : '') +
            'Fill in EVERY placeholder marked as `_[Add: ...]_` with substantive, ' +
            'professional white paper content for that section (2–4 paragraphs each). ' +
            'Keep all Markdown structure, callout boxes, and figures intact. ' +
            'Return the COMPLETE document — no commentary.\n\n' +
            'WHITE PAPER TEMPLATE:\n' +
            template,
    };
}

export function buildFaqProsePrompt(
    template: string,
    context: { title: string; product: string; categories: string[] },
): LlmPrompt {
    return {
        system:
            'You are an expert technical writer creating FAQ documentation. ' +
            'Write Q&A pairs that are specific, actionable, and address real user pain points. ' +
            'Each answer: 2–4 sentences in plain language. ' +
            'No vague answers like "it depends" without elaborating.',
        user:
            `Complete the FAQ "${context.title}" for "${context.product}".\n` +
            `Categories: ${context.categories.join(', ')}.\n\n` +
            'Fill in ALL placeholder Q&A entries marked as `_[Add: ...]_` with realistic, ' +
            'helpful questions and concrete answers. ' +
            'Keep all Markdown headings, anchor links, and cross-links intact. ' +
            'Return the COMPLETE FAQ document — no commentary.\n\n' +
            'FAQ TEMPLATE:\n' +
            template,
    };
}

export function buildOnboardingProsePrompt(
    template: string,
    context: { product: string; role: string },
): LlmPrompt {
    const roleDesc =
        context.role === 'developer'
            ? 'a developer integrating or building on the product'
            : context.role === 'admin'
            ? 'an administrator deploying and managing the product'
            : 'a new end-user learning to use the product for the first time';

    return {
        system:
            'You are an expert technical writer creating onboarding guides. ' +
            'Write in a welcoming, encouraging tone. ' +
            'Each task must be concrete with a clear, verifiable completion state. ' +
            'Completion criteria: 1 specific sentence (e.g. "You can see the dashboard").',
        user:
            `Complete the onboarding guide for "${context.product}" for ${roleDesc}.\n\n` +
            'Fill in ALL placeholders marked as `_[Add: ...]_` with realistic onboarding ' +
            'content. Task descriptions: 1–2 sentences of clear instructions. ' +
            'Welcome message: 3–4 encouraging sentences. ' +
            'Keep all Markdown structure and phase/task structure intact. ' +
            'Return the COMPLETE guide — no commentary.\n\n' +
            'ONBOARDING TEMPLATE:\n' +
            template,
    };
}

// ---------------------------------------------------------------------------
// Analysis-enhancement prompt builders
// (doc_diff, sme_interview, release_notes, api_doc)
// ---------------------------------------------------------------------------

/**
 * Builds a prompt to write a prose narrative summary of code changes.
 * The LLM's output is prepended to the structured diff breakdown as
 * a "Summary" section, giving the document a human-readable lead.
 */
export function buildDocDiffNarrativePrompt(
    changedFiles: Array<{ file: string; additions: number; deletions: number; changed_symbols: string[] }>,
    docTitle: string,
    extraContext?: string,
): LlmPrompt {
    const changeList = changedFiles
        .slice(0, 20)
        .map(
            (f) =>
                `- \`${f.file}\`: +${f.additions}/-${f.deletions} lines` +
                (f.changed_symbols.length > 0
                    ? `, changed symbols: ${f.changed_symbols.join(', ')}`
                    : ''),
        )
        .join('\n');

    return {
        system:
            'You are an expert technical writer describing code changes in user-facing documentation. ' +
            'Focus on user impact, not implementation details. ' +
            'Active voice, present tense. Concise — no filler.',
        user:
            `Write a documentation change summary for "${docTitle}" based on these code changes:\n\n` +
            changeList +
            (extraContext ? `\n\nAdditional context:\n${extraContext}` : '') +
            '\n\nWrite a Markdown section titled "## Summary" with:\n' +
            '1. A 1–2 sentence overview of what changed\n' +
            '2. New features or capabilities (if any)\n' +
            '3. Breaking changes or deprecated items (if any)\n' +
            '4. What users should do as a result (if anything)\n\n' +
            'Return ONLY the Markdown section — no document title, no preamble.',
    };
}

/**
 * Builds a prompt to write a professional doc brief from SME interview Q&A.
 * Replaces the auto-generated template brief with flowing, synthesised prose.
 */
export function buildSmeBriefProsePrompt(
    questionsAndResponses: Array<{ question: string; answer: string; category: string }>,
    title: string,
): LlmPrompt {
    const qaText = questionsAndResponses
        .map((qa) => `**[${qa.category}]** Q: ${qa.question}\nA: ${qa.answer || '_(No response)_'}`)
        .join('\n\n');

    return {
        system:
            'You are an expert technical writer synthesising SME interview responses into a ' +
            'documentation brief. Extract essential information needed to write accurate, ' +
            'complete documentation. Be specific — do not invent facts not in the responses.',
        user:
            `Write a documentation brief for "${title}" from the following SME interview responses:\n\n` +
            qaText +
            '\n\nStructure the brief as Markdown with these sections:\n' +
            '## What It Is — 2–3 sentences describing the feature or topic\n' +
            '## Who Uses It — target audience and their goals\n' +
            '## How It Works — key technical or operational details\n' +
            '## Prerequisites — what users need before starting\n' +
            '## Key Steps / Use Cases — numbered or bulleted list\n' +
            '## Common Issues — any errors or edge cases from the responses\n' +
            '## Open Questions — items unclear from the responses needing follow-up\n\n' +
            'Return ONLY the Markdown brief — no preamble or commentary.',
    };
}

/**
 * Builds a prompt to improve auto-generated release notes.
 * Terse commit messages become user-facing, impact-focused sentences.
 */
export function buildReleaseNotesEnhancementPrompt(
    notesMarkdown: string,
): LlmPrompt {
    return {
        system:
            'You are an expert technical writer improving auto-generated release notes. ' +
            'Expand terse git commit messages into clear user-facing change descriptions. ' +
            'Focus on user impact. Keep it concise — 1 sentence per change.',
        user:
            'Improve the following auto-generated release notes. ' +
            'For each bullet point, rewrite the terse commit message as a clear, ' +
            'user-facing sentence that explains WHAT changed and WHY it matters.\n\n' +
            'Rules:\n' +
            '- Keep every section heading and the overall document structure exactly\n' +
            '- Keep commit hashes in backtick-parentheses at the end of each bullet\n' +
            '- Replace implementation jargon with user-impact language\n' +
            '- Do not add or remove sections\n' +
            '- Return the COMPLETE release notes document — no commentary\n\n' +
            'RELEASE NOTES:\n' +
            notesMarkdown,
    };
}

/**
 * Builds a prompt to fill missing endpoint and parameter descriptions in
 * auto-generated API reference documentation.
 */
export function buildApiDocEnhancementPrompt(
    markdown: string,
    apiTitle: string,
): LlmPrompt {
    return {
        system:
            'You are an expert API documentation writer. ' +
            'Fill in missing descriptions to help developers integrate quickly. ' +
            'Be specific about behaviour, constraints, and error conditions.',
        user:
            `Enhance the API reference documentation for "${apiTitle}".\n\n` +
            'For any endpoint, parameter, or response that has an empty or very brief description:\n' +
            '- Write 1–2 sentences explaining what it does\n' +
            '- Describe expected input format or constraints if relevant\n' +
            '- Note important side effects or error conditions if applicable\n\n' +
            'Keep ALL existing content and Markdown structure intact. ' +
            'Only add or expand descriptions — do not remove anything. ' +
            'Return the COMPLETE enhanced documentation — no commentary.\n\n' +
            'API DOCUMENTATION:\n' +
            markdown,
    };
}

/**
 * Builds a prompt to improve auto-generated code API documentation by
 * writing natural-language descriptions for symbols that have none.
 */
export function buildCodeDocEnhancementPrompt(
    markdown: string,
    filePaths: string[],
): LlmPrompt {
    return {
        system:
            'You are an expert technical writer documenting TypeScript/JavaScript APIs. ' +
            'Write concise, accurate descriptions. Infer intent from function names, ' +
            'parameter names, and return types. If you cannot infer, say so briefly.',
        user:
            `Enhance the code API documentation for: ${filePaths.join(', ')}.\n\n` +
            'For every symbol that has an empty description or only shows its signature:\n' +
            '- Write 1–2 sentences describing what it does and when to use it\n' +
            '- If it has parameters, clarify any non-obvious constraints\n' +
            '- If it returns a value, clarify what the return represents\n\n' +
            'Keep ALL existing content and Markdown structure intact. ' +
            'Return the COMPLETE enhanced documentation — no commentary.\n\n' +
            'CODE DOCUMENTATION:\n' +
            markdown,
    };
}

// ---------------------------------------------------------------------------
// Safe call wrapper
// ---------------------------------------------------------------------------

/**
 * Calls the LLM with the given prompt and returns the result, or null on
 * failure. Failure is always non-fatal: the caller falls back to the
 * pure-function template.
 *
 * A response is rejected (returns null) if:
 *  - callLlm throws
 *  - The response is empty or very short (< 80 chars — clearly a failure)
 */
export async function callLlmSafe(
    callLlm: LlmCallFn,
    prompt: LlmPrompt,
): Promise<string | null> {
    try {
        const result = await callLlm(prompt.user, prompt.system);
        if (typeof result === 'string' && result.trim().length >= 80) {
            return result.trim();
        }
        return null;
    } catch {
        return null;
    }
}
