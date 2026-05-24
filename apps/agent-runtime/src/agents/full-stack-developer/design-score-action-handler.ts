// ============================================================================
// DESIGN SCORE ACTION HANDLER — Gap: Aesthetic Judgment
//
// Closes the "is this actually beautiful?" gap by running a structured
// multi-dimension design critique backed by the vision model and a
// rubric-based scoring system.
//
// Actions:
//   workspace_fsd_design_score      — captures a screenshot (or uses
//     provided image), runs a vision-model critique against a 7-dimension
//     design rubric, and returns a score 0–100 per dimension + actionable fixes
//
//   workspace_fsd_design_reference  — compares the given UI against a set of
//     curated reference screenshots (stored or fetched) and reports how far
//     the current design deviates from high-quality exemplars
//
// Architecture:
//   Pure builder helpers for rubric evaluation and comparison prompts.
//   I/O via executeAction (vision, web-read) and callLlm.
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DesignScoreActionType =
    | 'workspace_fsd_design_score'
    | 'workspace_fsd_design_reference';

export const DESIGN_SCORE_ACTION_TYPES = new Set<DesignScoreActionType>([
    'workspace_fsd_design_score',
    'workspace_fsd_design_reference',
]);

export function isDesignScoreActionType(at: string): at is DesignScoreActionType {
    return DESIGN_SCORE_ACTION_TYPES.has(at as DesignScoreActionType);
}

export type DesignScoreActionResult = {
    ok:           boolean;
    output:       string;
    errorOutput?: string;
    [key: string]: unknown;
};

type ExecuteActionFn = (at: string, p: Record<string, unknown>) => Promise<{ ok: boolean; output: string; errorOutput?: string }>;
type LlmCallFn = (prompt: string, systemPrompt?: string) => Promise<string>;

