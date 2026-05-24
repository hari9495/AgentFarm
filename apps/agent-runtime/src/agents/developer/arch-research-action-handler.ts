// ============================================================================
// ARCH RESEARCH ACTION HANDLER — Gap: Novel Architecture
//
// Closes the "no prior art" gap by giving the agent two capabilities:
//
//   workspace_dev_arch_research      — web-searches for recent patterns,
//     papers, and industry solutions; synthesises findings into ranked options
//
//   workspace_dev_arch_second_opinion — takes an existing architecture
//     proposal through a multi-round critique-refine loop (up to 3 passes),
//     returning a hardened design with explicit trade-offs
//
// Architecture:
//   Pure builder helpers → I/O via executeAction (web search + memory) + callLlm.
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ArchResearchActionType =
    | 'workspace_dev_arch_research'
    | 'workspace_dev_arch_second_opinion';

export const ARCH_RESEARCH_ACTION_TYPES = new Set<ArchResearchActionType>([
    'workspace_dev_arch_research',
    'workspace_dev_arch_second_opinion',
]);

export function isArchResearchActionType(at: string): at is ArchResearchActionType {
    return ARCH_RESEARCH_ACTION_TYPES.has(at as ArchResearchActionType);
}

export type ArchResearchActionResult = {
    ok:           boolean;
    output:       string;
    errorOutput?: string;
    [key: string]: unknown;
};

type ExecuteActionFn = (at: string, p: Record<string, unknown>) => Promise<{ ok: boolean; output: string; errorOutput?: string }>;
type LlmCallFn = (prompt: string, systemPrompt?: string) => Promise<string>;

