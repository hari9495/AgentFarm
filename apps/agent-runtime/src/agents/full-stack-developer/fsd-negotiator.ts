// ============================================================================
// FSD NEGOTIATOR
// Sprint 16 — Full-Stack Developer Role
//
// Cross-team negotiation helper for the full-stack developer agent.
// The agent surfaces a structured negotiation request to human stakeholders
// through the existing customer approval dashboard — no new API routes needed.
//
// Flow:
//   1. Agent builds a NegotiationRequest with 2–4 concrete NegotiationTerms
//   2. buildNegotiationActionSummary() formats it with "Option N (id): …" lines
//      that the dashboard's parseWhatIfOptions() already knows how to parse
//   3. The ApprovalEnforcer (workspace_fsd_negotiate is in HIGH_RISK_ACTIONS)
//      intercepts the action, creates an approval record whose action_summary
//      is the formatted negotiation request, and routes it to the dashboard
//   4. The human sees the "Negotiate" tab, picks an option, and approves/rejects
//   5. selected_option_id is carried back in the decision payload
//   6. formatNegotiationOutcome() interprets the human decision
//
// Pure functions — no side-effects, easy to unit-test.
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NegotiationType =
    | 'deadline_extension'
    | 'scope_reduction'
    | 'resource_request'
    | 'dependency_unblock'
    | 'priority_conflict';

export interface NegotiationTerm {
    /** Short kebab-case ID that becomes selected_option_id, e.g. "extend-2w" */
    optionId:    string;
    /** Human-readable label shown in the dropdown / Negotiate tab */
    description: string;
    /** Concrete effect on timeline, scope, or resources */
    impact:      string;
}

export interface NegotiationRequest {
    type:              NegotiationType;
    title:             string;
    currentSituation:  string;
    agentProposal:     string;
    justification:     string;
    /** 2–4 options for the human to choose from */
    terms:             NegotiationTerm[];
    urgency:           'low' | 'medium' | 'high';
    originalDeadline?: string;
}

export interface NegotiationOutcome {
    request:          NegotiationRequest;
    decision:         'accepted' | 'rejected' | 'counter_proposed';
    selectedOptionId: string | null;
    selectedTerm:     NegotiationTerm | null;
    summary:          string;
}

// ---------------------------------------------------------------------------
// buildNegotiationActionSummary
// ---------------------------------------------------------------------------

/**
 * Formats a NegotiationRequest into an action_summary string that:
 *   • Carries full context for the approval record
 *   • Contains "Option N (optionId): …" lines that parseWhatIfOptions() parses
 *     into the dashboard's WhatIfOption dropdown / Negotiate tab
 *
 * Pure function.
 */
export function buildNegotiationActionSummary(request: NegotiationRequest): string {
    const urgencyLabel = request.urgency.toUpperCase();
    const typeLabel    = request.type.replace(/_/g, ' ');

    const header = [
        `[NEGOTIATION REQUEST — ${typeLabel.toUpperCase()}]`,
        `Title: ${request.title}`,
        `Urgency: ${urgencyLabel}`,
        ...(request.originalDeadline ? [`Original deadline: ${request.originalDeadline}`] : []),
        ``,
        `Current Situation:`,
        request.currentSituation,
        ``,
        `Agent Proposal:`,
        request.agentProposal,
        ``,
        `Justification:`,
        request.justification,
        ``,
        `Options (select one and Approve, or Reject all to decline):`,
    ].join('\n');

    const optionLines = request.terms.map((term, i) =>
        `Option ${i + 1} (${term.optionId}): ${term.description} — Impact: ${term.impact}`,
    ).join('\n');

    return `${header}\n${optionLines}`;
}

// ---------------------------------------------------------------------------
// buildNegotiationLlmPrompt
// ---------------------------------------------------------------------------

/**
 * Builds the LLM prompt that asks a model to generate:
 *   - The agent's preferred proposal
 *   - Justification for the proposal
 *   - 2–4 concrete negotiation terms
 *
 * Pure function.
 */
export function buildNegotiationLlmPrompt(context: {
    type:             NegotiationType;
    title:            string;
    currentSituation: string;
    constraints?:     string;
    teamContext?:     string;
}): string {
    const typeLabel = context.type.replace(/_/g, ' ');

    return [
        `You are a skilled engineering lead facilitating a cross-team ${typeLabel} negotiation.`,
        ``,
        `Title: ${context.title}`,
        ``,
        `Current situation:`,
        context.currentSituation,
        ...(context.constraints ? [``, `Constraints:`, context.constraints] : []),
        ...(context.teamContext  ? [``, `Team context:`, context.teamContext]  : []),
        ``,
        `Generate a structured negotiation request with 2–4 concrete options for the human stakeholder.`,
        `Each option must be realistic, actionable, and distinct.`,
        ``,
        `Return a JSON object with these exact fields:`,
        `  agentProposal  — the agent's preferred resolution in one sentence`,
        `  justification  — why this is the best path forward (2–3 sentences)`,
        `  terms          — array of 2–4 objects, each with:`,
        `    optionId     — short kebab-case ID (e.g. "extend-2w", "reduce-scope", "add-resource")`,
        `    description  — what accepting this option entails (one sentence)`,
        `    impact       — concrete effect on timeline/scope/resources (one sentence)`,
        ``,
        `Rules: no markdown fences, no prose outside the JSON, no trailing commas.`,
    ].join('\n');
}

