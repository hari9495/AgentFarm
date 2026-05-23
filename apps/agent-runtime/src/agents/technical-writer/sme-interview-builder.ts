// ============================================================================
// SME INTERVIEW BUILDER
// Sprint 16 — Technical Writer Role
//
// Generates structured Subject Matter Expert (SME) interview plans from
// source code or feature descriptions, and synthesises SME responses into
// a documentation brief ready for the TW agent to expand.
//
// Pure functions — no connector calls, no LLM calls.
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SmeQuestionCategory =
    | 'intent'
    | 'audience'
    | 'prerequisites'
    | 'use-cases'
    | 'errors'
    | 'limitations'
    | 'related'
    | 'maintenance';

export interface SmeInterviewQuestion {
    id: string;
    category: SmeQuestionCategory;
    question: string;
    /** Optional code snippet or context extracted to anchor the question. */
    context?: string;
    /** Whether this is a required question (vs. optional follow-up). */
    required: boolean;
}

export interface SmeInterviewPlan {
    title: string;
    featureSummary: string;
    questions: SmeInterviewQuestion[];
    /** Markdown output ready to paste into a GitHub issue, Confluence page, or Slack thread. */
    markdownOutput: string;
}

export interface SmeInterviewResponse {
    questionId: string;
    answer: string;
}

export interface SmeDocBrief {
    title: string;
    /** Target audience inferred from SME responses. */
    audience: string;
    /** Key points to cover in the documentation. */
    keyPoints: string[];
    /** Open questions that need follow-up. */
    openQuestions: string[];
    /** Ready-to-expand documentation outline in Markdown. */
    markdownBrief: string;
}

// ---------------------------------------------------------------------------
// Category metadata
// ---------------------------------------------------------------------------

const CATEGORY_META: Record<SmeQuestionCategory, { label: string; emoji: string }> = {
    intent:        { label: 'Purpose & Intent',          emoji: '🎯' },
    audience:      { label: 'Target Audience',           emoji: '👤' },
    prerequisites: { label: 'Prerequisites & Setup',     emoji: '⚙️' },
    'use-cases':   { label: 'Common Use Cases',          emoji: '📋' },
    errors:        { label: 'Error Handling',            emoji: '⚠️' },
    limitations:   { label: 'Limitations & Constraints', emoji: '🚧' },
    related:       { label: 'Related Concepts',          emoji: '🔗' },
    maintenance:   { label: 'Maintenance & Updates',     emoji: '🔧' },
};

// ---------------------------------------------------------------------------
// Code-analysis helpers
// ---------------------------------------------------------------------------

type ExtractedCodeContext = {
    exportedSymbols: string[];
    publicMethods: string[];
    errorTypes: string[];
    configKeys: string[];
    sideEffects: string[];
};

