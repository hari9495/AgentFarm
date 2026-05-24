// ============================================================================
// FSD SPEC ANALYZER
// Sprint 16 — Full-Stack Developer Role
//
// Ambiguity resolution: before starting implementation work the agent checks
// whether the task specification is complete enough to act on. If not, it
// produces a structured list of clarifying questions for the human to answer.
//
// analyzeSpecCompleteness     → scores 0–100, flags every gap
// generateClarifyingQuestions → maps gaps to actionable questions
// buildClarificationPrompt    → LLM prompt (if LLM enrichment is wanted)
// parseLlmClarificationResponse → structures free-form LLM questions
// formatQuestionsForHuman     → formats question list for display / Slack
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SpecGapKind =
    | 'missing_title'
    | 'missing_description'
    | 'vague_description'
    | 'missing_acceptance_criteria'
    | 'missing_framework'
    | 'missing_design'
    | 'missing_api_contract'
    | 'missing_auth_requirements'
    | 'missing_error_handling'
    | 'missing_performance_targets'
    | 'missing_browser_support'
    | 'conflicting_requirements'
    | 'ambiguous_scope';

export type QuestionPriority = 'blocking' | 'important' | 'nice_to_have';

export interface SpecGap {
    kind:    SpecGapKind;
    detail:  string;
}

export interface ClarifyingQuestion {
    id:       string;
    priority: QuestionPriority;
    gap:      SpecGapKind;
    question: string;
    context:  string;           // why this matters for implementation
    options?: string[];         // suggested answer choices if applicable
}

export interface SpecAnalysis {
    score:              number;    // 0–100 — 100 means fully specified
    isReadyToImplement: boolean;   // true when score ≥ 70 and no blocking gaps
    gaps:               SpecGap[];
    questions:          ClarifyingQuestion[];
    summary:            string;
}

// ---------------------------------------------------------------------------
// analyzeSpecCompleteness
// ---------------------------------------------------------------------------

interface RawSpec {
    title?:               string;
    description?:         string;
    acceptance_criteria?: string | string[];
    framework?:           string;
    figma_url?:           string;
    design?:              string;
    endpoints?:           unknown[];
    api_contract?:        string;
    auth?:                string;
    error_handling?:      string;
    performance?:         string;
    browser_support?:     string;
}

/**
 * Analyses a raw task spec payload and returns a completeness score plus the
 * list of gaps and clarifying questions. Pure function — no I/O.
 */
export function analyzeSpecCompleteness(spec: RawSpec): SpecAnalysis {
    const gaps: SpecGap[] = [];

    // ── Required: title ──────────────────────────────────────────────────────
    if (!spec.title?.trim()) {
        gaps.push({ kind: 'missing_title', detail: 'No task title provided.' });
    }

    // ── Required: description ────────────────────────────────────────────────
    const desc = spec.description?.trim() ?? '';
    if (!desc) {
        gaps.push({ kind: 'missing_description', detail: 'No description provided.' });
    } else if (desc.split(/\s+/).length < 20) {
        gaps.push({
            kind:   'vague_description',
            detail: `Description is only ${desc.split(/\s+/).length} words — too brief to implement without guessing.`,
        });
    }

    // ── Required: acceptance criteria ────────────────────────────────────────
    const ac = spec.acceptance_criteria;
    const hasAc = Array.isArray(ac) ? ac.length > 0 : !!ac?.trim();
    if (!hasAc) {
        gaps.push({ kind: 'missing_acceptance_criteria', detail: 'No acceptance criteria defined — no way to verify done-ness.' });
    }

    // ── Important: framework ─────────────────────────────────────────────────
    if (!spec.framework?.trim()) {
        gaps.push({ kind: 'missing_framework', detail: 'Frontend framework not specified (React, Vue, Angular, …).' });
    }

    // ── Important: design ────────────────────────────────────────────────────
    const hasDesign = !!(spec.figma_url?.trim() || spec.design?.trim());
    if (!hasDesign) {
        gaps.push({ kind: 'missing_design', detail: 'No Figma link or design description — component layout is ambiguous.' });
    }

    // ── Important: API contract (if endpoints mentioned) ─────────────────────
    const hasEndpoints = Array.isArray(spec.endpoints) && spec.endpoints.length > 0;
    const hasApiContract = !!(spec.api_contract?.trim());
    if (descMentionsApi(desc) && !hasEndpoints && !hasApiContract) {
        gaps.push({ kind: 'missing_api_contract', detail: 'Description mentions API/backend work but no endpoints or contract provided.' });
    }

    // ── Nice-to-have: auth requirements ─────────────────────────────────────
    if (descMentionsAuth(desc) && !spec.auth?.trim()) {
        gaps.push({ kind: 'missing_auth_requirements', detail: 'Description mentions auth/permissions but requirements are not specified.' });
    }

    // ── Nice-to-have: error handling ─────────────────────────────────────────
    if (!spec.error_handling?.trim()) {
        gaps.push({ kind: 'missing_error_handling', detail: 'No error-handling expectations stated (loading states, empty states, API errors).' });
    }

    // ── Nice-to-have: performance / browser support ───────────────────────────
    if (!spec.performance?.trim()) {
        gaps.push({ kind: 'missing_performance_targets', detail: 'No performance targets stated (LCP, bundle size, TTI).' });
    }
    if (!spec.browser_support?.trim()) {
        gaps.push({ kind: 'missing_browser_support', detail: 'No browser/device support matrix stated.' });
    }

    // ── Score ────────────────────────────────────────────────────────────────
    const blockingGaps   = gaps.filter((g) => isBlocking(g.kind));
    const importantGaps  = gaps.filter((g) => isImportant(g.kind));
    const niceToHaveGaps = gaps.filter((g) => !isBlocking(g.kind) && !isImportant(g.kind));

    const score = Math.max(0, 100
        - blockingGaps.length   * 25
        - importantGaps.length  * 10
        - niceToHaveGaps.length *  3,
    );
    const isReadyToImplement = score >= 70 && blockingGaps.length === 0;

    const questions = generateClarifyingQuestions(gaps, spec.title ?? 'this task');

    const summary = isReadyToImplement
        ? `Spec is complete enough to start (score ${score}/100). ${gaps.length} minor gap(s) noted.`
        : `Spec needs clarification before implementation (score ${score}/100). ${blockingGaps.length} blocking gap(s).`;

    return { score, isReadyToImplement, gaps, questions, summary };
}

