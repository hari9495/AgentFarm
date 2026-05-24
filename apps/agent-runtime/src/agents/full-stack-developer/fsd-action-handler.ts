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
    | 'workspace_fsd_standup_report';

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
    actionType:    FsdActionType;
    tenantId:      string;
    botId:         string;
    taskId:        string;
    payload:       Record<string, unknown>;
    workspaceDir:  string;
    executeAction: ExecuteActionFn;
    runCommand?:   RunCommandFn;
    callLlm?:      LlmCallFn;
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
    const { actionType, payload, workspaceDir, executeAction, runCommand, callLlm } = params;

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
            const framework     = isUiFramework(payload['framework']) ? payload['framework'] : 'react';
            const styling       = isStylingMethod(payload['styling']) ? payload['styling'] : 'tailwind';
            const outputPath    = str(payload['output_path']);

            const spec: ComponentSpec = {
                name:        componentName,
                description,
                framework,
                styling,
                props:    Array.isArray(payload['props']) ? (payload['props'] as ComponentSpec['props']) : [],
                hasState: payload['has_state'] === true,
                isAsync:  payload['is_async']  === true,
            };

            const scaffold = generateComponentScaffold(spec);

            // Write component file
            const fileName = outputPath || `src/components/${scaffold.filename}`;
            await executeAction('workspace_write_file', {
                file_path: fileName,
                content:   scaffold.code,
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
                file_path:  fileName,
                test_path:  testFileName,
                has_styles: !!scaffold.styleFilename,
                summary: `Generated ${framework} component "${componentName}" with ${styling} styling`,
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

            const spec: ComponentSpec = {
                name:        componentName,
                description: `Component generated from design handoff with ${tokens.length} design tokens`,
                framework,
                styling:     'css-modules',
                props:       [],
                hasState:    false,
                isAsync:     false,
            };
            const scaffold = generateComponentScaffold(spec);

            await executeAction('workspace_write_file', {
                file_path: `${outputDir}/${scaffold.filename}`,
                content:   scaffold.code,
            });

            return safeJson({
                component_name:   componentName,
                framework,
                tokens_extracted: tokens.length,
                tokens_file:      `${outputDir}/tokens.css`,
                component_file:   `${outputDir}/${scaffold.filename}`,
                summary: `Design handoff complete: ${tokens.length} tokens → ${componentName}`,
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
            const axeJson   = str(payload['axe_json']);
            let htmlContent = str(payload['html_content']);
            const filePath  = str(payload['file_path']);
            const targetUrl = str(payload['target_url']);

            if (!htmlContent && !axeJson) {
                if (filePath) {
                    const r = await executeAction('workspace_read_file', { file_path: filePath });
                    htmlContent = r.ok ? r.output : '';
                } else if (targetUrl) {
                    const r = await executeAction('workspace_web_read_page', { url: targetUrl });
                    htmlContent = r.ok ? r.output : '';
                }
            }

            const report = buildA11yReport({ axeJson: axeJson || undefined, htmlContent: htmlContent || undefined });

            return safeJson({
                score:           report.score,
                violations:      report.violations,
                violation_count: report.violations.length,
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
            const bundleSizeKb = typeof payload['bundle_size_kb'] === 'number' ? payload['bundle_size_kb'] : null;

            const healthReport = buildFrontendHealthReport({
                lcp:          lcpMs,
                cls:          clsVal,
                fid:          fidMs,
                a11yScore,
                seoScore,
                bundleSizeKb,
            });

            const budget: PerformanceBudget = {
                maxBundleKb: typeof payload['max_bundle_kb'] === 'number' ? payload['max_bundle_kb'] : 500,
                maxLcpMs:    typeof payload['max_lcp_ms']    === 'number' ? payload['max_lcp_ms']    : 2500,
                maxFidMs:    typeof payload['max_fid_ms']    === 'number' ? payload['max_fid_ms']    : 100,
                maxCls:      typeof payload['max_cls']       === 'number' ? payload['max_cls']       : 0.1,
            };

            type BundleFileEntry = { name: string; sizeKb: number };
            const bundleDataRaw  = payload['bundle_data'] as { files?: BundleFileEntry[] } | undefined;
            const bundleFiles    = bundleDataRaw?.files ?? [];

            const perfReport = buildPerformanceReport({ files: bundleFiles }, budget);
            const regressionCount = healthReport.openIssues.length + perfReport.issues.length;

            return safeJson({
                health_report:    healthReport,
                perf_report:      perfReport,
                regression_count: regressionCount,
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

            const clientPath = `${outputDir}/${scaffold.clientFilename}`;
            await executeAction('workspace_write_file', {
                file_path: clientPath,
                content:   scaffold.clientCode,
            });

            const typesPath = `${outputDir}/${scaffold.typesFilename}`;
            await executeAction('workspace_write_file', {
                file_path: typesPath,
                content:   scaffold.typesCode,
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
                summary: `API client generated (${httpClient}): ${endpoints.length} endpoint(s)`,
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
                    description: `Frontend component for: ${title}`,
                    framework,
                    styling:     'tailwind',
                    props:       [],
                    hasState:    true,
                    isAsync:     true,
                };
                const scaffold = generateComponentScaffold(spec);
                await executeAction('workspace_write_file', {
                    file_path: `src/components/${scaffold.filename}`,
                    content:   scaffold.code,
                });
                steps.push(`Frontend component: generated`);

                // Step 4: API integration
                const endpoints: ApiEndpoint[] = [
                    { method: 'GET',  path: `/api/${componentName.toLowerCase()}`, auth: true,  requestBody: undefined,                           responseType: `${componentName}Response` },
                    { method: 'POST', path: `/api/${componentName.toLowerCase()}`, auth: true,  requestBody: `Create${componentName}Request`,      responseType: `${componentName}Response` },
                ];
                const apiScaffold = generateApiClientCode(
                    endpoints,
                    { baseUrl: '/api', httpClient, framework, moduleName: componentName.toLowerCase() },
                );
                await executeAction('workspace_write_file', {
                    file_path: `src/api/${apiScaffold.clientFilename}`,
                    content:   apiScaffold.clientCode,
                });
                steps.push(`API integration: generated`);
            }

            // Step 5: Tests
            if (shouldRunTests && !dryRun) {
                const testResult = await executeAction('run_tests', { workspace_dir: workspaceDir });
                steps.push(`Tests: ${testResult.ok ? 'passed' : 'failed'}`);
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

            return safeJson({
                summary,
                ceremony_context: ceremonyCtx,
                frontend_health:  frontendHealth,
                spoken_text:      llmEnhancement || summary.spokenText,
            });
        }
    }
}