function analyzeCode(source: string): ExtractedCodeContext {
    const exported: string[] = [];
    const methods: string[] = [];
    const errors: string[] = [];
    const configKeys: string[] = [];
    const sideEffects: string[] = [];

    // Exported symbols
    for (const m of source.matchAll(/^export\s+(?:async\s+)?(?:function|class|const|interface|type)\s+(\w+)/gm)) {
        const name = m[1];
        if (name) exported.push(name);
    }

    // Public methods in classes
    for (const m of source.matchAll(/^\s{2,4}(?:async\s+)?(?:public\s+)?(\w+)\s*\([^)]*\)\s*(?::\s*\S+)?\s*\{/gm)) {
        const name = m[1];
        if (name && !['constructor', 'if', 'for', 'while', 'switch'].includes(name ?? '')) {
            methods.push(name);
        }
    }

    // Error types / thrown errors
    for (const m of source.matchAll(/throw new (\w+Error|\w+Exception)/g)) {
        if (m[1] && !errors.includes(m[1])) errors.push(m[1]);
    }
    for (const m of source.matchAll(/new Error\(['"`]([^'"`)]{3,60})/g)) {
        if (m[1]) errors.push(m[1].slice(0, 60));
    }

    // Config/env keys
    for (const m of source.matchAll(/process\.env\.([A-Z_]{3,})/g)) {
        if (m[1] && !configKeys.includes(m[1])) configKeys.push(m[1]);
    }
    for (const m of source.matchAll(/(?:config|options|settings)\[['"](\w+)['"]\]/g)) {
        if (m[1] && !configKeys.includes(m[1])) configKeys.push(m[1]);
    }

    // Side-effect indicators
    if (/\bfetch\b|\baxios\b|\bhttpClient\b/.test(source)) sideEffects.push('HTTP requests');
    if (/\breadFile\b|\bwriteFile\b|\bfs\./.test(source)) sideEffects.push('filesystem access');
    if (/\bnew.*Client\b|\bconnect\b/.test(source)) sideEffects.push('external service connection');
    if (/\bemit\b|\beventEmitter\b/.test(source)) sideEffects.push('event emission');

    return { exportedSymbols: exported, publicMethods: methods, errorTypes: errors, configKeys, sideEffects };
}

// ---------------------------------------------------------------------------
// Question generation
// ---------------------------------------------------------------------------

/** Returns a per-call counter factory so concurrent invocations get independent IDs. */
function makeIdGenerator(): (prefix: string) => string {
    let counter = 0;
    return (prefix: string) => `${prefix}-${++counter}`;
}

function generateQuestionsFromCode(source: string, filePath: string, nextId: (prefix: string) => string): SmeInterviewQuestion[] {
    const ctx = analyzeCode(source);
    const questions: SmeInterviewQuestion[] = [];
    const fileName = filePath.split(/[/\\]/).pop() ?? filePath;

    // Intent questions
    questions.push({
        id: nextId('intent'),
        category: 'intent',
        question: `What problem does \`${fileName}\` solve, and why was it built this way rather than using an existing library?`,
        required: true,
    });

    if (ctx.exportedSymbols.length > 0) {
        const primary = ctx.exportedSymbols.slice(0, 3).map((s) => `\`${s}\``).join(', ');
        questions.push({
            id: nextId('intent'),
            category: 'intent',
            question: `What is the primary responsibility of ${primary}? What should callers never do with these exports?`,
            context: `Exported: ${ctx.exportedSymbols.join(', ')}`,
            required: true,
        });
    }

    // Audience questions
    questions.push({
        id: nextId('audience'),
        category: 'audience',
        question: 'Who is the primary consumer of this API — internal services, external developers, or end users?',
        required: true,
    });
    questions.push({
        id: nextId('audience'),
        category: 'audience',
        question: 'What level of experience should readers have before using this documentation?',
        required: false,
    });

    // Prerequisites
    if (ctx.configKeys.length > 0) {
        const keys = ctx.configKeys.slice(0, 5).map((k) => `\`${k}\``).join(', ');
        questions.push({
            id: nextId('prerequisites'),
            category: 'prerequisites',
            question: `What values must be set for ${keys} before using this feature? Are there defaults?`,
            context: `Config/env keys detected: ${ctx.configKeys.join(', ')}`,
            required: true,
        });
    }
    if (ctx.sideEffects.length > 0) {
        questions.push({
            id: nextId('prerequisites'),
            category: 'prerequisites',
            question: `This module performs ${ctx.sideEffects.join(' and ')}. What external dependencies or credentials must be configured first?`,
            context: `Detected side effects: ${ctx.sideEffects.join(', ')}`,
            required: true,
        });
    }

    // Use cases
    questions.push({
        id: nextId('use-cases'),
        category: 'use-cases',
        question: 'Walk me through the most common end-to-end use case step by step.',
        required: true,
    });
    if (ctx.publicMethods.length > 2) {
        questions.push({
            id: nextId('use-cases'),
            category: 'use-cases',
            question: `Are ${ctx.publicMethods.slice(0, 3).map((m) => `\`${m}\``).join(', ')} typically called in sequence, or independently?`,
            context: `Methods detected: ${ctx.publicMethods.join(', ')}`,
            required: false,
        });
    }

    // Error handling
    if (ctx.errorTypes.length > 0) {
        questions.push({
            id: nextId('errors'),
            category: 'errors',
            question: `What should the caller do when these errors are thrown: ${ctx.errorTypes.slice(0, 4).join(', ')}? Are any of them recoverable?`,
            context: `Thrown errors: ${ctx.errorTypes.join(', ')}`,
            required: true,
        });
    } else {
        questions.push({
            id: nextId('errors'),
            category: 'errors',
            question: 'What are the most common error scenarios, and what recovery steps should the user take?',
            required: true,
        });
    }

    // Limitations
    questions.push({
        id: nextId('limitations'),
        category: 'limitations',
        question: 'What are the known limitations, edge cases, or anti-patterns callers should avoid?',
        required: true,
    });
    questions.push({
        id: nextId('limitations'),
        category: 'limitations',
        question: 'Are there performance ceilings (e.g., max record count, rate limits, timeout thresholds)?',
        required: false,
    });

    // Related concepts
    questions.push({
        id: nextId('related'),
        category: 'related',
        question: 'What other features, modules, or concepts should this documentation link to?',
        required: false,
    });

    // Maintenance
    questions.push({
        id: nextId('maintenance'),
        category: 'maintenance',
        question: 'How often does this feature change? What should trigger a documentation update?',
        required: false,
    });

    return questions;
}

function generateQuestionsFromDescription(description: string, nextId: (prefix: string) => string): SmeInterviewQuestion[] {
    const questions: SmeInterviewQuestion[] = [];
    const titleLine = description.split('\n')[0]?.slice(0, 60) ?? 'this feature';

    questions.push({
        id: nextId('intent'),
        category: 'intent',
        question: `What is the core problem that "${titleLine}" solves? Why is this the right solution?`,
        required: true,
    });
    questions.push({
        id: nextId('audience'),
        category: 'audience',
        question: 'Who are the primary users of this feature — developers, end users, or admins?',
        required: true,
    });
    questions.push({
        id: nextId('prerequisites'),
        category: 'prerequisites',
        question: 'What must users set up or know before using this feature?',
        required: true,
    });
    questions.push({
        id: nextId('use-cases'),
        category: 'use-cases',
        question: 'Describe the three most common use cases in order of frequency.',
        required: true,
    });
    questions.push({
        id: nextId('errors'),
        category: 'errors',
        question: 'What are the most common errors users encounter, and what are the correct remediation steps?',
        required: true,
    });
    questions.push({
        id: nextId('limitations'),
        category: 'limitations',
        question: 'What are the known limitations, and are there workarounds?',
        required: true,
    });
    questions.push({
        id: nextId('related'),
        category: 'related',
        question: 'What related documentation or features should be referenced?',
        required: false,
    });
    questions.push({
        id: nextId('maintenance'),
        category: 'maintenance',
        question: 'How will this feature evolve in future releases? Are there deprecation plans?',
        required: false,
    });

    return questions;
}

// ---------------------------------------------------------------------------
// Interview plan builder
// ---------------------------------------------------------------------------

function buildInterviewMarkdown(plan: SmeInterviewPlan): string {
    const lines: string[] = [];
    lines.push(`# SME Interview Plan: ${plan.title}`);
    lines.push('');
    if (plan.featureSummary) {
        lines.push(`> ${plan.featureSummary}`);
        lines.push('');
    }

    const byCategory = new Map<SmeQuestionCategory, SmeInterviewQuestion[]>();
    for (const q of plan.questions) {
        if (!byCategory.has(q.category)) byCategory.set(q.category, []);
        byCategory.get(q.category)!.push(q);
    }

    const order: SmeQuestionCategory[] = ['intent', 'audience', 'prerequisites', 'use-cases', 'errors', 'limitations', 'related', 'maintenance'];
    for (const cat of order) {
        const qs = byCategory.get(cat);
        if (!qs || qs.length === 0) continue;
        const { label, emoji } = CATEGORY_META[cat];
        lines.push(`## ${emoji} ${label}`);
        lines.push('');
        for (const q of qs) {
            const marker = q.required ? '**[Required]**' : '*[Optional]*';
            lines.push(`### ${q.id} ${marker}`);
            lines.push('');
            lines.push(q.question);
            if (q.context) lines.push(`\n> _Context: ${q.context}_`);
            lines.push('');
            lines.push('**Answer:**');
            lines.push('');
            lines.push('_[Leave blank — to be filled by SME]_');
            lines.push('');
        }
    }

    return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Doc brief synthesis from SME responses
// ---------------------------------------------------------------------------

function buildDocBriefFromResponses(
    questions: SmeInterviewQuestion[],
    responses: SmeInterviewResponse[],
): SmeDocBrief {
    const answerMap = new Map(responses.map((r) => [r.questionId, r.answer.trim()]));
    const keyPoints: string[] = [];
    const openQuestions: string[] = [];
    let audience = 'developers';

    for (const q of questions) {
        const answer = answerMap.get(q.id);
        const unanswered = !answer || answer.length < 5;

        if (unanswered && q.required) {
            openQuestions.push(`${q.id}: ${q.question}`);
            continue;
        }
        if (unanswered) continue;

        // Extract audience from the audience category answers
        if (q.category === 'audience' && answer) {
            audience = answer.slice(0, 120);
        }

        keyPoints.push(`**${CATEGORY_META[q.category].label}**: ${answer!.slice(0, 200)}`);
    }

    const title = questions[0]?.context
        ?? questions.find((q) => q.category === 'intent')?.question.slice(0, 60)
        ?? 'Feature Documentation Brief';

    const brief = buildDocBriefMarkdown({ title, audience, keyPoints, openQuestions });

    return { title, audience, keyPoints, openQuestions, markdownBrief: brief };
}

function buildDocBriefMarkdown(brief: Omit<SmeDocBrief, 'markdownBrief'>): string {
    const now = new Date().toISOString().split('T')[0];
    const lines: string[] = [];

    lines.push(`# Documentation Brief: ${brief.title}`);
    lines.push(`\n_Synthesised from SME interview — ${now}_\n`);
    lines.push(`**Target audience:** ${brief.audience}\n`);

    if (brief.keyPoints.length > 0) {
        lines.push('## Key Points to Cover\n');
        for (const kp of brief.keyPoints) lines.push(`- ${kp}`);
        lines.push('');
    }

    if (brief.openQuestions.length > 0) {
        lines.push('## Open Questions (Follow-up Required)\n');
        for (const oq of brief.openQuestions) lines.push(`- [ ] ${oq}`);
        lines.push('');
    }

    lines.push('## Suggested Documentation Outline\n');
    lines.push('1. Overview — what it is and why it exists');
    lines.push('2. Prerequisites — what must be set up first');
    lines.push('3. Quick start — the most common use case, end to end');
    lines.push('4. Reference — all options, parameters, and return values');
    lines.push('5. Error reference — each error code with remediation steps');
    lines.push('6. Limitations — what it does not do, and workarounds');
    lines.push('7. Related resources — links to adjacent docs');

    return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build an SME interview plan from source code.
 * Use when the TW agent has access to the code but no human context yet.
 */
export function buildInterviewPlanFromCode(
    source: string,
    filePath: string,
    featureSummary = '',
): SmeInterviewPlan {
    const nextId = makeIdGenerator();
    const questions = generateQuestionsFromCode(source, filePath, nextId);
    const title = filePath.split(/[/\\]/).pop() ?? filePath;
    const plan: SmeInterviewPlan = { title, featureSummary, questions, markdownOutput: '' };
    plan.markdownOutput = buildInterviewMarkdown(plan);
    return plan;
}

/**
 * Build an SME interview plan from a natural-language feature description.
 * Use when no code is available yet (e.g., early design phase).
 */
export function buildInterviewPlanFromDescription(
    description: string,
    title = '',
): SmeInterviewPlan {
    const nextId = makeIdGenerator();
    const questions = generateQuestionsFromDescription(description, nextId);
    const resolvedTitle = title || (description.split('\n')[0]?.slice(0, 60) ?? 'Feature');
    const plan: SmeInterviewPlan = { title: resolvedTitle, featureSummary: description.slice(0, 200), questions, markdownOutput: '' };
    plan.markdownOutput = buildInterviewMarkdown(plan);
    return plan;
}

/**
 * Synthesise SME answers into a documentation brief.
 * Call after the SME has filled in the interview plan.
 */
export function synthesiseDocBrief(
    questions: SmeInterviewQuestion[],
    responses: SmeInterviewResponse[],
): SmeDocBrief {
    return buildDocBriefFromResponses(questions, responses);
}