// ---------------------------------------------------------------------------
// generateClarifyingQuestions
// ---------------------------------------------------------------------------

/**
 * Converts a list of spec gaps into prioritised, actionable questions.
 * Pure function.
 */
export function generateClarifyingQuestions(gaps: SpecGap[], taskTitle: string): ClarifyingQuestion[] {
    return gaps.map((gap, idx) => {
        const id = `Q${String(idx + 1).padStart(2, '0')}`;
        return gapToQuestion(id, gap, taskTitle);
    });
}

function gapToQuestion(id: string, gap: SpecGap, taskTitle: string): ClarifyingQuestion {
    switch (gap.kind) {
        case 'missing_title':
            return {
                id, priority: 'blocking', gap: gap.kind,
                question: 'What should this task be called?',
                context:  'A clear title helps scope the work and name the generated files.',
            };

        case 'missing_description':
        case 'vague_description':
            return {
                id, priority: 'blocking', gap: gap.kind,
                question: `Can you describe "${taskTitle}" in more detail? What should it do, and for whom?`,
                context:  'A clear description is required to generate correct component logic and API calls.',
            };

        case 'missing_acceptance_criteria':
            return {
                id, priority: 'blocking', gap: gap.kind,
                question: `What are the acceptance criteria for "${taskTitle}"? When can we call it done?`,
                context:  'Acceptance criteria define what tests to write and when the feature is shippable.',
                options:  ['User can see X', 'API returns Y within Zms', 'Form validates field A and shows error B'],
            };

        case 'missing_framework':
            return {
                id, priority: 'important', gap: gap.kind,
                question: 'Which frontend framework should the component be built in?',
                context:  'The generated component code, file extension, and test setup depend on this.',
                options:  ['React', 'Vue', 'Angular', 'Svelte', 'Solid'],
            };

        case 'missing_design':
            return {
                id, priority: 'important', gap: gap.kind,
                question: 'Is there a Figma design or visual reference for this component?',
                context:  'Without a design the agent generates a generic layout — a Figma link enables pixel-accurate output.',
                options:  ['Yes — Figma URL: …', 'No design yet, use sensible defaults', 'Describe it in words'],
            };

        case 'missing_api_contract':
            return {
                id, priority: 'important', gap: gap.kind,
                question: 'What are the API endpoints this feature needs? (method, path, request body, response shape)',
                context:  'The agent generates typed API clients — endpoint definitions are required for accurate types.',
            };

        case 'missing_auth_requirements':
            return {
                id, priority: 'important', gap: gap.kind,
                question: 'Who can access this feature, and how is access controlled?',
                context:  'Auth requirements determine whether the agent adds JWT guards, role checks, or OAuth flows.',
                options:  ['Authenticated users only (JWT)', 'Admin role required', 'Public — no auth', 'OAuth provider: …'],
            };

        case 'missing_error_handling':
            return {
                id, priority: 'nice_to_have', gap: gap.kind,
                question: 'How should errors be presented to the user? (loading states, empty states, API failures)',
                context:  'Knowing error expectations prevents the agent from generating components with no error boundaries.',
                options:  ['Toast notification', 'Inline error message', 'Full-page error screen', 'Silent retry'],
            };

        case 'missing_performance_targets':
            return {
                id, priority: 'nice_to_have', gap: gap.kind,
                question: 'Are there performance targets? (e.g. LCP < 2.5s, bundle < 500KB)',
                context:  'The agent can enforce bundle budgets during the build step if given targets.',
            };

        case 'missing_browser_support':
            return {
                id, priority: 'nice_to_have', gap: gap.kind,
                question: 'Which browsers and devices must be supported?',
                context:  'Browser support affects polyfills, CSS prefixes, and responsive breakpoints.',
                options:  ['Modern evergreen only (Chrome/Firefox/Safari/Edge)', 'IE11 support needed', 'Mobile-first (iOS Safari + Android Chrome)'],
            };

        case 'conflicting_requirements':
        case 'ambiguous_scope':
        default:
            return {
                id, priority: 'blocking', gap: gap.kind,
                question: `There seems to be ambiguity in "${taskTitle}": ${gap.detail}. Can you clarify?`,
                context:  gap.detail,
            };
    }
}

