// ============================================================================
// FULL-STACK DEVELOPER ACTION HANDLER
// Sprint 16 — Full-Stack Developer Role
//
// Handles all workspace_fsd_* action types by orchestrating existing workspace
// executor primitives (passed in via executeAction) and the pure helper
// functions in this folder.
//
// Architecture:
//   - Pure orchestration: all I/O flows through executeAction / runCommand
//   - LLM prose (summaries, specs, commit messages) via callLlm when provided
//   - Design tokens / component generation via fsd-ui-builder (pure functions)
//   - API client / auth / state scaffolds via fsd-integration-builder (pure)
//   - Standup reports via fsd-standup-builder (pure)
//   - All public API: handleFsdAction(params) → FsdActionResult
// ============================================================================

import {
    generateComponentScaffold,
    extractDesignTokens,
    tokensToCSS,
    buildResponsiveReport,
    buildA11yReport,
    buildSeoReport,
    buildPerformanceReport,
    type UiFramework,
    type StylingMethod,
    type ComponentSpec,
    type PerformanceBudget,
} from './fsd-ui-builder.js';

import {
    generateApiClientCode,
    generateAuthScaffold,
    generateRealtimeCode,
    generateStateManagementScaffold,
    generateEnvTemplate,
    type AuthStrategy,
    type RealtimeStrategy,
    type StateMgmtLib,
    type HttpClient,
    type ApiEndpoint,
    type EnvVariable,
} from './fsd-integration-builder.js';

import {
    buildFsdStandupSummary,
    buildFsdSprintContext,
    buildFrontendHealthReport,
    type FsdCeremonyType,
} from './fsd-standup-builder.js';

import {
    enrichComponentCode,
    enrichApiTypes,
    generateDesignAwareComponent,
    runTestFixLoop,
    runAxeCli,
    parseAxeCliOutput,
    measureBundleFromBuild,
} from './fsd-llm-enricher.js';

import {
    buildVisualCritiquePrompt,
    parseVisualCritiqueResponse,
    analyzeCssForVisualIssues,
    summariseVisualReport,
    type VisualIssue,
} from './fsd-visual-inspector.js';

import {
    analyzeSpecCompleteness,
    buildClarificationPrompt,
    parseLlmClarificationResponse,
    formatQuestionsForHuman,
} from './fsd-spec-analyzer.js';

import {
    buildBusinessLogicSecurityPrompt,
    parseSecurityFindings,
    runStaticSecurityChecks,
    buildSecurityReport,
    type SecurityFinding,
} from './fsd-security-analyzer.js';

import {
    buildArchReviewContext,
    buildAdrPrompt,
    parseAdrFromLlm,
    formatAdrAsMarkdown,
} from './fsd-arch-advisor.js';

import {
    buildPlaywrightDebugScript,
    parseBrowserDebugOutput,
    buildDebugAnalysisPrompt,
    applyDebugSuggestions,
} from './fsd-browser-debugger.js';

import {
    isKnownFramework,
    buildUnknownFrameworkComponentPrompt,
    parseUnknownFrameworkOutput,
} from './fsd-framework-adapter.js';

import {
    buildPlaywrightProfilingScript,
    parseCpuProfile,
    buildPerfOptimizationPrompt,
    applyPerfSuggestions,
} from './fsd-perf-profiler.js';

import {
    buildNegotiationActionSummary,
    buildNegotiationLlmPrompt,
    parseNegotiationLlmOutput,
    buildFallbackTerms,
    type NegotiationType,
    type NegotiationTerm,
    type NegotiationRequest,
} from './fsd-negotiator.js';

import {
    createEmptyProjectContext,
    formatContextForLlm,
    mergeContextUpdate,
    updateContextFromAdr,
    updateContextFromScaffold,
    updateContextFromStandup,
    updateContextFromSpec,
    buildContextSyncPrompt,
    parseContextFromLlm,
    type ProjectContext,
} from './fsd-project-context.js';

import {
    buildOrgContextSyncPrompt,
    parseOrgProfileFromLlm,
    formatOrgProfileForLlm,
} from './fsd-org-profile.js';

import {
    buildStrategicPlanPrompt,
    parseRoadmapFromLlm,
    computeTickResult,
    updateMilestoneProgress,
    selectNextMilestone,
    selectNextTask,
    formatRoadmapSummary,
    type ProjectRoadmap,
} from './fsd-strategic-planner.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FsdActionType =
    | 'workspace_fsd_ui_component'
    | 'workspace_fsd_design_handoff'
    | 'workspace_fsd_responsive_check'
    | 'workspace_fsd_accessibility_audit'
    | 'workspace_fsd_seo_audit'
    | 'workspace_fsd_perf_audit'
    | 'workspace_fsd_state_manage'
    | 'workspace_fsd_api_integrate'
    | 'workspace_fsd_auth_implement'
    | 'workspace_fsd_realtime_setup'
    | 'workspace_fsd_env_setup'
    | 'workspace_fsd_fullstack_feature'
    | 'workspace_fsd_scaffold_project'
    | 'workspace_fsd_deploy_preview'
    | 'workspace_fsd_standup_report'
    // ── Advanced capabilities (Sprint 16 Phase 4) ─────────────────────────────
    | 'workspace_fsd_visual_review'
    | 'workspace_fsd_clarify_spec'
    | 'workspace_fsd_security_deep_scan'
    | 'workspace_fsd_arch_review'
    // ── Live debugging + framework adapter (Sprint 16 Phase 5) ───────────────
    | 'workspace_fsd_browser_debug'
    | 'workspace_fsd_perf_profile'
    // ── Cross-team negotiation (Sprint 16 Phase 6) ────────────────────────────
    | 'workspace_fsd_negotiate'
    // ── Long-term project memory (Sprint 16 Phase 7) ──────────────────────────
    | 'workspace_fsd_project_context_sync'
    // ── Gap 3 — Org/political context ─────────────────────────────────────────
    | 'workspace_fsd_org_context_sync'
    // ── Gap 2 — Self-directed long-horizon projects ───────────────────────────
    | 'workspace_fsd_strategic_plan'
    | 'workspace_fsd_roadmap_tick'
    | 'workspace_fsd_roadmap_status';

export const FSD_ACTION_TYPES = new Set<FsdActionType>([
    'workspace_fsd_ui_component',
    'workspace_fsd_design_handoff',
    'workspace_fsd_responsive_check',
    'workspace_fsd_accessibility_audit',
    'workspace_fsd_seo_audit',
    'workspace_fsd_perf_audit',
    'workspace_fsd_state_manage',
    'workspace_fsd_api_integrate',
    'workspace_fsd_auth_implement',
    'workspace_fsd_realtime_setup',
    'workspace_fsd_env_setup',
    'workspace_fsd_fullstack_feature',
    'workspace_fsd_scaffold_project',
    'workspace_fsd_deploy_preview',
    'workspace_fsd_standup_report',
    // ── Advanced capabilities (Sprint 16 Phase 4) ─────────────────────────────
    'workspace_fsd_visual_review',
    'workspace_fsd_clarify_spec',
    'workspace_fsd_security_deep_scan',
    'workspace_fsd_arch_review',
    // ── Live debugging + framework adapter (Sprint 16 Phase 5) ───────────────
    'workspace_fsd_browser_debug',
    'workspace_fsd_perf_profile',
    // ── Cross-team negotiation (Sprint 16 Phase 6) ────────────────────────────
    'workspace_fsd_negotiate',
    // ── Long-term project memory (Sprint 16 Phase 7) ──────────────────────────
    'workspace_fsd_project_context_sync',
    // ── Gap 3 — Org/political context ─────────────────────────────────────────
    'workspace_fsd_org_context_sync',
    // ── Gap 2 — Self-directed long-horizon projects ───────────────────────────
    'workspace_fsd_strategic_plan',
    'workspace_fsd_roadmap_tick',
    'workspace_fsd_roadmap_status',
]);

export function isFsdActionType(at: string): at is FsdActionType {
    return FSD_ACTION_TYPES.has(at as FsdActionType);
}

export type FsdActionResult = {
    ok: boolean;
    output: string;
    errorOutput?: string;
    [key: string]: unknown;
};

/** Minimal result from executeAction — mirrors LocalWorkspaceResult */
type SubResult = {
    ok: boolean;
    output: string;
    errorOutput?: string;
};

type ExecuteActionFn = (
    actionType: string,
    payload: Record<string, unknown>,
) => Promise<SubResult>;

type RunCommandFn = (
    args: string[],
    cwd: string,
    timeoutMs?: number,
) => Promise<{ stdout: string; stderr: string; exitCode: number }>;

type LlmCallFn = (prompt: string, systemPrompt?: string) => Promise<string>;