export interface ArchResearchActionParams {
    actionType:    ArchResearchActionType;
    tenantId:      string;
    botId:         string;
    taskId:        string;
    payload:       Record<string, unknown>;
    workspaceDir:  string;
    executeAction: ExecuteActionFn;
    callLlm?:      LlmCallFn;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function str(v: unknown, fallback = ''): string { return typeof v === 'string' ? v.trim() : fallback; }
function safeJson(obj: Record<string, unknown>): ArchResearchActionResult { return { ok: true, output: JSON.stringify(obj) }; }

async function callLlmSafe(fn: LlmCallFn | undefined, prompt: string, sys?: string): Promise<string> {
    if (!fn) return '';
    try { return await fn(prompt, sys); } catch { return ''; }
}

// ---------------------------------------------------------------------------
// Research prompt builders
// ---------------------------------------------------------------------------

export function buildResearchSearchQueries(problem: string, constraints: string): string[] {
    return [
        `${problem} architecture pattern 2024`,
        `${problem} system design best practices`,
        `${problem} trade-offs scalability`,
        `${problem} production experience lessons learned`,
        constraints ? `${problem} ${constraints} architecture` : '',
    ].filter(Boolean);
}

export function buildResearchSynthesisPrompt(params: {
    problem:      string;
    constraints:  string;
    scale?:       string;
    teamSize?:    number;
    searchResults: string;
    codebaseCtx:  string;
}): string {
    return [
        `You are a principal architect synthesising research for a novel technical problem.`,
        ``,
        `Problem: ${params.problem}`,
        params.constraints ? `Hard constraints: ${params.constraints}` : '',
        params.scale       ? `Scale: ${params.scale}` : '',
        params.teamSize    ? `Team size: ${params.teamSize}` : '',
        ``,
        params.codebaseCtx ? `Existing codebase context:\n${params.codebaseCtx}` : '',
        ``,
        `Research findings:`,
        params.searchResults.slice(0, 3000),
        ``,
        `Synthesise 3 ranked architecture options. For each:`,
        `- Name and 1-sentence description`,
        `- Core mechanism (how it works)`,
        `- Best for (what workloads/teams)`,
        `- Risks and mitigations`,
        `- Implementation effort: low | medium | high`,
        `- Real-world examples (companies / OSS projects that use this)`,
        ``,
        `Return JSON:`,
        `{`,
        `  "options": [{`,
        `    "name": string, "description": string, "mechanism": string,`,
        `    "best_for": string, "risks": string[], "mitigations": string[],`,
        `    "effort": "low"|"medium"|"high", "examples": string[]`,
        `  }],`,
        `  "recommendation": string,`,
        `  "open_questions": string[]`,
        `}`,
        `Valid JSON only.`,
    ].filter(Boolean).join('\n');
}

export interface ArchOption {
    name:        string;
    description: string;
    mechanism:   string;
    bestFor:     string;
    risks:       string[];
    mitigations: string[];
    effort:      'low' | 'medium' | 'high';
    examples:    string[];
}

export function parseResearchResult(raw: string): {
    options:       ArchOption[];
    recommendation: string;
    openQuestions:  string[];
} {
    const fallback = { options: [], recommendation: '', openQuestions: [] };
    try {
        const s = raw.indexOf('{'); const e = raw.lastIndexOf('}');
        if (s === -1 || e === -1) return fallback;
        const p = JSON.parse(raw.slice(s, e + 1)) as Record<string, unknown>;
        return {
            options:        Array.isArray(p['options'])        ? (p['options'] as ArchOption[]) : [],
            recommendation: typeof p['recommendation'] === 'string' ? p['recommendation'] : '',
            openQuestions:  Array.isArray(p['open_questions']) ? (p['open_questions'] as string[]) : [],
        };
    } catch { return fallback; }
}

// ---------------------------------------------------------------------------
// Second-opinion / critique-refine loop builders
// ---------------------------------------------------------------------------

export function buildCritiquePrompt(proposal: string, iteration: number, constraints: string): string {
    return [
        `You are a senior architect performing a critical review (iteration ${iteration}).`,
        `Your role: find flaws, unstated assumptions, and missing edge cases.`,
        constraints ? `Hard constraints to verify against: ${constraints}` : '',
        ``,
        `Architecture proposal:`,
        proposal.slice(0, 3000),
        ``,
        `Identify up to 5 concrete weaknesses. For each, explain why it matters in production.`,
        `Return JSON:`,
        `{`,
        `  "weaknesses": [{ "title": string, "description": string, "severity": "critical"|"high"|"medium" }],`,
        `  "missed_assumptions": string[],`,
        `  "overall_verdict": "sound"|"needs_revision"|"fundamentally_flawed"`,
        `}`,
        `Valid JSON only.`,
    ].filter(Boolean).join('\n');
}

export function buildRefinePrompt(proposal: string, critique: string, iteration: number): string {
    return [
        `You are a principal architect refining a design after critique (iteration ${iteration}).`,
        ``,
        `Original proposal:`,
        proposal.slice(0, 2000),
        ``,
        `Critique findings:`,
        critique.slice(0, 1500),
        ``,
        `Produce an improved proposal that addresses each weakness.`,
        `Keep what was good. Be concrete — include API shapes, data flows, or component boundaries where helpful.`,
        ``,
        `Return JSON:`,
        `{`,
        `  "refined_proposal": string,`,
        `  "changes_made": string[],`,
        `  "remaining_risks": string[]`,
        `}`,
        `Valid JSON only.`,
    ].join('\n');
}

export interface CritiqueResult {
    weaknesses:         Array<{ title: string; description: string; severity: string }>;
    missedAssumptions:  string[];
    verdict:            'sound' | 'needs_revision' | 'fundamentally_flawed';
}

export function parseCritique(raw: string): CritiqueResult {
    const fallback: CritiqueResult = { weaknesses: [], missedAssumptions: [], verdict: 'needs_revision' };
    try {
        const s = raw.indexOf('{'); const e = raw.lastIndexOf('}');
        if (s === -1 || e === -1) return fallback;
        const p = JSON.parse(raw.slice(s, e + 1)) as Record<string, unknown>;
        return {
            weaknesses:        Array.isArray(p['weaknesses'])          ? (p['weaknesses'] as CritiqueResult['weaknesses']) : [],
            missedAssumptions: Array.isArray(p['missed_assumptions'])  ? (p['missed_assumptions'] as string[]) : [],
            verdict:           (p['overall_verdict'] as CritiqueResult['verdict']) ?? 'needs_revision',
        };
    } catch { return fallback; }
}

export interface RefineResult {
    refinedProposal: string;
    changesMade:     string[];
    remainingRisks:  string[];
}

export function parseRefine(raw: string): RefineResult {
    const fallback: RefineResult = { refinedProposal: raw, changesMade: [], remainingRisks: [] };
    try {
        const s = raw.indexOf('{'); const e = raw.lastIndexOf('}');
        if (s === -1 || e === -1) return fallback;
        const p = JSON.parse(raw.slice(s, e + 1)) as Record<string, unknown>;
        return {
            refinedProposal: typeof p['refined_proposal'] === 'string' ? p['refined_proposal'] : raw,
            changesMade:     Array.isArray(p['changes_made'])     ? (p['changes_made'] as string[])    : [],
            remainingRisks:  Array.isArray(p['remaining_risks'])  ? (p['remaining_risks'] as string[]) : [],
        };
    } catch { return fallback; }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function handleArchResearchAction(
    params: ArchResearchActionParams,
): Promise<ArchResearchActionResult> {
    const { actionType, payload, workspaceDir, executeAction, callLlm } = params;

    switch (actionType) {

        // ====================================================================
        // workspace_dev_arch_research
        // Web-searches for architecture patterns and synthesises ranked options.
        //
        // payload:
        //   problem         — what needs to be architected (required)
        //   constraints?    — hard constraints (team size, language, budget…)
        //   scale?          — expected load / data size
        //   team_size?      — number of developers
        //   use_web_search? — true (default) to call workspace_web_search
        // ====================================================================
        case 'workspace_dev_arch_research': {
            const problem    = str(payload['problem']);
            const constraints = str(payload['constraints']);
            const scale      = str(payload['scale']);
            const teamSize   = typeof payload['team_size'] === 'number' ? payload['team_size'] : undefined;
            const useSearch  = payload['use_web_search'] !== false;

            if (!problem) return { ok: false, output: '', errorOutput: 'workspace_dev_arch_research: problem is required' };

            // Web search for recent patterns
            let searchResults = '';
            if (useSearch) {
                const queries = buildResearchSearchQueries(problem, constraints);
                const searchParts: string[] = [];
                for (const q of queries.slice(0, 3)) {
                    const sr = await executeAction('workspace_web_search', { query: q, max_results: 3 });
                    if (sr.ok && sr.output) searchParts.push(`Query: ${q}\n${sr.output.slice(0, 800)}`);
                }
                searchResults = searchParts.join('\n\n---\n\n');
            }

            // Codebase context (scout for existing patterns)
            const scoutRes = await executeAction('workspace_scout', { workspace_dir: workspaceDir, query: problem });
            const codebaseCtx = scoutRes.ok ? scoutRes.output.slice(0, 800) : '';

            if (!callLlm) {
                return safeJson({
                    problem, constraints, search_results: searchResults,
                    summary: 'LLM not available — search results collected but not synthesised',
                });
            }

            // LLM synthesis
            const synthPrompt = buildResearchSynthesisPrompt({
                problem, constraints, scale, teamSize, searchResults, codebaseCtx,
            });
            const llmRaw = await callLlmSafe(
                callLlm, synthPrompt,
                'You are a principal software architect with broad industry knowledge. Be concrete and honest about trade-offs.',
            );
            const result = parseResearchResult(llmRaw);

            // Persist research findings
            await executeAction('workspace_write_file', {
                file_path: `.agentfarm/arch-research-${Date.now()}.json`,
                content:   JSON.stringify({ problem, constraints, scale, options: result.options, recommendation: result.recommendation, openQuestions: result.openQuestions, searchResults: searchResults.slice(0, 1000) }, null, 2),
            });

            return safeJson({
                problem,
                options_count:    result.options.length,
                options:          result.options,
                recommendation:   result.recommendation,
                open_questions:   result.openQuestions,
                search_used:      useSearch && searchResults.length > 0,
                summary: `Architecture research: ${result.options.length} option(s) — ${result.recommendation.slice(0, 120)}`,
            });
        }

        // ====================================================================
        // workspace_dev_arch_second_opinion
        // Runs a multi-round critique-refine loop on an existing proposal.
        //
        // payload:
        //   proposal        — architecture proposal text (required)
        //   constraints?    — hard constraints to verify against
        //   rounds?         — critique-refine rounds (default: 2, max: 3)
        //   context?        — feature/system context
        // ====================================================================
        case 'workspace_dev_arch_second_opinion': {
            let proposal    = str(payload['proposal']);
            const constraints = str(payload['constraints']);
            const rounds    = Math.min(typeof payload['rounds'] === 'number' ? payload['rounds'] : 2, 3);

            if (!proposal) return { ok: false, output: '', errorOutput: 'workspace_dev_arch_second_opinion: proposal is required' };
            if (!callLlm)  return safeJson({ proposal, summary: 'LLM not available — cannot critique' });

            const history: Array<{
                iteration:  number;
                critique:   CritiqueResult;
                refinement: RefineResult;
            }> = [];

            let finalVerdict: CritiqueResult['verdict'] = 'needs_revision';

            for (let i = 1; i <= rounds; i++) {
                // Critique pass
                const critiqueRaw = await callLlmSafe(
                    callLlm,
                    buildCritiquePrompt(proposal, i, constraints),
                    'You are a critical senior architect. Find real flaws, not nitpicks.',
                );
                const critique = parseCritique(critiqueRaw);
                finalVerdict   = critique.verdict;

                // If already sound, stop early
                if (critique.verdict === 'sound' && critique.weaknesses.length === 0) {
                    history.push({ iteration: i, critique, refinement: { refinedProposal: proposal, changesMade: [], remainingRisks: [] } });
                    break;
                }

                // Refine pass
                const refineRaw = await callLlmSafe(
                    callLlm,
                    buildRefinePrompt(proposal, critiqueRaw, i),
                    'You are a principal architect improving a design. Be concrete and specific.',
                );
                const refinement = parseRefine(refineRaw);
                history.push({ iteration: i, critique, refinement });
                proposal = refinement.refinedProposal;   // next round starts with refined proposal
            }

            const last       = history[history.length - 1];
            const allChanges = history.flatMap((h) => h.refinement.changesMade);
            const finalRisks = last?.refinement.remainingRisks ?? [];

            // Save to workspace
            await executeAction('workspace_write_file', {
                file_path: `.agentfarm/arch-second-opinion-${Date.now()}.json`,
                content:   JSON.stringify({ original: str(payload['proposal']), final: proposal, verdict: finalVerdict, rounds: history.length, history }, null, 2),
            });

            return safeJson({
                verdict:          finalVerdict,
                rounds_run:       history.length,
                final_proposal:   proposal,
                changes_made:     allChanges,
                remaining_risks:  finalRisks,
                history:          history.map((h) => ({
                    iteration: h.iteration,
                    verdict:   h.critique.verdict,
                    weakness_count: h.critique.weaknesses.length,
                    changes_made:   h.refinement.changesMade,
                })),
                summary: `Architecture second opinion: ${history.length} round(s), verdict: ${finalVerdict}, ${allChanges.length} improvement(s), ${finalRisks.length} remaining risk(s)`,
            });
        }
    }
}