// ---------------------------------------------------------------------------
// buildClarificationPrompt  (for LLM enrichment of questions)
// ---------------------------------------------------------------------------

/**
 * Builds the LLM prompt to generate domain-specific clarifying questions
 * beyond the static gap analysis. Pure function.
 */
export function buildClarificationPrompt(params: {
    title:       string;
    description: string;
    gaps:        SpecGap[];
    framework?:  string;
}): string {
    const { title, description, gaps, framework } = params;
    const gapList = gaps.map((g) => `- ${g.kind}: ${g.detail}`).join('\n');

    return [
        `You are a senior ${framework ?? 'frontend'} developer doing requirements clarification.`,
        ``,
        `Task: "${title}"`,
        `Description: ${description || '(none provided)'}`,
        ``,
        `Known gaps in the spec:`,
        gapList || '  (none detected statically)',
        ``,
        `Generate 2–4 additional clarifying questions a developer would need answered before`,
        `starting implementation. Focus on domain-specific details that static analysis cannot detect`,
        `(e.g. "Should the list be paginated or infinite-scroll?", "Is the search client-side or server-side?").`,
        ``,
        `Return a JSON array of objects with keys: question (string), priority (blocking|important|nice_to_have), context (string).`,
        `No markdown, no prose — only the JSON array.`,
    ].join('\n');
}

/**
 * Parses the LLM response from buildClarificationPrompt into ClarifyingQuestion[].
 * Pure function.
 */
export function parseLlmClarificationResponse(raw: string, startIndex = 1): ClarifyingQuestion[] {
    const cleaned = raw.replace(/^```[a-z]*\n?/im, '').replace(/```\s*$/im, '').trim();
    const start   = cleaned.indexOf('[');
    const end     = cleaned.lastIndexOf(']');
    if (start === -1 || end === -1) return [];

    try {
        const arr = JSON.parse(cleaned.slice(start, end + 1)) as unknown[];
        return arr
            .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
            .map((item, idx) => ({
                id:       `QL${String(startIndex + idx).padStart(2, '0')}`,
                priority: isQPriority(item['priority']) ? item['priority'] : 'important',
                gap:      'ambiguous_scope' as SpecGapKind,
                question: String(item['question'] ?? ''),
                context:  String(item['context']  ?? ''),
            }))
            .filter((q) => q.question.length > 5);
    } catch {
        return [];
    }
}

function isQPriority(v: unknown): v is QuestionPriority {
    return ['blocking', 'important', 'nice_to_have'].includes(v as string);
}

// ---------------------------------------------------------------------------
// formatQuestionsForHuman
// ---------------------------------------------------------------------------

/**
 * Formats the question list as a numbered Markdown string suitable for
 * posting to Slack, a PR comment, or a Jira ticket. Pure function.
 */
export function formatQuestionsForHuman(questions: ClarifyingQuestion[]): string {
    if (questions.length === 0) return 'No clarifying questions — spec is complete.';
    const lines: string[] = ['**Clarifying questions before I start:**', ''];
    const blocking    = questions.filter((q) => q.priority === 'blocking');
    const important   = questions.filter((q) => q.priority === 'important');
    const niceToHave  = questions.filter((q) => q.priority === 'nice_to_have');

    const section = (title: string, qs: ClarifyingQuestion[]) => {
        if (qs.length === 0) return;
        lines.push(`### ${title}`);
        qs.forEach((q) => {
            lines.push(`**${q.id}** ${q.question}`);
            lines.push(`> _${q.context}_`);
            if (q.options?.length) lines.push(`> Options: ${q.options.join(' / ')}`);
            lines.push('');
        });
    };
    section('🚫 Blocking (must answer before I can start)', blocking);
    section('⚠️ Important (affects implementation quality)', important);
    section('💡 Nice to have (I will use sensible defaults if unanswered)', niceToHave);
    return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isBlocking(kind: SpecGapKind): boolean {
    return ['missing_title', 'missing_description', 'vague_description', 'missing_acceptance_criteria', 'conflicting_requirements', 'ambiguous_scope'].includes(kind);
}

function isImportant(kind: SpecGapKind): boolean {
    return ['missing_framework', 'missing_design', 'missing_api_contract', 'missing_auth_requirements'].includes(kind);
}

function descMentionsApi(desc: string): boolean {
    return /\b(api|endpoint|backend|server|rest|graphql|fetch|http|request)\b/i.test(desc);
}

function descMentionsAuth(desc: string): boolean {
    return /\b(auth|login|logout|permission|role|access|jwt|oauth|session|protected)\b/i.test(desc);
}