// ---------------------------------------------------------------------------
// parseNegotiationLlmOutput
// ---------------------------------------------------------------------------

/**
 * Parses the LLM response from buildNegotiationLlmPrompt into structured data.
 * Falls back to empty values on any parse error so the caller can supply defaults.
 * Pure function.
 */
export function parseNegotiationLlmOutput(raw: string): {
    agentProposal: string;
    justification: string;
    terms:         NegotiationTerm[];
} {
    const cleaned = raw.replace(/^```[a-z]*\n?/im, '').replace(/```\s*$/im, '').trim();
    const start   = cleaned.indexOf('{');
    const end     = cleaned.lastIndexOf('}');

    if (start === -1 || end === -1) {
        return { agentProposal: '', justification: '', terms: [] };
    }

    try {
        const parsed = JSON.parse(cleaned.slice(start, end + 1)) as {
            agentProposal?: unknown;
            justification?: unknown;
            terms?:         unknown;
        };

        const terms: NegotiationTerm[] = Array.isArray(parsed.terms)
            ? (parsed.terms as Array<Record<string, unknown>>)
                .filter((t) => typeof t['optionId'] === 'string' && (t['optionId'] as string).length > 0)
                .slice(0, 4)
                .map((t) => ({
                    optionId:    (t['optionId'] as string).trim(),
                    description: typeof t['description'] === 'string' ? t['description'] : '',
                    impact:      typeof t['impact']      === 'string' ? t['impact']      : '',
                }))
            : [];

        return {
            agentProposal: typeof parsed.agentProposal === 'string' ? parsed.agentProposal : '',
            justification: typeof parsed.justification === 'string' ? parsed.justification : '',
            terms,
        };
    } catch {
        return { agentProposal: '', justification: '', terms: [] };
    }
}

// ---------------------------------------------------------------------------
// formatNegotiationOutcome
// ---------------------------------------------------------------------------

/**
 * Interprets the human's approval decision and selected option into a
 * NegotiationOutcome, determining whether the result is:
 *   - "accepted"         — human approved the agent's first-choice term
 *   - "counter_proposed" — human approved but chose a different term
 *   - "rejected"         — human rejected all options
 *
 * Pure function.
 */
export function formatNegotiationOutcome(
    request:          NegotiationRequest,
    selectedOptionId: string | null,
    decision:         'approved' | 'rejected',
): NegotiationOutcome {
    if (decision === 'rejected') {
        return {
            request,
            decision:         'rejected',
            selectedOptionId: null,
            selectedTerm:     null,
            summary:          `Negotiation rejected: all options declined for "${request.title}".`,
        };
    }

    const selectedTerm = selectedOptionId
        ? (request.terms.find((t) => t.optionId === selectedOptionId) ?? null)
        : null;

    // First term is treated as the agent's preferred option
    const isPreferredOption = selectedOptionId === request.terms[0]?.optionId;
    const negotiationDecision: NegotiationOutcome['decision'] =
        isPreferredOption || !selectedOptionId ? 'accepted' : 'counter_proposed';

    const summary = negotiationDecision === 'accepted'
        ? `Negotiation accepted (preferred term): "${selectedTerm?.description ?? 'as proposed'}" for "${request.title}".`
        : `Counter-proposal accepted: "${selectedTerm?.description ?? selectedOptionId}" for "${request.title}".`;

    return { request, decision: negotiationDecision, selectedOptionId, selectedTerm, summary };
}

// ---------------------------------------------------------------------------
// buildFallbackTerms
// ---------------------------------------------------------------------------

/**
 * Returns a safe two-option fallback when LLM generation fails or no terms
 * were provided in the payload.  Pure function.
 */
export function buildFallbackTerms(type: NegotiationType): NegotiationTerm[] {
    switch (type) {
        case 'deadline_extension':
            return [
                { optionId: 'extend-1w',   description: 'Extend deadline by 1 week',  impact: 'Minor schedule slip, no scope change' },
                { optionId: 'extend-2w',   description: 'Extend deadline by 2 weeks', impact: 'Moderate schedule slip, allows full implementation' },
            ];
        case 'scope_reduction':
            return [
                { optionId: 'reduce-mvp',  description: 'Ship MVP without optional features',      impact: 'Meets deadline, deferred features in next sprint' },
                { optionId: 'reduce-half', description: 'Deliver 50% of agreed features on time',  impact: 'Partial delivery, remainder in follow-up' },
            ];
        case 'resource_request':
            return [
                { optionId: 'add-dev',    description: 'Assign one additional developer',   impact: 'Estimated 30% throughput increase' },
                { optionId: 'reallocate', description: 'Reallocate existing team capacity', impact: 'No headcount change, other work deprioritised' },
            ];
        case 'dependency_unblock':
            return [
                { optionId: 'escalate',   description: 'Escalate blocker to engineering director', impact: 'Faster resolution, higher visibility' },
                { optionId: 'workaround', description: 'Implement temporary workaround',            impact: 'Unblocks progress, tech debt accepted' },
            ];
        case 'priority_conflict':
        default:
            return [
                { optionId: 'current-priority',  description: 'Keep current task as highest priority', impact: 'Delays conflicting work until completion' },
                { optionId: 'switch-priority',   description: 'Reprioritise to conflicting task',       impact: 'Current task paused, switched focus' },
            ];
    }
}