export interface FsdActionParams {
    actionType:       FsdActionType;
    tenantId:         string;
    botId:            string;
    taskId:           string;
    payload:          Record<string, unknown>;
    workspaceDir:     string;
    executeAction:    ExecuteActionFn;
    runCommand?:      RunCommandFn;
    callLlm?:         LlmCallFn;
    /** Optional — when provided, RAG context is fetched and injected into every LLM call. */
    gatewayBaseUrl?:  string;
    serviceToken?:    string;
    workspaceId?:     string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function safeJson(obj: Record<string, unknown>): FsdActionResult {
    return { ok: true, output: JSON.stringify(obj) };
}

function str(v: unknown, fallback = ''): string {
    return typeof v === 'string' ? v.trim() : fallback;
}

function num(v: unknown, fallback = 0): number {
    return typeof v === 'number' ? v : fallback;
}

async function callLlmSafe(
    callLlm: LlmCallFn | undefined,
    prompt: string,
    systemPrompt?: string,
): Promise<string> {
    if (!callLlm) return '';
    try {
        return await callLlm(prompt, systemPrompt);
    } catch {
        return '';
    }
}

function parseSubOutput(result: SubResult): Record<string, unknown> {
    try {
        return JSON.parse(result.output) as Record<string, unknown>;
    } catch {
        return {};
    }
}

function isUiFramework(v: unknown): v is UiFramework {
    return ['react', 'vue', 'angular', 'svelte', 'solid'].includes(v as string);
}

function isStylingMethod(v: unknown): v is StylingMethod {
    return ['tailwind', 'css-modules', 'styled-components', 'scss', 'plain-css'].includes(v as string);
}

function isAuthStrategy(v: unknown): v is AuthStrategy {
    return ['jwt', 'oauth2', 'session', 'magic_link', 'api_key'].includes(v as string);
}

function isRealtimeStrategy(v: unknown): v is RealtimeStrategy {
    return ['websocket', 'sse', 'polling'].includes(v as string);
}

function isStateMgmtLib(v: unknown): v is StateMgmtLib {
    return ['redux-toolkit', 'zustand', 'pinia', 'context', 'jotai', 'recoil'].includes(v as string);
}

function isHttpClient(v: unknown): v is HttpClient {
    return ['fetch', 'axios', 'react-query', 'swr', 'vue-query'].includes(v as string);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function handleFsdAction(
    params: FsdActionParams,
): Promise<FsdActionResult> {
    const { actionType, payload, workspaceDir, executeAction, runCommand,
            callLlm: callLlmRaw, gatewayBaseUrl, serviceToken, workspaceId, tenantId, botId } = params;

    // RAG pre-flight — wrap callLlm so every LLM call receives design/arch context
    let callLlmBase = callLlmRaw;
    if (callLlmRaw && gatewayBaseUrl && serviceToken && workspaceId) {
        try {
            const { buildFsdRagContext } = await import('./fsd-rag-retriever.js');
            const { deriveMemoryConfig } = await import('@agentfarm/memory-service');
            const ragCtx = await buildFsdRagContext(
                {
                    tenantId, botId,
                    featureTitle: String(payload['title'] ?? payload['feature_name'] ?? actionType),
                    featureDescription: String(payload['description'] ?? ''),
                    documentType: 'feature_implementation',
                },
                gatewayBaseUrl, serviceToken, workspaceId, deriveMemoryConfig(actionType),
            );
            if (ragCtx.contextBlock) {
                callLlmBase = (prompt: string, sys?: string): Promise<string> =>
                    callLlmRaw(prompt, sys ? `${sys}\n\n${ragCtx.contextBlock}` : ragCtx.contextBlock);
            }
        } catch { /* non-fatal */ }
    }

    // ── Load project context (best-effort, non-blocking) ─────────────────────
    const CONTEXT_FILE = '.agentfarm/project-context.json';
    let projectCtx: ProjectContext | null = null;
    try {
        const ctxRead = await executeAction('workspace_read_file', { file_path: CONTEXT_FILE });
        if (ctxRead.ok && ctxRead.output) {
            projectCtx = JSON.parse(ctxRead.output) as ProjectContext;
        }
    } catch { /* no context yet — proceed without it */ }

    // ── Shadow callLlm with context-enriched wrapper ──────────────────────────
    // Every callLlmSafe(callLlm, ...) in this handler automatically receives
    // the project state in its system prompt — no per-call changes needed.
    const callLlm: LlmCallFn | undefined = (callLlmBase && projectCtx)
        ? (prompt: string, sys?: string): Promise<string> =>
            callLlmBase(
                prompt,
                `${sys ?? 'You are a senior full-stack developer.'}\n\n${formatContextForLlm(projectCtx!)}`,
            )
        : callLlmBase;

    // ── Context persistence helper ────────────────────────────────────────────
    const saveProjectCtx = async (updated: ProjectContext): Promise<void> => {
        try {
            await executeAction('workspace_write_file', {
                file_path: CONTEXT_FILE,
                content:   JSON.stringify(updated, null, 2),
            });
            projectCtx = updated;
        } catch { /* write failed — non-fatal */ }
    };

    switch (actionType) {

        // ====================================================================
        // workspace_fsd_ui_component
        // Generate a UI component from a natural-language description.
        // Writes the component and test file(s) to workspaceDir.
        //
        // payload:
        //   component_name   — PascalCase component name (required)
        //   description?     — what the component should do
        //   framework?       — react | vue | angular | svelte | solid (default: react)
        //   styling?         — tailwind | css-modules | styled-components | scss | plain-css
        //   props?           — ComponentProp[] as JSON
        //   has_state?       — true if the component needs internal state
        //   is_async?        — true if the component fetches async data
        //   output_path?     — relative file path inside workspaceDir
        // ====================================================================
        case 'workspace_fsd_ui_component': {
            const componentName = str(payload['component_name'], 'MyComponent');
            const description   = str(payload['description']);
            const frameworkRaw  = str(payload['framework'], 'react');
            const styling       = isStylingMethod(payload['styling']) ? payload['styling'] : 'tailwind';
            const outputPath    = str(payload['output_path']);
            const props         = Array.isArray(payload['props']) ? (payload['props'] as ComponentSpec['props']) : [];

            // ── Unknown framework path — LLM-driven generation ────────────────
            if (!isKnownFramework(frameworkRaw) && !callLlm) {
                return {
                    ok: false,
                    output: '',
                    errorOutput: `Unknown framework "${frameworkRaw}": component generation for non-standard frameworks requires callLlm. ` +
                        `Supported frameworks without LLM: react, vue, angular, svelte, solid.`,
                };
            }
            if (!isKnownFramework(frameworkRaw) && callLlm) {
                const prompt = buildUnknownFrameworkComponentPrompt({
                    framework:     frameworkRaw,
                    componentName,
                    description,
                    styling,
                    props,
                    hasState: payload['has_state'] === true,
                    isAsync:  payload['is_async']  === true,
                });
                const llmRaw    = await callLlmSafe(callLlm, prompt, `You are an expert ${frameworkRaw} developer.`);
                const files     = parseUnknownFrameworkOutput(llmRaw, componentName, frameworkRaw);
                const outputDir = outputPath || 'src/components';
                const written: string[] = [];
                for (const f of files) {
                    const fp = `${outputDir}/${f.filename}`;
                    await executeAction('workspace_write_file', { file_path: fp, content: f.content });
                    written.push(fp);
                }
                return safeJson({
                    component_name:    componentName,
                    framework:         frameworkRaw,
                    styling,
                    written_files:     written,
                    llm_enriched:      true,
                    unknown_framework: true,
                    summary: `Generated ${frameworkRaw} component "${componentName}" via LLM (unknown framework adapter)`,
                });
            }

            // ── Known framework path — scaffold + enrichment ──────────────────
            const framework = isUiFramework(payload['framework']) ? payload['framework'] : 'react';
            const spec: ComponentSpec = {
                name:        componentName,
                description,
                framework,
                styling,
                props,
                hasState: payload['has_state'] === true,
                isAsync:  payload['is_async']  === true,
            };

            const scaffold = generateComponentScaffold(spec);

            // Gap 1: LLM enrichment — fill the TODO body with real implementation
            const componentCode = callLlm
                ? await enrichComponentCode({
                    scaffoldCode:  scaffold.code,
                    componentName,
                    description,
                    framework,
                    styling,
                    props: spec.props,
                    callLlm,
                })
                : scaffold.code;

            // Write component file
            const fileName = outputPath || `src/components/${scaffold.filename}`;
            await executeAction('workspace_write_file', {
                file_path: fileName,
                content:   componentCode,
            });

            // Write style file if generated
            if (scaffold.styleFilename && scaffold.styleCode) {
                await executeAction('workspace_write_file', {
                    file_path: `src/components/${scaffold.styleFilename}`,
                    content:   scaffold.styleCode,
                });
            }

            // Write test file
            const testFileName = `src/components/${scaffold.testFilename}`;
            await executeAction('workspace_write_file', {
                file_path: testFileName,
                content:   scaffold.testCode,
            });

            return safeJson({
                component_name: componentName,
                framework,
                styling,
                file_path:      fileName,
                test_path:      testFileName,
                has_styles:     !!scaffold.styleFilename,
                llm_enriched:   !!callLlm,
                summary: `Generated ${framework} component "${componentName}"${callLlm ? ' (LLM-enriched)' : ' (scaffold)'} with ${styling} styling`,
            });
        }

        // ====================================================================
        // workspace_fsd_design_handoff
        // Convert a Figma design (tokens JSON or CSS vars) into component code.
        //
        // payload:
        //   figma_tokens_json?  — raw Figma export JSON string
        //   css_variables?      — raw CSS variables string
        //   component_name      — target component to generate
        //   framework?          — target framework
        //   output_dir?         — directory to write files
        // ====================================================================
        case 'workspace_fsd_design_handoff': {
            const figmaJson     = str(payload['figma_tokens_json']);
            const cssVars       = str(payload['css_variables']);
            const componentName = str(payload['component_name'], 'DesignComponent');
            const framework     = isUiFramework(payload['framework']) ? payload['framework'] : 'react';
            const outputDir     = str(payload['output_dir'], 'src/design');

            const rawSource = figmaJson || cssVars;
            if (!rawSource) {
                return {
                    ok: false,
                    output: '',
                    errorOutput: 'workspace_fsd_design_handoff: figma_tokens_json or css_variables is required',
                    figma_error: true,
                };
            }

            // Parse raw source: try JSON first, fall back to treating as CSS vars blob
            let tokensInput: Record<string, unknown>;
            try {
                tokensInput = JSON.parse(rawSource) as Record<string, unknown>;
            } catch {
                tokensInput = { css_variables: rawSource };
            }
            const tokens    = extractDesignTokens(tokensInput);
            const cssOutput = tokensToCSS(tokens);

            await executeAction('workspace_write_file', {
                file_path: `${outputDir}/tokens.css`,
                content:   cssOutput,
            });

            const description = str(payload['description'], `UI component using ${tokens.length} design tokens from Figma`);

            // Gap 6: LLM-aware design handoff — generate component that actually uses the token values
            let componentCode: string;
            let llmEnriched = false;

            if (callLlm && tokens.length > 0) {
                const llmCode = await generateDesignAwareComponent({
                    componentName,
                    tokensCss: cssOutput,
                    description,
                    framework,
                    callLlm,
                });
                if (llmCode) {
                    componentCode = llmCode;
                    llmEnriched   = true;
                } else {
                    // Fallback: scaffold + fill body
                    const spec: ComponentSpec = {
                        name: componentName, description, framework, styling: 'css-modules',
                        props: [], hasState: false, isAsync: false,
                    };
                    const scaffold = generateComponentScaffold(spec);
                    componentCode  = scaffold.code;
                }
            } else {
                const spec: ComponentSpec = {
                    name: componentName, description, framework, styling: 'css-modules',
                    props: [], hasState: false, isAsync: false,
                };
                const scaffold = generateComponentScaffold(spec);
                componentCode  = scaffold.code;
            }

            const ext         = framework === 'vue' ? '.vue' : framework === 'svelte' ? '.svelte' : '.tsx';
            const componentFile = `${outputDir}/${componentName}${ext}`;

            await executeAction('workspace_write_file', {
                file_path: componentFile,
                content:   componentCode,
            });

            return safeJson({
                component_name:   componentName,
                framework,
                tokens_extracted: tokens.length,
                tokens_file:      `${outputDir}/tokens.css`,
                component_file:   componentFile,
                llm_enriched:     llmEnriched,
                summary: `Design handoff complete: ${tokens.length} tokens → ${componentName}${llmEnriched ? ' (LLM design-aware)' : ' (scaffold)'}`,
            });
        }

        // ====================================================================
        // workspace_fsd_responsive_check
        // Audit responsive design in CSS/SCSS files and report breakpoint gaps.
        //
        // payload:
        //   file_path?   — specific file to audit; if omitted scans workspaceDir
        // ====================================================================
        case 'workspace_fsd_responsive_check': {
            const filePath = str(payload['file_path']);

            let cssContent = '';
            let scannedPath = filePath;

            if (filePath) {
                const readResult = await executeAction('workspace_read_file', { file_path: filePath });
                cssContent  = readResult.ok ? readResult.output : '';
            } else {
                const grepResult = await executeAction('workspace_grep', {
                    pattern:   '@media|breakpoint|responsive',
                    file_glob: '**/*.{css,scss}',
                    workspace_dir: workspaceDir,
                });
                cssContent  = grepResult.output;
                scannedPath = workspaceDir;
            }

            const report = buildResponsiveReport(cssContent, scannedPath || workspaceDir);

            return safeJson({
                file_path:   report.filePath,
                issue_count: report.issueCount,
                issues:      report.issues,
                summary:     report.summary,
            });
        }

        // ====================================================================
        // workspace_fsd_accessibility_audit
        // Run an a11y audit and return violations with suggested fixes.
        //
        // payload:
        //   html_content?     — raw HTML string to audit
        //   axe_json?         — pre-run axe-core JSON result string
        //   file_path?        — HTML file path inside workspaceDir
        //   target_url?       — URL to audit (delegates to workspace_web_read_page)
        // ====================================================================
        case 'workspace_fsd_accessibility_audit': {
            let axeJson     = str(payload['axe_json']);
            let htmlContent = str(payload['html_content']);
            const filePath  = str(payload['file_path']);
            const targetUrl = str(payload['target_url']);
            let liveRun     = false;

            // Gap 4: Live axe-cli audit — try running axe-cli against a real URL first
            if (!axeJson && targetUrl && runCommand) {
                const liveAxeJson = await runAxeCli({ url: targetUrl, runCommand, workspaceDir });
                if (liveAxeJson) {
                    axeJson = liveAxeJson;
                    liveRun = true;
                }
            }

            // Fall back: fetch HTML from URL or file if axe-cli not available
            if (!htmlContent && !axeJson) {
                if (filePath) {
                    const r = await executeAction('workspace_read_file', { file_path: filePath });
                    htmlContent = r.ok ? r.output : '';
                } else if (targetUrl) {
                    const r = await executeAction('workspace_web_read_page', { url: targetUrl });
                    htmlContent = r.ok ? r.output : '';
                }
            }

            // Parse with live axe output if available, otherwise HTML heuristic scan
            const report = liveRun && axeJson
                ? parseAxeCliOutput(axeJson)
                : buildA11yReport({ axeJson: axeJson || undefined, htmlContent: htmlContent || undefined });

            return safeJson({
                score:           report.score,
                violations:      report.violations,
                violation_count: report.violations.length,
                live_run:        liveRun,
                summary:         report.summary,
            });
        }

        // ====================================================================
        // workspace_fsd_seo_audit
        // Audit SEO meta-tags, headings, and structured data.
        //
        // payload:
        //   html_content?   — raw HTML string
        //   file_path?      — HTML file path inside workspaceDir
        //   target_url?     — URL to fetch and audit
        // ====================================================================
        case 'workspace_fsd_seo_audit': {
            let htmlContent = str(payload['html_content']);
            const filePath  = str(payload['file_path']);
            const targetUrl = str(payload['target_url']);

            if (!htmlContent) {
                if (filePath) {
                    const r = await executeAction('workspace_read_file', { file_path: filePath });
                    htmlContent = r.ok ? r.output : '';
                } else if (targetUrl) {
                    const r = await executeAction('workspace_web_read_page', { url: targetUrl });
                    htmlContent = r.ok ? r.output : '';
                }
            }

            if (!htmlContent) {
                return { ok: false, output: '', errorOutput: 'workspace_fsd_seo_audit: no HTML content available' };
            }

            const report = buildSeoReport(htmlContent);

            return safeJson({
                score:       report.score,
                issues:      report.issues,
                issue_count: report.issues.length,
                summary:     report.summary,
            });
        }

        // ====================================================================
        // workspace_fsd_perf_audit
        // Audit frontend performance — bundle size, Core Web Vitals.
        //
        // payload:
        //   lcp?             — LCP in ms
        //   cls?             — CLS score (unitless)
        //   fid?             — FID in ms
        //   a11y_score?      — 0–100
        //   seo_score?       — 0–100
        //   bundle_size_kb?  — total bundle size in KB
        //   max_bundle_kb?   — budget for bundle size (default 500)
        //   max_lcp_ms?      — budget for LCP (default 2500)
        //   max_fid_ms?      — budget for FID (default 100)
        //   max_cls?         — budget for CLS (default 0.1)
        // ====================================================================
        case 'workspace_fsd_perf_audit': {
            const lcpMs        = typeof payload['lcp']           === 'number' ? payload['lcp']           : null;
            const clsVal       = typeof payload['cls']           === 'number' ? payload['cls']           : null;
            const fidMs        = typeof payload['fid']           === 'number' ? payload['fid']           : null;
            const a11yScore    = typeof payload['a11y_score']    === 'number' ? payload['a11y_score']    : null;
            const seoScore     = typeof payload['seo_score']     === 'number' ? payload['seo_score']     : null;
            let   bundleSizeKb = typeof payload['bundle_size_kb'] === 'number' ? payload['bundle_size_kb'] : null;

            const budget: PerformanceBudget = {
                maxBundleKb: typeof payload['max_bundle_kb'] === 'number' ? payload['max_bundle_kb'] : 500,
                maxLcpMs:    typeof payload['max_lcp_ms']    === 'number' ? payload['max_lcp_ms']    : 2500,
                maxFidMs:    typeof payload['max_fid_ms']    === 'number' ? payload['max_fid_ms']    : 100,
                maxCls:      typeof payload['max_cls']       === 'number' ? payload['max_cls']       : 0.1,
            };

            // Gap 5: Live bundle measurement — run the actual build if bundle data not provided
            type BundleFileEntry = { name: string; sizeKb: number };
            let bundleFiles: BundleFileEntry[] = [];
            let liveBuild = false;

            const bundleDataRaw = payload['bundle_data'] as { files?: BundleFileEntry[] } | undefined;
            if (bundleDataRaw?.files) {
                bundleFiles = bundleDataRaw.files;
            } else if (runCommand && payload['run_build'] !== false) {
                const measured = await measureBundleFromBuild({
                    executeAction,
                    runCommand,
                    workspaceDir,
                    distDir: str(payload['dist_dir'], 'dist'),
                });
                if (measured) {
                    bundleFiles   = measured.files;
                    bundleSizeKb  = measured.totalKb;
                    liveBuild     = true;
                }
            }

            const healthReport = buildFrontendHealthReport({
                lcp: lcpMs, cls: clsVal, fid: fidMs, a11yScore, seoScore, bundleSizeKb,
            });

            const perfReport      = buildPerformanceReport({ files: bundleFiles }, budget);
            const regressionCount = healthReport.openIssues.length + perfReport.issues.length;

            return safeJson({
                health_report:    healthReport,
                perf_report:      perfReport,
                regression_count: regressionCount,
                live_build:       liveBuild,
                bundle_files:     bundleFiles,
                summary:          healthReport.summary,
            });
        }

        // ====================================================================
        // workspace_fsd_state_manage
        // Scaffold state management stores.
        //
        // payload:
        //   library?     — redux-toolkit | zustand | pinia | context | jotai | recoil
        //   store_names? — string[] of store names to scaffold
        //   framework?   — react | vue
        //   output_dir?  — directory to write store files
        // ====================================================================
        case 'workspace_fsd_state_manage': {
            const library    = isStateMgmtLib(payload['library']) ? payload['library'] : 'zustand';
            const storeNames = Array.isArray(payload['store_names'])
                ? (payload['store_names'] as string[])
                : ['appStore'];
            const framework  = isUiFramework(payload['framework']) ? payload['framework'] : 'react';
            const outputDir  = str(payload['output_dir'], 'src/store');

            const scaffold = generateStateManagementScaffold(library, storeNames, framework);

            const writtenFiles: string[] = [];
            for (const fileEntry of scaffold.files) {
                const filePath = `${outputDir}/${fileEntry.filename}`;
                await executeAction('workspace_write_file', {
                    file_path: filePath,
                    content:   fileEntry.code,
                });
                writtenFiles.push(filePath);
            }

            return safeJson({
                library,
                framework,
                store_names:   storeNames,
                written_files: writtenFiles,
                summary:       scaffold.summary,
            });
        }

        // ====================================================================
        // workspace_fsd_api_integrate
        // Generate typed API client code and hooks for a set of endpoints.
        //
        // payload:
        //   endpoints    — ApiEndpoint[] as JSON array
        //   base_url?    — API base URL
        //   module_name? — module name for generated files (default: api)
        //   http_client? — fetch | axios | react-query | swr | vue-query
        //   framework?   — react | vue
        //   output_dir?  — directory to write files
        // ====================================================================
        case 'workspace_fsd_api_integrate': {
            const endpointsRaw = payload['endpoints'];
            const endpoints: ApiEndpoint[] = Array.isArray(endpointsRaw)
                ? (endpointsRaw as ApiEndpoint[])
                : [];

            if (endpoints.length === 0) {
                return {
                    ok: false,
                    output: '',
                    errorOutput: 'workspace_fsd_api_integrate: endpoints array is required and must not be empty',
                };
            }

            const baseUrl    = str(payload['base_url'], '/api');
            const moduleName = str(payload['module_name'], 'api');
            const httpClient = isHttpClient(payload['http_client']) ? payload['http_client'] : 'fetch';
            const framework  = isUiFramework(payload['framework']) ? payload['framework'] : 'react';
            const outputDir  = str(payload['output_dir'], 'src/api');

            const scaffold = generateApiClientCode(endpoints, { baseUrl, httpClient, framework, moduleName });

            // Write client
            const clientPath = `${outputDir}/${scaffold.clientFilename}`;
            await executeAction('workspace_write_file', {
                file_path: clientPath,
                content:   scaffold.clientCode,
            });

            // Gap 2: Enrich API types — use OpenAPI spec if provided, else use LLM
            const openApiSpec     = str(payload['openapi_spec']);
            const enrichedTypes   = await enrichApiTypes({
                typesCode:   scaffold.typesCode,
                endpoints,
                openApiSpec: openApiSpec || undefined,
                callLlm:     callLlm || undefined,
            });
            const typesEnriched   = enrichedTypes !== scaffold.typesCode;

            const typesPath = `${outputDir}/${scaffold.typesFilename}`;
            await executeAction('workspace_write_file', {
                file_path: typesPath,
                content:   enrichedTypes,
            });

            const hookPath = scaffold.hookFilename ? `${outputDir}/${scaffold.hookFilename}` : null;
            if (hookPath && scaffold.hookCode) {
                await executeAction('workspace_write_file', {
                    file_path: hookPath,
                    content:   scaffold.hookCode,
                });
            }

            return safeJson({
                http_client:     httpClient,
                framework,
                endpoints_count: endpoints.length,
                client_file:     clientPath,
                types_file:      typesPath,
                hook_file:       hookPath,
                types_enriched:  typesEnriched,
                summary: `API client generated (${httpClient}): ${endpoints.length} endpoint(s)${typesEnriched ? ', types enriched' : ''}`,
            });
        }

        // ====================================================================
        // workspace_fsd_auth_implement
        // Implement an authentication flow.
        //
        // payload:
        //   strategy        — jwt | oauth2 | session | magic_link | api_key (required)
        //   framework?      — target framework (default: react)
        //   oauth_provider? — google | github | microsoft | facebook | generic
        //   output_dir?     — where to write auth files
        // ====================================================================
        case 'workspace_fsd_auth_implement': {
            const strategy  = isAuthStrategy(payload['strategy']) ? payload['strategy'] : 'jwt';
            const framework = isUiFramework(payload['framework']) ? payload['framework'] : 'react';
            const provider  = str(payload['oauth_provider']) as Parameters<typeof generateAuthScaffold>[2] | undefined;
            const outputDir = str(payload['output_dir'], 'src/auth');

            const scaffold = generateAuthScaffold(strategy, framework, provider || undefined);

            const writtenFiles: string[] = [];
            for (const fileEntry of scaffold.files) {
                const filePath = `${outputDir}/${fileEntry.filename}`;
                await executeAction('workspace_write_file', {
                    file_path: filePath,
                    content:   fileEntry.code,
                });
                writtenFiles.push(filePath);
            }

            return safeJson({
                strategy,
                framework,
                oauth_provider: provider || null,
                written_files:  writtenFiles,
                env_vars:       scaffold.envVars,
                summary:        scaffold.summary,
            });
        }

        // ====================================================================
        // workspace_fsd_realtime_setup
        // Add WebSocket, SSE, or polling to the frontend.
        //
        // payload:
        //   strategy     — websocket | sse | polling (required)
        //   endpoint     — WS/SSE URL or polling URL (required)
        //   framework?   — target framework (default: react)
        //   output_dir?  — where to write realtime files
        // ====================================================================
        case 'workspace_fsd_realtime_setup': {
            const strategy  = isRealtimeStrategy(payload['strategy']) ? payload['strategy'] : 'websocket';
            const endpoint  = str(payload['endpoint'], '/ws');
            const framework = isUiFramework(payload['framework']) ? payload['framework'] : 'react';
            const outputDir = str(payload['output_dir'], 'src/realtime');

            const scaffold = generateRealtimeCode(strategy, endpoint, framework);

            const writtenFiles: string[] = [];

            // Main file
            const mainPath = `${outputDir}/${scaffold.filename}`;
            await executeAction('workspace_write_file', {
                file_path: mainPath,
                content:   scaffold.code,
            });
            writtenFiles.push(mainPath);

            // Hook file if present
            if (scaffold.hookFile && scaffold.hookCode) {
                const hookPath = `${outputDir}/${scaffold.hookFile}`;
                await executeAction('workspace_write_file', {
                    file_path: hookPath,
                    content:   scaffold.hookCode,
                });
                writtenFiles.push(hookPath);
            }

            return safeJson({
                strategy,
                endpoint,
                framework,
                written_files: writtenFiles,
                summary:       scaffold.summary,
            });
        }

        // ====================================================================
        // workspace_fsd_env_setup
        // Generate .env and .env.example templates.
        //
        // payload:
        //   variables     — EnvVariable[] as JSON array (use {key, description, required, example?, secret?})
        //   output_dir?   — where to write env files (default: project root)
        // ====================================================================
        case 'workspace_fsd_env_setup': {
            const variablesRaw = payload['variables'];
            const variables: EnvVariable[] = Array.isArray(variablesRaw)
                ? (variablesRaw as EnvVariable[])
                : [];

            const outputDir = str(payload['output_dir'], workspaceDir);

            if (variables.length === 0) {
                return {
                    ok: false,
                    output: '',
                    errorOutput: 'workspace_fsd_env_setup: variables array is required and must not be empty',
                };
            }

            const template = generateEnvTemplate(['development', 'production'], variables);

            const envPath     = `${outputDir}/${template.envFilename}`;
            const examplePath = `${outputDir}/${template.exampleFilename}`;

            await executeAction('workspace_write_file', {
                file_path: envPath,
                content:   template.envContent,
            });
            await executeAction('workspace_write_file', {
                file_path: examplePath,
                content:   template.exampleContent,
            });

            return safeJson({
                variable_count: variables.length,
                env_file:       envPath,
                example_file:   examplePath,
                summary:        template.summary,
            });
        }

        // ====================================================================
        // workspace_fsd_fullstack_feature  (FLAGSHIP)
        // End-to-end full-stack feature delivery.
        //
        // Sequence:
        //   1. Scout codebase
        //   2. Implement backend via workspace_dev_implement_feature
        //   3. Generate frontend component
        //   4. Wire API integration
        //   5. Run tests
        //   6. Create PR
        //
        // payload:
        //   title           — feature title (required)
        //   description?    — full feature spec / acceptance criteria
        //   issue_number?   — GitHub issue number
        //   framework?      — frontend framework
        //   http_client?    — HTTP client for API layer
        //   run_tests?      — boolean (default true)
        //   create_pr?      — boolean (default true)
        //   dry_run?        — produce plan only, no file writes
        // ====================================================================
        case 'workspace_fsd_fullstack_feature': {
            const title          = str(payload['title'], 'Full-stack feature');
            const description    = str(payload['description']);
            const issueNumber    = typeof payload['issue_number'] === 'number' ? payload['issue_number'] : null;
            const framework      = isUiFramework(payload['framework']) ? payload['framework'] : 'react';
            const httpClient     = isHttpClient(payload['http_client']) ? payload['http_client'] : 'fetch';
            const shouldRunTests = payload['run_tests'] !== false;
            const shouldCreatePr = payload['create_pr'] !== false;
            const dryRun         = payload['dry_run'] === true;

            const steps: string[] = [];

            // Step 1: Scout codebase
            const scoutResult = await executeAction('workspace_scout', {
                workspace_dir: workspaceDir,
                query:         `${title}: ${description}`,
            });
            steps.push(`Scout: ${scoutResult.ok ? 'ok' : 'failed'}`);

            // Step 2: Backend implementation
            if (!dryRun) {
                const implResult = await executeAction('workspace_dev_implement_feature', {
                    title,
                    description,
                    issue_number:  issueNumber,
                    workspace_dir: workspaceDir,
                });
                steps.push(`Backend impl: ${implResult.ok ? 'ok' : 'failed'}`);
            }

            // Step 3: Frontend component
            const componentName = title.split(/\s+/)
                .map(w => (w[0]?.toUpperCase() ?? '') + w.slice(1))
                .join('') || 'Feature';

            if (!dryRun) {
                const spec: ComponentSpec = {
                    name:        componentName,
                    description: `Frontend component for: ${title}. ${description}`,
                    framework,
                    styling:     'tailwind',
                    props:       [],
                    hasState:    true,
                    isAsync:     true,
                };
                const scaffold = generateComponentScaffold(spec);

                // Gap 1+3 applied to flagship: LLM-enriched component
                const componentCode = callLlm
                    ? await enrichComponentCode({
                        scaffoldCode:  scaffold.code,
                        componentName,
                        description:   spec.description,
                        framework,
                        styling:       'tailwind',
                        props:         [],
                        callLlm,
                    })
                    : scaffold.code;

                await executeAction('workspace_write_file', {
                    file_path: `src/components/${scaffold.filename}`,
                    content:   componentCode,
                });
                steps.push(`Frontend component: ${callLlm ? 'LLM-enriched' : 'scaffold'}`);

                // Step 4: API integration with LLM-enriched types
                const endpoints: ApiEndpoint[] = [
                    { method: 'GET',  path: `/api/${componentName.toLowerCase()}`, auth: true, responseType: `${componentName}Response` },
                    { method: 'POST', path: `/api/${componentName.toLowerCase()}`, auth: true, requestBody: `Create${componentName}Request`, responseType: `${componentName}Response` },
                ];
                const apiScaffold = generateApiClientCode(
                    endpoints,
                    { baseUrl: '/api', httpClient, framework, moduleName: componentName.toLowerCase() },
                );
                const enrichedTypesCode = await enrichApiTypes({
                    typesCode: apiScaffold.typesCode,
                    endpoints,
                    callLlm:   callLlm || undefined,
                });
                await executeAction('workspace_write_file', {
                    file_path: `src/api/${apiScaffold.clientFilename}`,
                    content:   apiScaffold.clientCode,
                });
                await executeAction('workspace_write_file', {
                    file_path: `src/api/${apiScaffold.typesFilename}`,
                    content:   enrichedTypesCode,
                });
                steps.push(`API integration: generated${callLlm ? ' (types enriched)' : ''}`);
            }

            // Step 5: Gap 3 — Iterative test-fix loop (up to 3 attempts)
            if (shouldRunTests && !dryRun) {
                const loopResult = await runTestFixLoop({
                    executeAction,
                    workspaceDir,
                    maxAttempts: 3,
                    callLlm: callLlm || undefined,
                });
                steps.push(...loopResult.steps);
                steps.push(`Tests final: ${loopResult.passed ? 'passed' : 'still failing after fixes'}`);
            }

            // Step 6: PR
            if (shouldCreatePr && !dryRun) {
                const prResult = await executeAction('workspace_create_pr', {
                    title:       `feat: ${title}`,
                    description: `Full-stack feature: ${description || title}`,
                });
                const prUrl = parseSubOutput(prResult)['pr_url'] as string | undefined;
                steps.push(`PR: ${prResult.ok ? (prUrl ?? 'opened') : 'failed'}`);
            }

            return safeJson({
                title,
                framework,
                http_client: httpClient,
                dry_run:     dryRun,
                steps,
                summary: dryRun
                    ? `Full-stack feature plan: ${title}`
                    : `Full-stack feature delivered: ${title} (${steps.length} steps)`,
            });
        }

        // ====================================================================
        // workspace_fsd_scaffold_project
        // Bootstrap a new full-stack project with state, auth, API, and env.
        //
        // payload:
        //   project_name    — project directory name
        //   framework?      — frontend framework (default: react)
        //   http_client?    — http client (default: fetch)
        //   auth_strategy?  — auth to scaffold (default: jwt)
        //   state_lib?      — state management library (default: zustand)
        //   output_dir?     — parent directory (default: workspaceDir)
        // ====================================================================
        case 'workspace_fsd_scaffold_project': {
            const projectName   = str(payload['project_name'], 'my-app');
            const framework     = isUiFramework(payload['framework']) ? payload['framework'] : 'react';
            const httpClient    = isHttpClient(payload['http_client']) ? payload['http_client'] : 'fetch';
            const authStrategy  = isAuthStrategy(payload['auth_strategy']) ? payload['auth_strategy'] : 'jwt';
            const stateLib      = isStateMgmtLib(payload['state_lib']) ? payload['state_lib'] : 'zustand';
            const outputDir     = str(payload['output_dir'], workspaceDir);
            const projectRoot   = `${outputDir}/${projectName}`;

            const writtenFiles: string[] = [];

            // package.json
            await executeAction('workspace_write_file', {
                file_path: `${projectRoot}/package.json`,
                content: JSON.stringify({
                    name:    projectName,
                    version: '0.1.0',
                    scripts: {
                        dev:   'vite',
                        build: 'tsc && vite build',
                        test:  'vitest',
                        lint:  'eslint src --ext .ts,.tsx',
                    },
                    dependencies:    { react: '^18.0.0', 'react-dom': '^18.0.0' },
                    devDependencies: { typescript: '^5.0.0', vite: '^5.0.0', vitest: '^1.0.0', eslint: '^8.0.0' },
                }, null, 2),
            });
            writtenFiles.push(`${projectRoot}/package.json`);

            // State management
            const storeScaffold = generateStateManagementScaffold(stateLib, ['appStore'], framework);
            for (const f of storeScaffold.files) {
                const fp = `${projectRoot}/src/store/${f.filename}`;
                await executeAction('workspace_write_file', { file_path: fp, content: f.code });
                writtenFiles.push(fp);
            }

            // Auth
            const authScaffold = generateAuthScaffold(authStrategy, framework);
            for (const f of authScaffold.files) {
                const fp = `${projectRoot}/src/auth/${f.filename}`;
                await executeAction('workspace_write_file', { file_path: fp, content: f.code });
                writtenFiles.push(fp);
            }

            // API client stub
            const apiScaffold = generateApiClientCode(
                [{ method: 'GET', path: '/api/health', auth: false, responseType: 'HealthResponse' }],
                { baseUrl: '/api', httpClient, framework, moduleName: 'api' },
            );
            const clientFp = `${projectRoot}/src/api/${apiScaffold.clientFilename}`;
            await executeAction('workspace_write_file', { file_path: clientFp, content: apiScaffold.clientCode });
            writtenFiles.push(clientFp);

            // Env template
            const envVars: EnvVariable[] = [
                { key: 'VITE_API_BASE_URL', description: 'Backend API base URL', required: true,  example: 'http://localhost:3000' },
                { key: 'VITE_APP_NAME',     description: 'Application name',     required: false, example: projectName },
            ];
            const envTemplate = generateEnvTemplate(['development', 'production'], envVars);
            const envFp       = `${projectRoot}/${envTemplate.envFilename}`;
            const exampleFp   = `${projectRoot}/${envTemplate.exampleFilename}`;
            await executeAction('workspace_write_file', { file_path: envFp,     content: envTemplate.envContent     });
            await executeAction('workspace_write_file', { file_path: exampleFp, content: envTemplate.exampleContent });
            writtenFiles.push(envFp, exampleFp);

            // ── Persist tech stack to project context ─────────────────────
            await saveProjectCtx(updateContextFromScaffold(
                projectCtx ?? createEmptyProjectContext(projectName),
                { project_name: projectName, framework, state_lib: stateLib, auth_strategy: authStrategy },
            ));

            return safeJson({
                project_name:  projectName,
                framework,
                http_client:   httpClient,
                auth_strategy: authStrategy,
                state_lib:     stateLib,
                project_root:  projectRoot,
                written_files: writtenFiles,
                summary: `Project scaffolded: ${projectName} (${framework} + ${stateLib} + ${authStrategy} auth)`,
            });
        }

        // ====================================================================
        // workspace_fsd_deploy_preview
        // Deploy the project to a preview environment (Vercel / Netlify).
        //
        // payload:
        //   provider?     — vercel | netlify | cloudflare_pages (default: vercel)
        //   project_id?   — provider project ID
        //   dry_run?      — print command only, do not execute
        // ====================================================================
        case 'workspace_fsd_deploy_preview': {
            const provider  = str(payload['provider'], 'vercel');
            const projectId = str(payload['project_id']);
            const dryRun    = payload['dry_run'] === true;

            if (!runCommand) {
                return { ok: false, output: '', errorOutput: 'workspace_fsd_deploy_preview: runCommand callback not available' };
            }

            let deployCmd: string[];
            if (provider === 'netlify') {
                deployCmd = ['npx', 'netlify', 'deploy', '--dir=dist'];
            } else {
                // Vercel (default)
                deployCmd = projectId
                    ? ['npx', 'vercel', '--yes', '--project', projectId]
                    : ['npx', 'vercel', '--yes'];
            }

            if (dryRun) {
                return safeJson({
                    provider,
                    dry_run:    true,
                    deploy_cmd: deployCmd.join(' '),
                    summary:    `Deploy preview (dry-run): ${deployCmd.join(' ')}`,
                });
            }

            const deployResult = await runCommand(deployCmd, workspaceDir, 300_000);
            const previewUrl   = deployResult.stdout.match(/https:\/\/[^\s]+/)?.[0] ?? null;

            return safeJson({
                provider,
                exit_code:   deployResult.exitCode,
                preview_url: previewUrl,
                ok:          deployResult.exitCode === 0,
                summary:     previewUrl ? `Preview deployed: ${previewUrl}` : `Deploy ${deployResult.exitCode === 0 ? 'succeeded' : 'failed'}`,
            });
        }

        // ====================================================================
        // workspace_fsd_standup_report
        // Generate an FSD-specific standup summary with frontend health metrics.
        //
        // payload:
        //   bot_name?         — bot display name
        //   team_name?        — team name
        //   recent_memory?    — string[] of recent episodic memory entries
        //   ceremony_type?    — standup | planning | review | retrospective | grooming
        //   sprint_number?    — current sprint number
        //   sprint_goal?      — sprint goal statement
        //   days_remaining?   — days left in sprint
        //   lcp?              — LCP ms
        //   cls?              — CLS score
        //   fid?              — FID ms
        //   a11y_score?       — 0–100
        //   seo_score?        — 0–100
        //   bundle_size_kb?   — bundle size in KB
        // ====================================================================
        case 'workspace_fsd_standup_report': {
            const botName    = str(payload['bot_name'],  'AI Full-Stack Developer');
            const teamName   = str(payload['team_name'], 'the team');
            const recentMemory = Array.isArray(payload['recent_memory'])
                ? (payload['recent_memory'] as string[])
                : [];

            const lcp          = typeof payload['lcp']           === 'number' ? payload['lcp']           : null;
            const cls          = typeof payload['cls']           === 'number' ? payload['cls']           : null;
            const fid          = typeof payload['fid']           === 'number' ? payload['fid']           : null;
            const a11yScore    = typeof payload['a11y_score']    === 'number' ? payload['a11y_score']    : null;
            const seoScore     = typeof payload['seo_score']     === 'number' ? payload['seo_score']     : null;
            const bundleSizeKb = typeof payload['bundle_size_kb'] === 'number' ? payload['bundle_size_kb'] : null;

            const frontendHealth = buildFrontendHealthReport({ lcp, cls, fid, a11yScore, seoScore, bundleSizeKb });

            const sprintContext = {
                sprintNumber:  typeof payload['sprint_number']  === 'number' ? payload['sprint_number']  : undefined,
                sprintGoal:    typeof payload['sprint_goal']    === 'string' ? payload['sprint_goal']    : undefined,
                daysRemaining: typeof payload['days_remaining'] === 'number' ? payload['days_remaining'] : undefined,
            };

            const summary = buildFsdStandupSummary(recentMemory, {
                botName,
                teamName,
                sprintContext,
                frontendHealth,
            });

            const ceremonyTypeRaw = str(payload['ceremony_type'], 'standup') as FsdCeremonyType;
            const validCeremonies: FsdCeremonyType[] = ['standup', 'planning', 'review', 'retrospective', 'grooming'];
            const ceremonyType = validCeremonies.includes(ceremonyTypeRaw) ? ceremonyTypeRaw : 'standup';
            const ceremonyCtx  = buildFsdSprintContext(ceremonyType, { botName, teamName, summary });

            const llmEnhancement = await callLlmSafe(
                callLlm,
                `Generate a concise standup message for a full-stack developer agent.\n\nBot name: ${botName}\nTeam: ${teamName}\nFrontend health: ${frontendHealth.summary}\nDraft: ${summary.spokenText}`,
                'You are an AI full-stack developer. Write a brief, professional standup message.',
            );

            // ── Persist sprint state to project context ───────────────────
            if (sprintContext.sprintGoal) {
                await saveProjectCtx(updateContextFromStandup(
                    projectCtx ?? createEmptyProjectContext(),
                    { sprint_goal: sprintContext.sprintGoal },
                ));
            }

            const spokenText = llmEnhancement || summary.spokenText;

            // Post path: publish the standup to the team channel instead of just
            // returning it. Routine → no gate. Fail-safe: a post failure still
            // returns the report.
            if (payload['post'] === true) {
                const channel = str(payload['channel']).trim();
                if (!channel) {
                    return safeJson({ posted: false, reason: 'post=true requires payload.channel', summary, ceremony_context: ceremonyCtx, frontend_health: frontendHealth, spoken_text: spokenText });
                }
                const postRes = await executeAction('workspace_slack_notify', { channel, message: spokenText });
                return safeJson({
                    posted: postRes.ok,
                    ...(postRes.ok ? { channel } : { reason: postRes.errorOutput ?? 'slack post failed' }),
                    summary,
                    ceremony_context: ceremonyCtx,
                    frontend_health:  frontendHealth,
                    spoken_text:      spokenText,
                });
            }

            return safeJson({
                summary,
                ceremony_context: ceremonyCtx,
                frontend_health:  frontendHealth,
                spoken_text:      spokenText,
            });
        }

        // ====================================================================
        // workspace_fsd_visual_review
        // Visual UI review: static CSS analysis + desktop-vision critique.
        //
        // Delegates to the existing workspace_visual_task action (real desktop
        // vision agent) and augments with static CSS analysis for contrast,
        // touch targets, font sizes, and line-height.
        //
        // payload:
        //   css_file_path?    — relative path to CSS/SCSS file to scan
        //   screenshot_url?   — URL of the live page to screenshot and inspect
        //   component_name?   — component label for the vision prompt
        //   framework?        — frontend framework (default: React)
        //   design_system?    — e.g. "Tailwind", "Material UI 5"
        // ====================================================================
        case 'workspace_fsd_visual_review': {
            const cssFilePath   = str(payload['css_file_path']);
            const screenshotUrl = str(payload['screenshot_url']);
            const componentName = str(payload['component_name']);
            const framework     = str(payload['framework'], 'React');
            const designSystem  = str(payload['design_system']);

            const allIssues: VisualIssue[] = [];
            let screenshotPath: string | undefined;
            let liveRun = false;

            // 1. Static CSS analysis — no browser required
            if (cssFilePath) {
                const cssResult = await executeAction('workspace_read_file', { file_path: cssFilePath });
                if (cssResult.ok && cssResult.output) {
                    const staticIssues = analyzeCssForVisualIssues(cssResult.output);
                    allIssues.push(...staticIssues);
                }
            }

            // 2. Vision-model critique — delegate to workspace_visual_task
            if (screenshotUrl || componentName) {
                const visualGoal = componentName
                    ? `Review the UI component "${componentName}" for visual issues: spacing, alignment, contrast, typography. Framework: ${framework}${designSystem ? `. Design system: ${designSystem}` : ''}.`
                    : `Review this page for visual UI issues. Focus on: spacing, alignment, contrast, typography, layout.`;

                const visionResult = await executeAction('workspace_visual_task', {
                    goal: visualGoal,
                    ...(screenshotUrl ? { url: screenshotUrl } : {}),
                });

                if (visionResult.ok && visionResult.output) {
                    screenshotPath = screenshotUrl || undefined;
                    liveRun = true;

                    // Try structured JSON first
                    const visionIssues = parseVisualCritiqueResponse(visionResult.output);
                    if (visionIssues.length > 0) {
                        allIssues.push(...visionIssues);
                    } else if (callLlm && visionResult.output.length > 20) {
                        // Vision agent returned prose — ask LLM to re-structure it
                        const prompt = buildVisualCritiquePrompt({
                            componentName: componentName || undefined,
                            framework,
                            designSystem:  designSystem || undefined,
                        });
                        const llmRaw = await callLlmSafe(
                            callLlm,
                            `${prompt}\n\nVision output to structure:\n${visionResult.output.slice(0, 3000)}`,
                        );
                        allIssues.push(...parseVisualCritiqueResponse(llmRaw));
                    }
                }
            }

            const { score, summary } = summariseVisualReport(allIssues);

            return safeJson({
                score,
                issues:          allIssues,
                issue_count:     allIssues.length,
                critical_count:  allIssues.filter((i) => i.severity === 'critical').length,
                warning_count:   allIssues.filter((i) => i.severity === 'warning').length,
                screenshot_path: screenshotPath,
                live_run:        liveRun,
                summary,
            });
        }

        // ====================================================================
        // workspace_fsd_clarify_spec
        // Ambiguity resolution: score spec completeness and produce a
        // prioritised list of clarifying questions before implementation.
        //
        // payload:
        //   title?               — task / feature title
        //   description?         — task description
        //   acceptance_criteria? — string or string[]
        //   framework?           — frontend framework
        //   figma_url?           — Figma design link
        //   design?              — design description
        //   api_contract?        — API contract / OpenAPI URL
        //   auth?                — auth requirements
        //   error_handling?      — error-handling expectations
        //   performance?         — performance targets
        //   browser_support?     — browser / device matrix
        //   endpoints?           — existing endpoint definitions (array)
        // ====================================================================
        case 'workspace_fsd_clarify_spec': {
            const rawSpec = {
                title:               str(payload['title'])               || undefined,
                description:         str(payload['description'])         || undefined,
                acceptance_criteria: payload['acceptance_criteria'] as string | string[] | undefined,
                framework:           str(payload['framework'])           || undefined,
                figma_url:           str(payload['figma_url'])           || undefined,
                design:              str(payload['design'])              || undefined,
                api_contract:        str(payload['api_contract'])        || undefined,
                auth:                str(payload['auth'])                || undefined,
                error_handling:      str(payload['error_handling'])      || undefined,
                performance:         str(payload['performance'])         || undefined,
                browser_support:     str(payload['browser_support'])     || undefined,
                endpoints:           Array.isArray(payload['endpoints']) ? payload['endpoints'] as unknown[] : undefined,
            };

            const analysis = analyzeSpecCompleteness(rawSpec);

            // LLM enrichment: domain-specific follow-up questions beyond the static gaps
            let allQuestions = [...analysis.questions];
            if (callLlm && analysis.gaps.length > 0 && rawSpec.title && rawSpec.description) {
                const clPrompt = buildClarificationPrompt({
                    title:       rawSpec.title,
                    description: rawSpec.description,
                    gaps:        analysis.gaps,
                    framework:   rawSpec.framework,
                });
                const llmRaw      = await callLlmSafe(callLlm, clPrompt, 'You are a senior developer doing requirements clarification.');
                const llmQuestions = parseLlmClarificationResponse(llmRaw, allQuestions.length + 1);
                allQuestions = [...allQuestions, ...llmQuestions];
            }

            const formattedOutput = formatQuestionsForHuman(allQuestions);

            // ── Persist open questions to project context ─────────────────
            if (allQuestions.length > 0) {
                await saveProjectCtx(updateContextFromSpec(
                    projectCtx ?? createEmptyProjectContext(),
                    allQuestions,
                ));
            }

            return safeJson({
                score:                analysis.score,
                is_ready_to_implement: analysis.isReadyToImplement,
                gaps:                 analysis.gaps,
                questions:            allQuestions,
                formatted_output:     formattedOutput,
                summary:              analysis.summary,
            });
        }

        // ====================================================================
        // workspace_fsd_security_deep_scan
        // Adversarial security analysis: static pattern scan + LLM red-team
        // review focused on business-logic vulnerabilities that SAST misses.
        //
        // payload:
        //   file_path?           — path to feature source file to read
        //   feature_code?        — raw source code string (alternative to file_path)
        //   feature_title?       — short feature name for context
        //   feature_description? — what the feature does
        //   auth_code?           — auth/permission code snippet for context
        //   framework?           — framework/runtime context (default: Node.js/TypeScript)
        // ====================================================================
        case 'workspace_fsd_security_deep_scan': {
            const featureTitle       = str(payload['feature_title'], 'Feature');
            const featureDescription = str(payload['feature_description']);
            const filePath           = str(payload['file_path']);
            let   featureCode        = str(payload['feature_code']);
            const authCode           = str(payload['auth_code']);
            const framework          = str(payload['framework'], 'Node.js/TypeScript');

            // Read code from file if not inlined
            if (!featureCode && filePath) {
                const readResult = await executeAction('workspace_read_file', { file_path: filePath });
                featureCode = readResult.ok ? readResult.output : '';
            }

            if (!featureCode) {
                return {
                    ok: false,
                    output: '',
                    errorOutput: 'workspace_fsd_security_deep_scan: feature_code or file_path is required',
                };
            }

            // 1. Static scan — fast regex patterns (eval, innerHTML, secrets, etc.)
            const staticFindings = runStaticSecurityChecks(featureCode);

            // 2. LLM adversarial scan — business-logic vulnerabilities
            let llmFindings: SecurityFinding[] = [];
            if (callLlm) {
                const secPrompt = buildBusinessLogicSecurityPrompt({
                    featureTitle,
                    featureDescription: featureDescription || featureTitle,
                    featureCode,
                    authCode:  authCode || undefined,
                    framework,
                });
                const llmRaw = await callLlmSafe(
                    callLlm,
                    secPrompt,
                    'You are a senior application security engineer. Think like an attacker.',
                );
                llmFindings = parseSecurityFindings(llmRaw);
            }

            const report = buildSecurityReport(staticFindings, llmFindings);

            return safeJson({
                score:             report.score,
                critical_count:    report.criticalCount,
                high_count:        report.highCount,
                finding_count:     report.findings.length,
                findings:          report.findings,
                executive_summary: report.executiveSummary,
                static_scan_count: staticFindings.length,
                llm_scan_count:    llmFindings.length,
                summary:           report.executiveSummary,
            });
        }

        // ====================================================================
        // workspace_fsd_arch_review
        // Architectural trade-off reasoning: given a question and codebase
        // context, produces a full Architecture Decision Record (ADR) with
        // options, trade-offs, recommendation, and implementation plan.
        //
        // payload:
        //   question            — the architectural question to answer (required)
        //   requirements?       — string[] of non-functional requirements
        //   constraints?        — string[] of hard constraints
        //   team_size?          — number of developers
        //   delivery_timeline?  — e.g. "6 weeks"
        //   output_dir?         — where to write the ADR markdown (default: docs/adr)
        // ====================================================================
        case 'workspace_fsd_arch_review': {
            const question         = str(payload['question']);
            const requirements     = Array.isArray(payload['requirements'])  ? (payload['requirements']  as string[]) : undefined;
            const constraints      = Array.isArray(payload['constraints'])   ? (payload['constraints']   as string[]) : undefined;
            const teamSize         = typeof payload['team_size'] === 'number' ? payload['team_size']                  : undefined;
            const deliveryTimeline = str(payload['delivery_timeline'])       || undefined;
            const outputDir        = str(payload['output_dir'], 'docs/adr');

            if (!question) {
                return {
                    ok: false,
                    output: '',
                    errorOutput: 'workspace_fsd_arch_review: question is required',
                };
            }

            // 1. Scout codebase to extract stack fingerprint
            const scoutResult    = await executeAction('workspace_scout', {
                workspace_dir: workspaceDir,
                query:         question,
            });
            const codebaseContext = buildArchReviewContext(scoutResult.ok ? scoutResult.output : '');

            if (!callLlm) {
                return safeJson({
                    question,
                    codebase_context: codebaseContext,
                    adr:              null,
                    summary:          'LLM not available — codebase context extracted but ADR not generated',
                });
            }

            // 2. Generate ADR via LLM
            const adrPrompt = buildAdrPrompt({
                question,
                codebaseContext,
                requirements,
                constraints,
                teamSize,
                deliveryTimeline,
            });
            const llmRaw = await callLlmSafe(
                callLlm,
                adrPrompt,
                'You are a principal software architect. Return only valid JSON.',
            );
            const adr = parseAdrFromLlm(llmRaw, question);

            // 3. Write ADR as Markdown
            const adrMd       = formatAdrAsMarkdown(adr);
            const adrSlug     = adr.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
            const adrFileName = `${outputDir}/adr-${adrSlug}.md`;

            await executeAction('workspace_write_file', {
                file_path: adrFileName,
                content:   adrMd,
            });

            // ── Persist ADR decision to project context ───────────────────
            await saveProjectCtx(updateContextFromAdr(
                projectCtx ?? createEmptyProjectContext(),
                {
                    title:     adr.title,
                    decision:  adr.decision,
                    rationale: adr.context,   // context = why this decision was needed
                },
            ));

            return safeJson({
                question,
                codebase_context: codebaseContext,
                adr,
                adr_file:         adrFileName,
                summary:          `ADR generated: "${adr.title}" — ${adr.options.length} option(s), ${adr.implementationPlan.length} implementation step(s)`,
            });
        }

        // ====================================================================
        // workspace_fsd_browser_debug
        // Live runtime error capture: launches headless Chromium via Playwright,
        // intercepts console errors, uncaught JS exceptions, and HTTP failures,
        // then asks the LLM to suggest a concrete fix for each finding.
        //
        // payload:
        //   target_url    — URL of the running app to debug (required)
        //   timeout_ms?   — Playwright navigation timeout in ms (default: 30000)
        //   source_file?  — relative path of source file to include as LLM context
        //   source_code?  — raw source code string for LLM context
        // ====================================================================
        case 'workspace_fsd_browser_debug': {
            const targetUrl  = str(payload['target_url']);
            const timeoutMs  = typeof payload['timeout_ms'] === 'number' ? payload['timeout_ms'] : 30_000;
            const sourceFile = str(payload['source_file']);
            let   sourceCode = str(payload['source_code']);

            if (!targetUrl) {
                return {
                    ok: false,
                    output: '',
                    errorOutput: 'workspace_fsd_browser_debug: target_url is required',
                };
            }

            if (!runCommand) {
                return {
                    ok: false,
                    output: '',
                    errorOutput: 'workspace_fsd_browser_debug: runCommand callback not available',
                };
            }

            // Read source file for LLM fix context if not inlined
            if (!sourceCode && sourceFile) {
                const readResult = await executeAction('workspace_read_file', { file_path: sourceFile });
                sourceCode = readResult.ok ? readResult.output : '';
            }

            // 1. Write the self-contained Playwright script to a temp file
            const script     = buildPlaywrightDebugScript(targetUrl, timeoutMs);
            const scriptPath = '__fsd_browser_debug.cjs';
            await executeAction('workspace_write_file', {
                file_path: scriptPath,
                content:   script,
            });

            // 2. Run the script — capture stdout + stderr.
            // Hard-fail contract: if the tooling cannot run at all, this action
            // FAILS — a fabricated empty report would read as a clean scan.
            let runResult: { stdout: string; stderr: string; exitCode: number };
            try {
                runResult = await runCommand(
                    ['node', scriptPath],
                    workspaceDir,
                    timeoutMs + 10_000,
                );
            } catch (runErr) {
                const msg = runErr instanceof Error ? runErr.message : String(runErr);
                return {
                    ok: false,
                    output: '',
                    errorOutput: `workspace_fsd_browser_debug: debug script could not be spawned: ${msg}. Ensure Node and Playwright are installed (npm install playwright).`,
                };
            }

            const combinedOutput = runResult.stdout + '\n' + runResult.stderr;
            let report = parseBrowserDebugOutput(combinedOutput, targetUrl);
            const salvagedFindings = report.errors.length > 0 || report.networkFailures.length > 0;

            if (runResult.exitCode !== 0 && !salvagedFindings) {
                return {
                    ok: false,
                    output: '',
                    errorOutput:
                        `workspace_fsd_browser_debug: debug script exited ${runResult.exitCode} without producing a report: ` +
                        `${runResult.stderr.trim().slice(0, 400) || '(no stderr)'}. ` +
                        'Ensure Playwright is installed (npm install playwright).',
                };
            }
            if (runResult.exitCode === 0 && !combinedOutput.includes('{')) {
                return {
                    ok: false,
                    output: '',
                    errorOutput: 'workspace_fsd_browser_debug: debug script produced no report output — cannot assess the page.',
                };
            }

            // 3. LLM analysis: root-cause each error + suggest fixes
            if (callLlm && report.errors.length > 0) {
                const analysisPrompt = buildDebugAnalysisPrompt(report, sourceCode || undefined);
                const llmRaw         = await callLlmSafe(
                    callLlm,
                    analysisPrompt,
                    'You are a senior full-stack developer debugging a live web app.',
                );
                report = { ...report, errors: applyDebugSuggestions(llmRaw, report.errors) };
            }

            return safeJson({
                target_url:        targetUrl,
                score:             report.score,
                errors:            report.errors,
                error_count:       report.errors.filter((e) => e.severity === 'error').length,
                warning_count:     report.errors.filter((e) => e.severity === 'warning').length,
                network_failures:  report.networkFailures,
                net_failure_count: report.networkFailures.length,
                summary:           report.summary,
            });
        }

        // ====================================================================
        // workspace_fsd_perf_profile
        // Live CPU hot-path detection via Chrome DevTools Protocol.
        //
        // Strategy (with automatic fallback):
        //   Path A — chrome-devtools-mcp (preferred):
        //     workspace_perf_trace_start → navigate → workspace_perf_trace_stop
        //     → workspace_perf_trace_analyze  (CrUX data + built-in insights)
        //   Path B — Playwright CDP script (fallback when MCP unavailable):
        //     Writes + runs __fsd_perf_profile.cjs, parses V8 cpuprofile,
        //     then applies LLM optimisation hints.
        //
        // payload:
        //   target_url    — URL of the running app to profile (required)
        //   duration_ms?  — profiling window in ms, Path B only (default: 5000)
        //   source_file?  — path to source file to include as LLM context
        //   source_code?  — raw source code string for LLM context
        //   force_playwright? — set true to skip MCP and use Path B directly
        // ====================================================================
        case 'workspace_fsd_perf_profile': {
            const targetUrl  = str(payload['target_url']);
            const durationMs = typeof payload['duration_ms'] === 'number' ? payload['duration_ms'] : 5_000;
            const sourceFile = str(payload['source_file']);
            let   sourceCode = str(payload['source_code']);
            const forcePw    = payload['force_playwright'] === true;

            if (!targetUrl) {
                return { ok: false, output: '', errorOutput: 'workspace_fsd_perf_profile: target_url is required' };
            }

            // Read source file for LLM context if not inlined
            if (!sourceCode && sourceFile) {
                const readResult = await executeAction('workspace_read_file', { file_path: sourceFile });
                sourceCode = readResult.ok ? readResult.output : '';
            }

            // ── Path A: chrome-devtools-mcp performance trace ─────────────────
            const mcpUrl = (process.env['MCP_CHROME_DEVTOOLS_URL'] ?? '').trim();
            if (mcpUrl && !forcePw) {
                try {
                    await executeAction('workspace_perf_trace_start', {});
                    await executeAction('workspace_web_navigate', { url: targetUrl });
                    // Let the page run for the requested duration
                    await new Promise<void>((resolve) => setTimeout(resolve, Math.min(durationMs, 15_000)));
                    const stopResult  = await executeAction('workspace_perf_trace_stop', {});
                    const insightResult = await executeAction('workspace_perf_trace_analyze', {});
                    const output = [stopResult.output, insightResult.output].filter(Boolean).join('\n\n');
                    return {
                        ok: true,
                        output: JSON.stringify({
                            target_url: targetUrl,
                            backend:    'chrome-devtools-mcp',
                            trace_stop: stopResult.output,
                            insights:   insightResult.output,
                            summary:    output.slice(0, 500),
                        }, null, 2),
                        errorOutput: '',
                    };
                } catch (mcpErr) {
                    console.warn(`[fsd-perf-profile] MCP trace failed (${mcpErr}), falling back to Playwright CDP.`);
                    // fall through to Path B
                }
            }

            // ── Path B: Playwright CDP script ────────────────────────────────
            if (!runCommand) {
                return { ok: false, output: '', errorOutput: 'workspace_fsd_perf_profile: runCommand callback not available and MCP is unreachable' };
            }

            const script     = buildPlaywrightProfilingScript(targetUrl, durationMs);
            const scriptPath = '__fsd_perf_profile.cjs';
            await executeAction('workspace_write_file', { file_path: scriptPath, content: script });

            // Hard-fail contract: a zero-sample "profile" from a crashed script
            // is not a measurement — fail so the runtime records it as such.
            let profileRun: { stdout: string; stderr: string; exitCode: number };
            try {
                profileRun = await runCommand(['node', scriptPath], workspaceDir, durationMs + 40_000);
            } catch (runErr) {
                const msg = runErr instanceof Error ? runErr.message : String(runErr);
                return {
                    ok: false,
                    output: '',
                    errorOutput: `workspace_fsd_perf_profile: profiling script could not be spawned: ${msg}. Ensure Node and Playwright are installed (npm install playwright).`,
                };
            }

            const profileOutput = profileRun.stdout + '\n' + profileRun.stderr;
            let report = parseCpuProfile(profileOutput, targetUrl);

            if (profileRun.exitCode !== 0 && report.totalSamples === 0) {
                return {
                    ok: false,
                    output: '',
                    errorOutput:
                        `workspace_fsd_perf_profile: profiling script exited ${profileRun.exitCode} without producing a profile: ` +
                        `${profileRun.stderr.trim().slice(0, 400) || '(no stderr)'}. ` +
                        'Ensure Playwright is installed (npm install playwright).',
                };
            }
            if (profileRun.exitCode === 0 && !profileOutput.includes('{')) {
                return {
                    ok: false,
                    output: '',
                    errorOutput: 'workspace_fsd_perf_profile: profiling script produced no profile output — cannot measure the page.',
                };
            }

            if (callLlm && report.hotFunctions.length > 0) {
                const optPrompt = buildPerfOptimizationPrompt(report, sourceCode || undefined);
                const llmRaw    = await callLlmSafe(callLlm, optPrompt, 'You are a senior performance engineer. Be specific and actionable.');
                report = { ...report, hotFunctions: applyPerfSuggestions(llmRaw, report.hotFunctions) };
            }

            return safeJson({
                target_url:    targetUrl,
                backend:       'playwright-cdp',
                score:         report.score,
                total_samples: report.totalSamples,
                duration_ms:   report.durationMs,
                hot_functions: report.hotFunctions,
                hot_fn_count:  report.hotFunctions.length,
                summary:       report.summary,
            });
        }

        // ====================================================================
        // workspace_fsd_negotiate
        // Cross-team negotiation via the human approval dashboard.
        // The agent frames a structured negotiation request with 2–4 concrete
        // options. The ApprovalEnforcer (this action is HIGH_RISK) intercepts
        // execution, creates an approval record whose action_summary carries
        // the formatted request, and routes it to the dashboard's Negotiate tab.
        // The human selects an option and approves/rejects; selected_option_id
        // is returned with the decision.
        //
        // payload:
        //   negotiation_type   — deadline_extension | scope_reduction |
        //                        resource_request | dependency_unblock |
        //                        priority_conflict
        //   title              — short title for the negotiation (required)
        //   current_situation  — what is blocked / at stake
        //   agent_proposal?    — preferred resolution (LLM generates if absent)
        //   justification?     — rationale (LLM generates if absent)
        //   terms?             — NegotiationTerm[] (LLM generates if absent)
        //   urgency?           — low | medium | high (default: medium)
        //   constraints?       — constraints fed to LLM prompt
        //   team_context?      — team context fed to LLM prompt
        //   original_deadline? — original deadline string (informational)
        // ====================================================================
        case 'workspace_fsd_negotiate': {
            const VALID_TYPES: NegotiationType[] = [
                'deadline_extension', 'scope_reduction', 'resource_request',
                'dependency_unblock', 'priority_conflict',
            ];
            const typeRaw = str(payload['negotiation_type']);
            const type: NegotiationType = (VALID_TYPES as string[]).includes(typeRaw)
                ? (typeRaw as NegotiationType)
                : 'priority_conflict';

            const title            = str(payload['title'], 'Cross-team negotiation');
            const currentSituation = str(payload['current_situation']);
            const constraints      = str(payload['constraints']);
            const teamContext      = str(payload['team_context']);
            const originalDeadline = str(payload['original_deadline']);
            const urgencyRaw       = str(payload['urgency']);
            const urgency          = (['low', 'medium', 'high'] as const).includes(urgencyRaw as 'low')
                ? (urgencyRaw as 'low' | 'medium' | 'high')
                : 'medium';

            // ── Parse inline terms from payload ───────────────────────────
            const termsRaw = Array.isArray(payload['terms']) ? (payload['terms'] as unknown[]) : [];
            let terms: NegotiationTerm[] = termsRaw
                .filter((t): t is Record<string, unknown> =>
                    typeof t === 'object' && t !== null
                    && (typeof (t as Record<string, unknown>)['optionId'] === 'string'
                        || typeof (t as Record<string, unknown>)['option_id'] === 'string'),
                )
                .map((t) => ({
                    optionId:    str(t['optionId'] ?? t['option_id']),
                    description: str(t['description']),
                    impact:      str(t['impact']),
                }))
                .filter((t) => t.optionId.length > 0)
                .slice(0, 4);

            let agentProposal = str(payload['agent_proposal']);
            let justification = str(payload['justification']);

            // ── LLM generation when terms or proposal are missing ─────────
            if ((terms.length === 0 || !agentProposal) && callLlm) {
                const prompt = buildNegotiationLlmPrompt({
                    type, title, currentSituation, constraints, teamContext,
                });
                const llmRaw = await callLlmSafe(
                    callLlm,
                    prompt,
                    'You are an expert engineering lead facilitating negotiations. Be specific, constructive, and practical.',
                );
                const parsed = parseNegotiationLlmOutput(llmRaw);
                if (!agentProposal) agentProposal = parsed.agentProposal;
                if (!justification) justification = parsed.justification;
                if (terms.length === 0) terms = parsed.terms;
            }

            // ── Fallback terms so there are always options ────────────────
            if (terms.length === 0) {
                terms = buildFallbackTerms(type);
            }

            const request: NegotiationRequest = {
                type,
                title,
                currentSituation,
                agentProposal:    agentProposal || 'See options below for possible resolutions.',
                justification:    justification || 'Human-level decision required to unblock progress.',
                terms,
                urgency,
                ...(originalDeadline ? { originalDeadline } : {}),
            };

            // ── Build the action_summary that the dashboard will display ──
            const actionSummary = buildNegotiationActionSummary(request);

            return safeJson({
                negotiation_type:  type,
                title,
                urgency,
                current_situation: currentSituation,
                agent_proposal:    request.agentProposal,
                justification:     request.justification,
                terms,
                term_count:        terms.length,
                action_summary:    actionSummary,
                status:            'pending_human_decision',
                summary:           `Negotiation request submitted: "${title}" (${urgency} urgency, ${terms.length} option(s) for human review).`,
            });
        }

        // ====================================================================
        // workspace_fsd_project_context_sync
        // Full project context rescan — reads package.json, README, ADR files,
        // and recent episodic memory, then asks the LLM to synthesise them into
        // a ProjectContext saved at `.agentfarm/project-context.json`.
        //
        // After this runs, every LLM call in this handler will automatically
        // receive project context injected into its system prompt.
        //
        // payload:
        //   package_json_path?  — path to package.json (default: package.json)
        //   readme_path?        — path to README (default: README.md)
        //   adr_dir?            — directory containing ADR .md files
        //                          (default: docs/adr)
        //   force?              — true to overwrite existing context fully
        //                          (default: false — merges with existing)
        // ====================================================================
        case 'workspace_fsd_project_context_sync': {
            const packageJsonPath = str(payload['package_json_path'], 'package.json');
            const readmePath      = str(payload['readme_path'],       'README.md');
            const adrDir          = str(payload['adr_dir'],           'docs/adr');
            const force           = payload['force'] === true;

            // ── Collect workspace files ───────────────────────────────────
            const pkgResult    = await executeAction('workspace_read_file', { file_path: packageJsonPath });
            const readmeResult = await executeAction('workspace_read_file', { file_path: readmePath });

            // Discover ADR files
            const adrListResult = await executeAction('workspace_list_files', {
                path:    adrDir,
                pattern: '*.md',
            });
            const adrFiles: string[] = [];
            if (adrListResult.ok && adrListResult.output) {
                const adrPaths = adrListResult.output
                    .split('\n')
                    .map((p) => p.trim())
                    .filter((p) => p.endsWith('.md'))
                    .slice(0, 5);
                for (const adrPath of adrPaths) {
                    const adrContent = await executeAction('workspace_read_file', { file_path: adrPath });
                    if (adrContent.ok) adrFiles.push(adrContent.output.slice(0, 1200));
                }
            }

            // Recent episodic activity for context
            const memResult = await executeAction('workspace_memory_search', {
                query: 'fsd full-stack',
                limit: 8,
            });
            const recentTasks = memResult.ok ? memResult.output : undefined;

            const fileContents = {
                packageJson: pkgResult.ok    ? pkgResult.output    : undefined,
                readme:      readmeResult.ok ? readmeResult.output : undefined,
                adrFiles:    adrFiles.length > 0 ? adrFiles : undefined,
                recentTasks,
            };

            const baseCtx = force
                ? createEmptyProjectContext()
                : (projectCtx ?? createEmptyProjectContext());

            // ── LLM synthesis ─────────────────────────────────────────────
            let syncedCtx: ProjectContext;
            if (callLlmBase) {
                // Use raw LLM caller (not context-wrapped) to avoid circular injection
                const syncPrompt = buildContextSyncPrompt(fileContents);
                const llmRaw     = await callLlmSafe(
                    callLlmBase,
                    syncPrompt,
                    'You are a software project analyst. Extract factual metadata accurately. Return valid JSON only.',
                );
                syncedCtx = parseContextFromLlm(llmRaw, baseCtx);
            } else {
                // No LLM — parse package.json name at minimum
                syncedCtx = baseCtx;
                if (pkgResult.ok) {
                    try {
                        const pkg = JSON.parse(pkgResult.output) as { name?: string; description?: string };
                        syncedCtx = mergeContextUpdate(baseCtx, {
                            projectName: pkg.name        ?? baseCtx.projectName,
                            description: pkg.description ?? baseCtx.description,
                        });
                    } catch { /* invalid JSON — keep base */ }
                }
            }

            await saveProjectCtx(syncedCtx);

            const techEntries = Object.values(syncedCtx.techStack).flat().length;
            return safeJson({
                synced:          true,
                project_name:    syncedCtx.projectName,
                description:     syncedCtx.description,
                tech_stack:      syncedCtx.techStack,
                decision_count:  syncedCtx.keyDecisions.length,
                question_count:  syncedCtx.openQuestions.length,
                sprint_goal:     syncedCtx.currentSprint?.goal ?? null,
                context_file:    CONTEXT_FILE,
                summary: `Project context synced: "${syncedCtx.projectName}" — ${techEntries} tech stack entr${techEntries === 1 ? 'y' : 'ies'}, ${syncedCtx.keyDecisions.length} key decision(s).`,
            });
        }

        // ====================================================================
        // workspace_fsd_org_context_sync  (Gap 3 — Org/political context)
        // Synthesises an OrgProfile from CODEOWNERS, GitHub teams, and
        // Jira/Linear project data.  Persists to `.agentfarm/org-profile.json`
        // and injects into every subsequent LLM call.
        //
        // payload:
        //   codeowners_path?  — path to CODEOWNERS (default: .github/CODEOWNERS)
        //   github_teams?     — JSON string of GitHub teams list
        //   jira_projects?    — raw Jira project list text
        //   linear_teams?     — raw Linear team list text
        //   org_name?         — org display name
        //   force?            — true to reset existing profile
        // ====================================================================
        case 'workspace_fsd_org_context_sync': {
            const codeownersPath = str(payload['codeowners_path'], '.github/CODEOWNERS');
            const orgName        = str(payload['org_name'], projectCtx?.projectName ?? 'My Organisation');
            const force          = payload['force'] === true;

            const ORG_FILE = '.agentfarm/org-profile.json';

            // Load existing org profile unless force-reset
            let existingOrgProfile = undefined;
            if (!force) {
                const existingRead = await executeAction('workspace_read_file', { file_path: ORG_FILE });
                if (existingRead.ok && existingRead.output) {
                    try { existingOrgProfile = JSON.parse(existingRead.output); } catch { /* ignore */ }
                }
            }

            // Read CODEOWNERS
            const coResult  = await executeAction('workspace_read_file', { file_path: codeownersPath });
            const codeownersContent = coResult.ok ? coResult.output : '';

            const githubTeams  = str(payload['github_teams']);
            const jiraProjects = str(payload['jira_projects']);
            const linearTeams  = str(payload['linear_teams']);

            let orgProfile = existingOrgProfile;

            if (callLlmBase) {
                const syncPrompt = buildOrgContextSyncPrompt({
                    codeownersContent,
                    githubTeams:  githubTeams  || 'Not provided',
                    jiraProjects: jiraProjects || 'Not provided',
                    linearTeams:  linearTeams  || 'Not provided',
                    existingProfile: existingOrgProfile,
                });
                const llmRaw = await callLlmSafe(
                    callLlmBase,
                    syncPrompt,
                    'You are a senior engineering manager building an org context profile. Return valid JSON only.',
                );
                orgProfile = parseOrgProfileFromLlm(llmRaw, orgName);
            }

            if (!orgProfile) {
                const { createEmptyOrgProfile } = await import('./fsd-org-profile.js');
                orgProfile = createEmptyOrgProfile(orgName);
            }

            // Persist org profile
            await executeAction('workspace_write_file', {
                file_path: ORG_FILE,
                content:   JSON.stringify(orgProfile, null, 2),
            });

            // Also store in project context
            await saveProjectCtx({ ...(projectCtx ?? createEmptyProjectContext()), orgProfile });

            return safeJson({
                org_name:       orgProfile.orgName,
                team_count:     orgProfile.teams.length,
                frozen_paths:   orgProfile.frozenPaths.length,
                tech_mandates:  orgProfile.techMandates.length,
                org_file:       ORG_FILE,
                formatted:      formatOrgProfileForLlm(orgProfile),
                summary: `Org context synced: "${orgProfile.orgName}" — ${orgProfile.teams.length} team(s), ${orgProfile.frozenPaths.length} frozen path(s)`,
            });
        }

        // ====================================================================
        // workspace_fsd_strategic_plan  (Gap 2 — Self-directed long projects)
        // Creates or updates a milestone-based project roadmap that the agent
        // can execute autonomously via `workspace_fsd_roadmap_tick`.
        //
        // payload:
        //   goal              — one-sentence project goal (required on first call)
        //   tech_stack?       — tech stack context for the LLM
        //   constraints?      — hard constraints (budget, team size, etc.)
        //   timeframe_weeks?  — target timeframe in weeks
        //   force?            — true to discard the existing roadmap
        // ====================================================================
        case 'workspace_fsd_strategic_plan': {
            const goal             = str(payload['goal'], projectCtx?.currentSprint?.goal ?? 'Build the project');
            const techStack        = str(payload['tech_stack']);
            const constraints      = str(payload['constraints']);
            const timeframeWeeks   = typeof payload['timeframe_weeks'] === 'number' ? payload['timeframe_weeks'] : undefined;
            const force            = payload['force'] === true;

            const ROADMAP_FILE = '.agentfarm/roadmap.json';

            // Load existing roadmap
            let existingRoadmap: ProjectRoadmap | undefined;
            if (!force) {
                const rmRead = await executeAction('workspace_read_file', { file_path: ROADMAP_FILE });
                if (rmRead.ok && rmRead.output) {
                    try { existingRoadmap = JSON.parse(rmRead.output) as ProjectRoadmap; } catch { /* ignore */ }
                }
            }

            const projectName = projectCtx?.projectName ?? 'My Project';

            let roadmap: ProjectRoadmap;
            if (callLlmBase) {
                const planPrompt = buildStrategicPlanPrompt({
                    projectName,
                    goal,
                    techStack:       techStack       || (projectCtx?.techStack ? Object.values(projectCtx.techStack).flat().join(', ') : undefined),
                    constraints:     constraints     || undefined,
                    timeframeWeeks:  timeframeWeeks  || undefined,
                    existingRoadmap: existingRoadmap || undefined,
                });
                const llmRaw = await callLlmSafe(
                    callLlmBase,
                    planPrompt,
                    'You are a principal engineer planning a software project. Return valid JSON only.',
                );
                roadmap = parseRoadmapFromLlm(llmRaw, projectName, goal);
            } else {
                roadmap = existingRoadmap ?? {
                    projectName,
                    goal,
                    milestones: [],
                    lastTickAt: null,
                    tickCount:  0,
                    createdAt:  new Date().toISOString(),
                    updatedAt:  new Date().toISOString(),
                };
            }

            await executeAction('workspace_write_file', {
                file_path: ROADMAP_FILE,
                content:   JSON.stringify(roadmap, null, 2),
            });

            // Store roadmap in project context
            await saveProjectCtx({ ...(projectCtx ?? createEmptyProjectContext(projectName)), roadmap });

            return safeJson({
                project_name:    projectName,
                goal:            roadmap.goal,
                milestone_count: roadmap.milestones.length,
                roadmap_file:    ROADMAP_FILE,
                milestones:      roadmap.milestones.map((m) => ({
                    id: m.id, title: m.title, status: m.status, task_count: m.tasks.length,
                })),
                summary: `Strategic plan created: "${roadmap.goal}" — ${roadmap.milestones.length} milestone(s)`,
            });
        }

        // ====================================================================
        // workspace_fsd_roadmap_tick  (Gap 2 — autonomous execution tick)
        // Advances the roadmap by one tick: picks the next milestone and task,
        // optionally executes the action, and persists progress.
        //
        // payload:
        //   execute?          — true to actually run the focused task action
        //   completed_task?   — manually mark a task as done before ticking
        //   milestone_id?     — override which milestone to tick
        // ====================================================================
        case 'workspace_fsd_roadmap_tick': {
            const ROADMAP_FILE = '.agentfarm/roadmap.json';
            const execute       = payload['execute'] === true;
            const completedTask = str(payload['completed_task']);
            const milestoneIdOverride = str(payload['milestone_id']);

            // Load roadmap
            let roadmap: ProjectRoadmap | null = null;
            const rmRead = await executeAction('workspace_read_file', { file_path: ROADMAP_FILE });
            if (rmRead.ok && rmRead.output) {
                try { roadmap = JSON.parse(rmRead.output) as ProjectRoadmap; } catch { /* ignore */ }
            }

            if (!roadmap) {
                return {
                    ok: false, output: '',
                    errorOutput: 'workspace_fsd_roadmap_tick: no roadmap found — run workspace_fsd_strategic_plan first',
                };
            }

            // Mark completed task if provided
            if (completedTask) {
                const targetId = milestoneIdOverride || (selectNextMilestone(roadmap)?.id ?? '');
                if (targetId) {
                    roadmap = updateMilestoneProgress(roadmap, targetId, completedTask);
                }
            }

            // Compute the tick
            const { updatedRoadmap, tick } = computeTickResult(roadmap);
            roadmap = updatedRoadmap;

            // Persist updated roadmap
            await executeAction('workspace_write_file', {
                file_path: ROADMAP_FILE,
                content:   JSON.stringify(roadmap, null, 2),
            });
            await saveProjectCtx({ ...(projectCtx ?? createEmptyProjectContext()), roadmap });

            // Optionally execute the focused task
            let executionResult: string | null = null;
            let replanResult: string | null = null;
            if (execute && tick.focusedTask) {
                const taskResult = await executeAction('workspace_dev_implement_feature', {
                    title:         tick.focusedTask,
                    description:   tick.focusedTask,
                    workspace_dir: workspaceDir,
                });
                executionResult = taskResult.ok
                    ? taskResult.output.slice(0, 300)
                    : `Failed: ${taskResult.errorOutput ?? ''}`;

                // Gap 6 (Long-horizon replanning): when a milestone task fails,
                // ask the LLM to suggest a smaller, more achievable alternative
                // instead of leaving the roadmap stuck on an impossible task.
                if (!taskResult.ok && callLlm && tick.activeMilestoneId) {
                    const currentMilestone = roadmap.milestones.find((m) => m.id === tick.activeMilestoneId);
                    const replanPrompt = [
                        `You are a technical project manager. A milestone task just failed.`,
                        `Project: ${roadmap.projectName}`,
                        `Goal: ${roadmap.goal}`,
                        `Milestone: ${currentMilestone?.title ?? tick.activeMilestoneId}`,
                        `Failed task: ${tick.focusedTask}`,
                        `Error: ${(taskResult.errorOutput ?? '').slice(0, 400)}`,
                        `Remaining tasks: ${currentMilestone?.tasks?.slice(0, 5).join(', ') ?? 'unknown'}`,
                        ``,
                        `Suggest a smaller, more achievable alternative task that makes progress toward the same milestone goal.`,
                        `The alternative must be simpler and more atomic than the failed task.`,
                        ``,
                        `Return JSON: { "alternative_task": string, "rationale": string }`,
                        `Valid JSON only.`,
                    ].join('\n');

                    try {
                        const replanRaw = await callLlm(
                            replanPrompt,
                            'You are a pragmatic technical project manager. Break tasks down to the smallest executable unit.',
                        );
                        const s = replanRaw.indexOf('{'); const e = replanRaw.lastIndexOf('}');
                        if (s !== -1 && e !== -1) {
                            const replanData = JSON.parse(replanRaw.slice(s, e + 1)) as Record<string, unknown>;
                            const altTask = typeof replanData['alternative_task'] === 'string'
                                ? (replanData['alternative_task'] as string).trim()
                                : '';
                            if (altTask) {
                                replanResult = altTask;
                                // Inject the alternative task into the milestone's task list
                                // (right after the failed task so it runs next tick)
                                const mIdx = roadmap.milestones.findIndex((m) => m.id === tick.activeMilestoneId);
                                if (mIdx !== -1) {
                                    const mile = roadmap.milestones[mIdx]!;
                                    const failedIdx = mile.tasks.indexOf(tick.focusedTask!);
                                    const newTasks = [...mile.tasks];
                                    const insertAt = failedIdx >= 0 ? failedIdx + 1 : newTasks.length;
                                    newTasks.splice(insertAt, 0, altTask);
                                    roadmap = {
                                        ...roadmap,
                                        milestones: roadmap.milestones.map((m, i) =>
                                            i === mIdx
                                                ? { ...m, tasks: newTasks, notes: `${m.notes}\nReplanned: "${tick.focusedTask}" → "${altTask}" (${new Date().toISOString().slice(0, 10)})` }
                                                : m
                                        ),
                                    };
                                    // Persist updated roadmap with replanned task
                                    await executeAction('workspace_write_file', {
                                        file_path: ROADMAP_FILE,
                                        content:   JSON.stringify(roadmap, null, 2),
                                    });
                                }
                            }
                        }
                    } catch { /* replan is best-effort — never block the tick */ }
                }
            }

            return safeJson({
                tick_number:        roadmap.tickCount,
                active_milestone:   tick.activeMilestoneId,
                focused_task:       tick.focusedTask,
                milestone_done:     tick.milestoneCompleted,
                narrative:          tick.narrative,
                execution_result:   executionResult,
                replan_result:      replanResult,
                roadmap_summary:    formatRoadmapSummary(roadmap),
                summary: replanResult
                    ? `${tick.narrative} | Replanned: "${replanResult.slice(0, 80)}"`
                    : tick.narrative,
            });
        }

        // ====================================================================
        // workspace_fsd_roadmap_status  (Gap 2 — roadmap inspection)
        // Returns the current roadmap state without advancing it.
        // ====================================================================
        case 'workspace_fsd_roadmap_status': {
            const ROADMAP_FILE = '.agentfarm/roadmap.json';

            let roadmap: ProjectRoadmap | null = null;
            const rmRead = await executeAction('workspace_read_file', { file_path: ROADMAP_FILE });
            if (rmRead.ok && rmRead.output) {
                try { roadmap = JSON.parse(rmRead.output) as ProjectRoadmap; } catch { /* ignore */ }
            }

            if (!roadmap) {
                return safeJson({
                    has_roadmap: false,
                    summary:     'No roadmap found — run workspace_fsd_strategic_plan to create one',
                });
            }

            const next = selectNextMilestone(roadmap);
            const nextTask = next ? selectNextTask(next) : null;
            const done   = roadmap.milestones.filter((m) => m.status === 'done').length;
            const total  = roadmap.milestones.length;

            return safeJson({
                has_roadmap:         true,
                project_name:        roadmap.projectName,
                goal:                roadmap.goal,
                milestone_count:     total,
                milestones_done:     done,
                tick_count:          roadmap.tickCount,
                last_tick_at:        roadmap.lastTickAt,
                next_milestone:      next ? { id: next.id, title: next.title, status: next.status } : null,
                next_task:           nextTask,
                milestones:          roadmap.milestones.map((m) => ({
                    id:           m.id,
                    title:        m.title,
                    status:       m.status,
                    tasks_done:   m.completedTasks.length,
                    tasks_total:  m.tasks.length,
                    target_date:  m.targetDate,
                })),
                roadmap_summary:     formatRoadmapSummary(roadmap),
                summary:             formatRoadmapSummary(roadmap),
            });
        }
    }
}

// ---------------------------------------------------------------------------
// Post-decision hooks
// ---------------------------------------------------------------------------

export async function onFsdImplementationApproved(params: {
    tenantId: string; botId?: string; workspaceId: string; taskId: string;
    implTitle: string; documentType: import('./fsd-rag-retriever.js').FsdDocumentType;
    content: string; sourceUrl?: string;
    gatewayBaseUrl: string; serviceToken: string;
}): Promise<void> {
    try {
        const { ingestApprovedImplementation } = await import('./fsd-rag-retriever.js');
        await ingestApprovedImplementation({ ...params });
    } catch { /* non-fatal */ }
}

export async function onFsdFeedbackReceived(params: {
    tenantId: string; workspaceId: string; taskId: string; prId: string;
    feedbackReasons: string[];
    gatewayBaseUrl: string; serviceToken: string;
}): Promise<void> {
    try {
        const { ingestFsdFeedback, GatewayFsdLessonStore } = await import('./fsd-lesson-pipeline.js');
        const store = new GatewayFsdLessonStore(params.gatewayBaseUrl, params.serviceToken);
        await ingestFsdFeedback(
            { tenantId: params.tenantId, workspaceId: params.workspaceId, taskId: params.taskId, prId: params.prId, documentType: 'any', actionType: 'feedback', correlationId: params.taskId },
            params.feedbackReasons.map((body) => ({ body })),
            store,
        );
    } catch { /* non-fatal */ }
}