export interface DesignScoreActionParams {
    actionType:    DesignScoreActionType;
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
function safeJson(obj: Record<string, unknown>): DesignScoreActionResult { return { ok: true, output: JSON.stringify(obj) }; }

async function callLlmSafe(fn: LlmCallFn | undefined, prompt: string, sys?: string): Promise<string> {
    if (!fn) return '';
    try { return await fn(prompt, sys); } catch { return ''; }
}

// ---------------------------------------------------------------------------
// Design rubric
// ---------------------------------------------------------------------------

export type RubricDimension =
    | 'visual_hierarchy'
    | 'typography'
    | 'color_harmony'
    | 'spacing_rhythm'
    | 'alignment_grid'
    | 'contrast_accessibility'
    | 'visual_weight';

export const RUBRIC_DEFINITIONS: Record<RubricDimension, { label: string; what_good_looks_like: string; common_failures: string }> = {
    visual_hierarchy: {
        label: 'Visual Hierarchy',
        what_good_looks_like: 'Clear primary → secondary → tertiary content levels; eye path is obvious',
        common_failures: 'Everything looks the same size/weight; multiple competing focal points',
    },
    typography: {
        label: 'Typography',
        what_good_looks_like: 'Consistent type scale (≤ 4 sizes), readable body (16px+), intentional weights',
        common_failures: 'Too many font sizes, inconsistent line-height, poor contrast, decorative fonts in body',
    },
    color_harmony: {
        label: 'Color Harmony',
        what_good_looks_like: 'Coherent palette (primary/secondary/accent/neutral), consistent usage rules',
        common_failures: 'Random colors, clashing hues, too many distinct colors (>5), inconsistent button colors',
    },
    spacing_rhythm: {
        label: 'Spacing & Rhythm',
        what_good_looks_like: 'Consistent spacing scale (4/8/16/24/32px), generous whitespace, breathing room',
        common_failures: 'Cramped layouts, inconsistent padding, elements touching the edge, random margins',
    },
    alignment_grid: {
        label: 'Alignment & Grid',
        what_good_looks_like: 'Elements align to a grid; consistent left edges; text vertically aligned',
        common_failures: 'Misaligned elements, arbitrary indentation, no consistent column system',
    },
    contrast_accessibility: {
        label: 'Contrast & Accessibility',
        what_good_looks_like: 'Text contrast ≥ 4.5:1, focus states visible, tap targets ≥ 44px',
        common_failures: 'Light grey text on white, no focus indicators, small touch targets',
    },
    visual_weight: {
        label: 'Visual Weight Balance',
        what_good_looks_like: 'Balanced composition; heavy elements counterbalanced; no unintended dominance',
        common_failures: 'One side too heavy, floating elements, unbalanced images vs text',
    },
};

export function buildDesignRubricPrompt(params: {
    screenshotDescription: string;
    designSystem?:         string;
    componentName?:        string;
    targetAudience?:       string;
}): string {
    const rubricLines = Object.entries(RUBRIC_DEFINITIONS).map(([dim, def]) =>
        `  ${def.label} (${dim}):\n    Good: ${def.what_good_looks_like}\n    Failures: ${def.common_failures}`
    );

    return [
        `You are an expert UI/UX designer evaluating a design for aesthetic quality.`,
        params.componentName   ? `Component: ${params.componentName}` : '',
        params.designSystem    ? `Design system: ${params.designSystem}` : '',
        params.targetAudience  ? `Target audience: ${params.targetAudience}` : '',
        ``,
        `Design screenshot / description:`,
        params.screenshotDescription.slice(0, 2000),
        ``,
        `Evaluate against these 7 dimensions (score each 0–100):`,
        rubricLines.join('\n'),
        ``,
        `Return JSON:`,
        `{`,
        `  "scores": {`,
        `    "visual_hierarchy": number, "typography": number, "color_harmony": number,`,
        `    "spacing_rhythm": number, "alignment_grid": number,`,
        `    "contrast_accessibility": number, "visual_weight": number`,
        `  },`,
        `  "overall": number,`,
        `  "issues": [{ "dimension": string, "problem": string, "fix": string, "severity": "critical"|"high"|"medium"|"low" }],`,
        `  "strengths": string[],`,
        `  "one_sentence_verdict": string`,
        `}`,
        `Valid JSON only. Be specific — reference actual elements, not vague platitudes.`,
    ].filter(Boolean).join('\n');
}

export interface DimensionScores {
    visual_hierarchy:       number;
    typography:             number;
    color_harmony:          number;
    spacing_rhythm:         number;
    alignment_grid:         number;
    contrast_accessibility: number;
    visual_weight:          number;
}

export interface DesignIssue {
    dimension: string;
    problem:   string;
    fix:       string;
    severity:  'critical' | 'high' | 'medium' | 'low';
}

export function parseDesignScoreResult(raw: string): {
    scores:          DimensionScores;
    overall:         number;
    issues:          DesignIssue[];
    strengths:       string[];
    verdict:         string;
} {
    const fallbackScores: DimensionScores = {
        visual_hierarchy: 50, typography: 50, color_harmony: 50,
        spacing_rhythm: 50, alignment_grid: 50, contrast_accessibility: 50, visual_weight: 50,
    };
    const fallback = { scores: fallbackScores, overall: 50, issues: [], strengths: [], verdict: '' };
    try {
        const s = raw.indexOf('{'); const e = raw.lastIndexOf('}');
        if (s === -1 || e === -1) return fallback;
        const p = JSON.parse(raw.slice(s, e + 1)) as Record<string, unknown>;
        const sc = (p['scores'] ?? {}) as Record<string, unknown>;
        return {
            scores: {
                visual_hierarchy:       Number(sc['visual_hierarchy']       ?? 50),
                typography:             Number(sc['typography']             ?? 50),
                color_harmony:          Number(sc['color_harmony']          ?? 50),
                spacing_rhythm:         Number(sc['spacing_rhythm']         ?? 50),
                alignment_grid:         Number(sc['alignment_grid']         ?? 50),
                contrast_accessibility: Number(sc['contrast_accessibility'] ?? 50),
                visual_weight:          Number(sc['visual_weight']          ?? 50),
            },
            overall:   Number(p['overall'] ?? 50),
            issues:    Array.isArray(p['issues'])    ? (p['issues'] as DesignIssue[]) : [],
            strengths: Array.isArray(p['strengths']) ? (p['strengths'] as string[])   : [],
            verdict:   typeof p['one_sentence_verdict'] === 'string' ? p['one_sentence_verdict'] : '',
        };
    } catch { return fallback; }
}

export function getDesignGrade(score: number): string {
    if (score >= 90) return 'A — Production-ready';
    if (score >= 80) return 'B — Good, minor polish needed';
    if (score >= 70) return 'C — Functional, moderate issues';
    if (score >= 60) return 'D — Significant UX debt';
    return 'F — Needs redesign';
}

// ---------------------------------------------------------------------------
// Reference comparison builders
// ---------------------------------------------------------------------------

export const REFERENCE_DESIGN_URLS: Record<string, string[]> = {
    dashboard:  ['https://dribbble.com/tags/dashboard', 'https://www.behance.net/search/projects/dashboard%20ui'],
    landing:    ['https://dribbble.com/tags/landing-page', 'https://land-book.com/'],
    mobile_app: ['https://dribbble.com/tags/mobile-app'],
    form:       ['https://dribbble.com/tags/form-design'],
    ecommerce:  ['https://dribbble.com/tags/ecommerce'],
};

export function buildReferenceComparePrompt(params: {
    targetDescription:     string;
    referenceDescriptions: string[];
    componentType:         string;
}): string {
    return [
        `You are a design critic comparing a UI against high-quality reference designs.`,
        `Component type: ${params.componentType}`,
        ``,
        `Target design:`,
        params.targetDescription.slice(0, 1500),
        ``,
        `Reference exemplars (${params.referenceDescriptions.length} examples):`,
        ...params.referenceDescriptions.map((r, i) => `  [${i + 1}] ${r.slice(0, 400)}`),
        ``,
        `How does the target compare? What does it do better or worse than the references?`,
        ``,
        `Return JSON:`,
        `{`,
        `  "gaps": [{ "aspect": string, "target": string, "reference_standard": string, "how_to_close": string }],`,
        `  "advantages": string[],`,
        `  "parity_score": number,`,
        `  "summary": string`,
        `}`,
        `Valid JSON only.`,
    ].join('\n');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function handleDesignScoreAction(
    params: DesignScoreActionParams,
): Promise<DesignScoreActionResult> {
    const { actionType, payload, executeAction, callLlm } = params;

    switch (actionType) {

        // ====================================================================
        // workspace_fsd_design_score
        // Evaluates a UI screenshot against the 7-dimension design rubric.
        //
        // payload:
        //   screenshot_url?   — URL of the page to screenshot + critique
        //   screenshot_path?  — local image file path
        //   description?      — text description of the UI if no screenshot
        //   component_name?   — component label
        //   design_system?    — design system context (Tailwind, Material…)
        //   target_audience?  — who the UI is for
        // ====================================================================
        case 'workspace_fsd_design_score': {
            const screenshotUrl  = str(payload['screenshot_url']);
            const screenshotPath = str(payload['screenshot_path']);
            const description    = str(payload['description']);
            const componentName  = str(payload['component_name']);
            const designSystem   = str(payload['design_system']);
            const targetAudience = str(payload['target_audience']);

            // Gather visual content via vision model or text description
            let screenshotDescription = description;
            let visionUsed = false;

            if (screenshotUrl || screenshotPath) {
                const visionResult = await executeAction('workspace_visual_task', {
                    goal: `Describe this UI in exhaustive detail for a design critique: layout, colors, typography, spacing, alignment, visual hierarchy. Be very specific about actual values you can see.`,
                    ...(screenshotUrl  ? { url:       screenshotUrl  } : {}),
                    ...(screenshotPath ? { image_path: screenshotPath } : {}),
                });
                if (visionResult.ok && visionResult.output) {
                    screenshotDescription = visionResult.output;
                    visionUsed = true;
                }
            }

            if (!screenshotDescription) {
                return { ok: false, output: '', errorOutput: 'workspace_fsd_design_score: provide screenshot_url, screenshot_path, or description' };
            }

            if (!callLlm) {
                return safeJson({
                    component_name: componentName,
                    vision_used: visionUsed,
                    summary: 'LLM not available — cannot score design',
                });
            }

            const rubricPrompt = buildDesignRubricPrompt({
                screenshotDescription,
                designSystem:  designSystem  || undefined,
                componentName: componentName || undefined,
                targetAudience: targetAudience || undefined,
            });

            const llmRaw = await callLlmSafe(
                callLlm, rubricPrompt,
                'You are an expert UI/UX designer with strong aesthetic judgment. Score based on what you actually observe, not assumptions. Be critical.',
            );

            const result = parseDesignScoreResult(llmRaw);
            const grade  = getDesignGrade(result.overall);

            // Critical issues only
            const critical = result.issues.filter((i) => i.severity === 'critical' || i.severity === 'high');

            return safeJson({
                component_name:   componentName || 'UI',
                overall_score:    result.overall,
                grade,
                dimension_scores: result.scores,
                issues:           result.issues,
                critical_issues:  critical.length,
                strengths:        result.strengths,
                vision_used:      visionUsed,
                verdict:          result.verdict,
                summary: `Design score: ${result.overall}/100 (${grade}) — ${critical.length} critical issue(s)`,
            });
        }

        // ====================================================================
        // workspace_fsd_design_reference
        // Compares the current UI against curated reference designs.
        //
        // payload:
        //   screenshot_url?   — URL to critique
        //   description?      — text description
        //   component_type?   — dashboard | landing | mobile_app | form | ecommerce
        //   reference_urls?   — string[] of custom reference URLs
        // ====================================================================
        case 'workspace_fsd_design_reference': {
            const screenshotUrl   = str(payload['screenshot_url']);
            const description     = str(payload['description']);
            const componentType   = str(payload['component_type'], 'dashboard');
            const customRefs      = Array.isArray(payload['reference_urls']) ? (payload['reference_urls'] as string[]) : [];

            // Gather target description
            let targetDescription = description;
            if (screenshotUrl && !targetDescription) {
                const vRes = await executeAction('workspace_visual_task', {
                    goal: 'Describe this UI in detail for a design comparison: layout, colors, typography, spacing, visual hierarchy.',
                    url: screenshotUrl,
                });
                if (vRes.ok) targetDescription = vRes.output;
            }

            if (!targetDescription) {
                return { ok: false, output: '', errorOutput: 'workspace_fsd_design_reference: screenshot_url or description required' };
            }

            // Fetch reference designs
            const refUrls  = customRefs.length > 0 ? customRefs : (REFERENCE_DESIGN_URLS[componentType] ?? []);
            const refDescs: string[] = [];

            for (const url of refUrls.slice(0, 3)) {
                const fetchRes = await executeAction('workspace_web_read_page', { url });
                if (fetchRes.ok && fetchRes.output) {
                    refDescs.push(fetchRes.output.slice(0, 500));
                }
            }

            if (!callLlm) {
                return safeJson({ component_type: componentType, refs_fetched: refDescs.length, summary: 'LLM not available' });
            }

            const comparePrompt = buildReferenceComparePrompt({
                targetDescription,
                referenceDescriptions: refDescs,
                componentType,
            });

            const llmRaw = await callLlmSafe(
                callLlm, comparePrompt,
                'You are a design critic with strong aesthetic standards. Be honest and specific.',
            );

            // Parse
            let gaps: unknown[] = []; let advantages: string[] = [];
            let parityScore = 0; let summary = '';
            try {
                const s = llmRaw.indexOf('{'); const e = llmRaw.lastIndexOf('}');
                if (s !== -1 && e !== -1) {
                    const p = JSON.parse(llmRaw.slice(s, e + 1)) as Record<string, unknown>;
                    gaps         = Array.isArray(p['gaps'])       ? p['gaps'] as unknown[]  : [];
                    advantages   = Array.isArray(p['advantages']) ? p['advantages'] as string[] : [];
                    parityScore  = Number(p['parity_score'] ?? 0);
                    summary      = typeof p['summary'] === 'string' ? p['summary'] : '';
                }
            } catch { /* ignore */ }

            return safeJson({
                component_type:  componentType,
                parity_score:    parityScore,
                refs_compared:   refDescs.length,
                gaps,
                advantages,
                summary:         summary || `Design reference comparison (${componentType}): parity ${parityScore}/100`,
            });
        }
    }
}
