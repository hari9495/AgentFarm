// ============================================================================
// MOBILE ACTION HANDLER
// Handles all workspace_mob_* action types (iOS + Android).
// ============================================================================

import {
    buildSwiftUIComponentPrompt,
    parseSwiftOutput,
    buildiOSApiClientPrompt,
    buildSwiftTestPrompt,
    buildPushNotificationConfig,
} from './mobile-swift-builder.js';

import {
    buildComposeComponentPrompt,
    parseKotlinOutput,
    buildAndroidApiClientPrompt,
    buildKotlinTestPrompt,
    buildFCMConfig,
    buildAndroidDeepLinkConfig,
} from './mobile-kotlin-builder.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MobileActionType =
    // ── iOS ───────────────────────────────────────────────────────────────────
    | 'workspace_mob_ios_component'
    | 'workspace_mob_ios_build'
    | 'workspace_mob_ios_test'
    // ── Android ───────────────────────────────────────────────────────────────
    | 'workspace_mob_android_component'
    | 'workspace_mob_android_build'
    | 'workspace_mob_android_test'
    // ── Cross-platform ────────────────────────────────────────────────────────
    | 'workspace_mob_api_client'
    | 'workspace_mob_push_notify'
    | 'workspace_mob_deep_link'
    | 'workspace_mob_auth_implement'
    | 'workspace_mob_perf_profile'
    | 'workspace_mob_a11y_audit'
    | 'workspace_mob_store_upload'
    | 'workspace_mob_scaffold_project'
    | 'workspace_mob_standup_report';

export const MOBILE_ACTION_TYPES = new Set<MobileActionType>([
    'workspace_mob_ios_component',
    'workspace_mob_ios_build',
    'workspace_mob_ios_test',
    'workspace_mob_android_component',
    'workspace_mob_android_build',
    'workspace_mob_android_test',
    'workspace_mob_api_client',
    'workspace_mob_push_notify',
    'workspace_mob_deep_link',
    'workspace_mob_auth_implement',
    'workspace_mob_perf_profile',
    'workspace_mob_a11y_audit',
    'workspace_mob_store_upload',
    'workspace_mob_scaffold_project',
    'workspace_mob_standup_report',
]);

export function isMobileActionType(at: string): at is MobileActionType {
    return MOBILE_ACTION_TYPES.has(at as MobileActionType);
}

export type MobileActionResult = { ok: boolean; output: string; errorOutput?: string; [key: string]: unknown };

type SubResult       = { ok: boolean; output: string; errorOutput?: string };
type ExecuteActionFn = (actionType: string, payload: Record<string, unknown>) => Promise<SubResult>;
type RunCommandFn    = (args: string[], cwd: string, timeoutMs?: number) => Promise<{ stdout: string; stderr: string; exitCode: number }>;
type LlmCallFn       = (prompt: string, systemPrompt?: string) => Promise<string>;

export interface MobileActionParams {
    actionType:       MobileActionType;
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

function safeJson(obj: Record<string, unknown>): MobileActionResult {
    return { ok: true, output: JSON.stringify(obj) };
}
function str(v: unknown, fallback = ''): string { return typeof v === 'string' ? v.trim() : fallback; }
function num(v: unknown, fallback = 0):  number { return typeof v === 'number' ? v : fallback; }
async function callLlmSafe(fn: LlmCallFn | undefined, prompt: string, sys?: string): Promise<string> {
    if (!fn) return '';
    try { return await fn(prompt, sys); } catch { return ''; }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function handleMobileAction(params: MobileActionParams): Promise<MobileActionResult> {
    const { actionType, payload, workspaceDir, executeAction, runCommand,
            callLlm: rawCallLlm, gatewayBaseUrl, serviceToken, workspaceId, tenantId, botId } = params;

    // RAG pre-flight — wrap callLlm with platform guidelines and prior component context
    let callLlm = rawCallLlm;
    if (rawCallLlm && gatewayBaseUrl && serviceToken && workspaceId) {
        try {
            const { buildMobileRagContext } = await import('./mobile-rag-retriever.js');
            const ragCtx = await buildMobileRagContext(
                {
                    tenantId, botId,
                    componentTitle: String(payload['component_name'] ?? payload['title'] ?? actionType),
                    componentDescription: String(payload['description'] ?? ''),
                    documentType: 'ui_component',
                },
                gatewayBaseUrl, serviceToken, workspaceId,
            );
            if (ragCtx.contextBlock) {
                callLlm = (prompt: string, sys?: string): Promise<string> =>
                    rawCallLlm(prompt, sys ? `${sys}\n\n${ragCtx.contextBlock}` : ragCtx.contextBlock);
            }
        } catch { /* non-fatal */ }
    }

    switch (actionType) {

        // ====================================================================
        // workspace_mob_ios_component
        // payload: component_name (required), description?, has_state?, is_async?,
        //          props?, output_dir?
        // ====================================================================
        case 'workspace_mob_ios_component': {
            const componentName = str(payload['component_name'], 'MyView');
            const description   = str(payload['description']);
            const hasState      = payload['has_state'] === true;
            const isAsync       = payload['is_async']  === true;
            const props         = Array.isArray(payload['props'])
                ? payload['props'] as Array<{ name: string; type: string; optional?: boolean }>
                : [];
            const outputDir     = str(payload['output_dir'], 'Sources');
            const prompt        = buildSwiftUIComponentPrompt({ componentName, description, hasState, isAsync, props });
            const llmRaw        = await callLlmSafe(callLlm, prompt, 'You are a senior iOS engineer. Write clean, idiomatic SwiftUI.');
            const files         = parseSwiftOutput(llmRaw, componentName);
            const written: string[] = [];
            for (const f of files) {
                const dir = f.isTest ? `${outputDir}Tests` : outputDir;
                const fp  = `${dir}/${f.filename}`;
                await executeAction('workspace_write_file', { file_path: fp, content: f.content });
                written.push(fp);
            }
            return safeJson({
                component_name: componentName, platform: 'ios',
                files_written: written, file_count: written.length,
                has_preview: files.some((f) => f.isPreview),
                summary: `SwiftUI component ${componentName} written (${written.length} file(s)).`,
            });
        }

        // ====================================================================
        // workspace_mob_ios_build
        // payload: scheme (required), configuration?, destination?, derived_data_path?
        // ====================================================================
        case 'workspace_mob_ios_build': {
            if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };
            const scheme        = str(payload['scheme']);
            if (!scheme) return { ok: false, output: '', errorOutput: 'scheme is required' };
            const configuration = str(payload['configuration'], 'Debug');
            const destination   = str(payload['destination'], 'generic/platform=iOS Simulator');
            const derivedData   = str(payload['derived_data_path'], '.build/DerivedData');
            const args = [
                'xcodebuild', '-scheme', scheme,
                '-configuration', configuration,
                '-destination', destination,
                '-derivedDataPath', derivedData,
                'build',
            ];
            const result = await runCommand(args, workspaceDir, 300_000);
            const ok     = result.exitCode === 0;
            const warnings = (result.stdout.match(/warning:/gi) ?? []).length;
            const errors   = (result.stderr.match(/error:/gi)   ?? []).length;
            return safeJson({
                ok, scheme, configuration, exit_code: result.exitCode,
                warnings, errors,
                summary: ok
                    ? `iOS build succeeded: ${scheme} (${configuration}) — ${warnings} warning(s).`
                    : `iOS build failed: ${errors} error(s). Check xcodebuild output.`,
            });
        }

        // ====================================================================
        // workspace_mob_ios_test
        // payload: scheme (required), destination?, test_plan?
        // ====================================================================
        case 'workspace_mob_ios_test': {
            if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };
            const scheme      = str(payload['scheme']);
            if (!scheme) return { ok: false, output: '', errorOutput: 'scheme is required' };
            const destination = str(payload['destination'], 'platform=iOS Simulator,name=iPhone 15,OS=latest');
            const testPlan    = str(payload['test_plan']);
            const args = [
                'xcodebuild', 'test', '-scheme', scheme,
                '-destination', destination,
                ...(testPlan ? ['-testPlan', testPlan] : []),
                '-resultBundlePath', '.build/TestResults.xcresult',
            ];
            const result   = await runCommand(args, workspaceDir, 300_000);
            const ok       = result.exitCode === 0;
            const passed   = (result.stdout.match(/Test Case.*passed/g) ?? []).length;
            const failed   = (result.stdout.match(/Test Case.*failed/g) ?? []).length;
            return safeJson({
                ok, scheme, passed, failed, exit_code: result.exitCode,
                summary: ok
                    ? `iOS tests passed: ${passed} passed, ${failed} failed.`
                    : `iOS tests failed: ${failed} failure(s). Run locally for details.`,
            });
        }

        // ====================================================================
        // workspace_mob_android_component
        // payload: component_name (required), description?, has_state?, is_async?,
        //          props?, use_material3?, output_dir?
        // ====================================================================
        case 'workspace_mob_android_component': {
            const componentName = str(payload['component_name'], 'MyComposable');
            const description   = str(payload['description']);
            const hasState      = payload['has_state']      === true;
            const isAsync       = payload['is_async']       === true;
            const useMaterial3  = payload['use_material3']  !== false;
            const props         = Array.isArray(payload['props'])
                ? payload['props'] as Array<{ name: string; type: string; optional?: boolean }>
                : [];
            const outputDir     = str(payload['output_dir'], 'app/src/main/java');
            const prompt        = buildComposeComponentPrompt({ componentName, description, hasState, isAsync, props, useMaterial3 });
            const llmRaw        = await callLlmSafe(callLlm, prompt, 'You are a senior Android engineer. Write clean, idiomatic Kotlin and Jetpack Compose.');
            const files         = parseKotlinOutput(llmRaw, componentName);
            const written: string[] = [];
            for (const f of files) {
                const dir = f.isTest ? `${outputDir.replace('main', 'test')}` : outputDir;
                const fp  = `${dir}/${f.filename}`;
                await executeAction('workspace_write_file', { file_path: fp, content: f.content });
                written.push(fp);
            }
            return safeJson({
                component_name: componentName, platform: 'android',
                files_written: written, file_count: written.length,
                has_preview: files.some((f) => f.isPreview),
                summary: `Jetpack Compose component ${componentName} written (${written.length} file(s)).`,
            });
        }

        // ====================================================================
        // workspace_mob_android_build
        // payload: build_type? (debug|release), module?, gradle_task?
        // ====================================================================
        case 'workspace_mob_android_build': {
            if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };
            const buildType   = str(payload['build_type'], 'debug');
            const module      = str(payload['module'],      'app');
            const gradleTask  = str(payload['gradle_task']) || `${module}:assemble${buildType.charAt(0).toUpperCase() + buildType.slice(1)}`;
            const gradleCmd   = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
            const result      = await runCommand([gradleCmd, gradleTask, '--no-daemon'], workspaceDir, 300_000);
            const ok          = result.exitCode === 0;
            const warnings    = (result.stdout.match(/warning:/gi) ?? []).length;
            return safeJson({
                ok, build_type: buildType, module, gradle_task: gradleTask,
                exit_code: result.exitCode, warnings,
                summary: ok
                    ? `Android build succeeded: ${gradleTask} — ${warnings} warning(s).`
                    : `Android build failed. Check Gradle output.`,
            });
        }

        // ====================================================================
        // workspace_mob_android_test
        // payload: module?, test_type? (unit|instrumentation)
        // ====================================================================
        case 'workspace_mob_android_test': {
            if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };
            const module      = str(payload['module'],     'app');
            const testType    = str(payload['test_type'],  'unit');
            const gradleTask  = testType === 'unit' ? `${module}:test` : `${module}:connectedAndroidTest`;
            const gradleCmd   = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
            const result      = await runCommand([gradleCmd, gradleTask, '--no-daemon'], workspaceDir, 300_000);
            const ok          = result.exitCode === 0;
            const passed      = (result.stdout.match(/tests were successful/gi) ?? []).length;
            const failed      = (result.stdout.match(/\d+ tests? FAILED/gi)    ?? []).length;
            return safeJson({
                ok, module, test_type: testType, exit_code: result.exitCode,
                passed, failed,
                summary: ok
                    ? `Android ${testType} tests passed.`
                    : `Android ${testType} tests failed: ${failed} failure(s).`,
            });
        }

        // ====================================================================
        // workspace_mob_api_client
        // payload: platform (ios|android|both), base_url, endpoints[], auth_type?,
        //          module_name?, output_dir?
        // ====================================================================
        case 'workspace_mob_api_client': {
            const platform   = str(payload['platform'], 'both');
            const baseUrl    = str(payload['base_url']);
            const authType   = str(payload['auth_type']) as 'bearer' | 'api_key' | 'none';
            const moduleName = str(payload['module_name'], 'ApiClient');
            const outputDir  = str(payload['output_dir'], 'src');
            const endpoints  = Array.isArray(payload['endpoints']) ? payload['endpoints'] as Array<Record<string, unknown>> : [];
            const written: string[] = [];

            if ((platform === 'ios' || platform === 'both') && callLlm) {
                const iosEndpoints = endpoints.map((e) => ({
                    method: str(e['method'], 'GET') as 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
                    path: str(e['path']), responseType: str(e['response_type'], 'Decodable'),
                    requestType: str(e['request_type']) || undefined,
                }));
                const prompt = buildiOSApiClientPrompt({ baseUrl, endpoints: iosEndpoints, authType: authType || 'bearer', moduleName });
                const raw    = await callLlmSafe(callLlm, prompt, 'You are a senior iOS engineer.');
                const files  = parseSwiftOutput(raw, moduleName);
                for (const f of files) {
                    const fp = `${outputDir}/ios/${f.filename}`;
                    await executeAction('workspace_write_file', { file_path: fp, content: f.content });
                    written.push(fp);
                }
            }

            if ((platform === 'android' || platform === 'both') && callLlm) {
                const androidEndpoints = endpoints.map((e) => ({
                    method: str(e['method'], 'GET') as 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
                    path: str(e['path']), responseType: str(e['response_type'], 'Any'),
                    requestType: str(e['request_type']) || undefined,
                }));
                const prompt = buildAndroidApiClientPrompt({ baseUrl, endpoints: androidEndpoints, authType: authType || 'bearer', moduleName });
                const raw    = await callLlmSafe(callLlm, prompt, 'You are a senior Android engineer.');
                const files  = parseKotlinOutput(raw, moduleName);
                for (const f of files) {
                    const fp = `${outputDir}/android/${f.filename}`;
                    await executeAction('workspace_write_file', { file_path: fp, content: f.content });
                    written.push(fp);
                }
            }

            return safeJson({
                platform, base_url: baseUrl, module_name: moduleName,
                files_written: written, file_count: written.length,
                summary: `Mobile API client generated for ${platform} (${written.length} file(s)).`,
            });
        }

        // ====================================================================
        // workspace_mob_push_notify
        // payload: platform (ios|android|both), app_id, environment? (ios only)
        // ====================================================================
        case 'workspace_mob_push_notify': {
            const platform    = str(payload['platform'], 'both');
            const appId       = str(payload['app_id'], 'com.example.app');
            const environment = str(payload['environment'], 'sandbox') as 'sandbox' | 'production';
            const written: string[] = [];

            if (platform === 'ios' || platform === 'both') {
                const { appDelegateSnippet, entitlementsPlist } = buildPushNotificationConfig(appId, environment);
                await executeAction('workspace_write_file', { file_path: 'ios/PushNotificationService.swift', content: appDelegateSnippet });
                await executeAction('workspace_write_file', { file_path: 'ios/PushNotifications.entitlements', content: entitlementsPlist });
                written.push('ios/PushNotificationService.swift', 'ios/PushNotifications.entitlements');
            }

            if (platform === 'android' || platform === 'both') {
                const { serviceSnippet, manifestSnippet } = buildFCMConfig(appId);
                await executeAction('workspace_write_file', { file_path: 'android/PushNotificationService.kt', content: serviceSnippet });
                await executeAction('workspace_write_file', { file_path: 'android/push_manifest_snippet.xml', content: manifestSnippet });
                written.push('android/PushNotificationService.kt', 'android/push_manifest_snippet.xml');
            }

            return safeJson({
                platform, app_id: appId,
                files_written: written,
                summary: `Push notification config generated for ${platform} (${appId}).`,
            });
        }

        // ====================================================================
        // workspace_mob_deep_link
        // payload: platform (ios|android|both), scheme, host, paths[]
        // ====================================================================
        case 'workspace_mob_deep_link': {
            const platform = str(payload['platform'], 'both');
            const scheme   = str(payload['scheme'], 'myapp');
            const host     = str(payload['host'],   'app');
            const paths    = Array.isArray(payload['paths']) ? payload['paths'] as string[] : ['/'];
            const written: string[] = [];

            if (platform === 'android' || platform === 'both') {
                const { manifestSnippet, navGraphSnippet } = buildAndroidDeepLinkConfig(scheme, host, paths);
                await executeAction('workspace_write_file', { file_path: 'android/deep_link_manifest.xml', content: manifestSnippet });
                await executeAction('workspace_write_file', { file_path: 'android/deep_link_nav.xml',      content: navGraphSnippet });
                written.push('android/deep_link_manifest.xml', 'android/deep_link_nav.xml');
            }

            if ((platform === 'ios' || platform === 'both') && callLlm) {
                const prompt  = `Generate iOS Universal Links / URL scheme configuration for: scheme=${scheme}, host=${host}, paths=${paths.join(', ')}. Return the apple-app-site-association JSON and the Info.plist URL types XML. Format: two code blocks.`;
                const raw     = await callLlmSafe(callLlm, prompt, 'You are a senior iOS engineer.');
                await executeAction('workspace_write_file', { file_path: 'ios/deep_link_config.txt', content: raw });
                written.push('ios/deep_link_config.txt');
            }

            return safeJson({
                platform, scheme, host, paths,
                files_written: written,
                summary: `Deep link config generated for ${platform}: ${scheme}://${host}{${paths.join(',')}}`,
            });
        }

        // ====================================================================
        // workspace_mob_auth_implement
        // payload: platform (ios|android|both), strategy (biometric|oauth2|jwt|api_key),
        //          provider? (google|apple|github), output_dir?
        // ====================================================================
        case 'workspace_mob_auth_implement': {
            const platform  = str(payload['platform'], 'both');
            const strategy  = str(payload['strategy'], 'jwt');
            const provider  = str(payload['provider']);
            const outputDir = str(payload['output_dir'], 'src/auth');
            const written: string[] = [];

            if (callLlm) {
                const iOSPrompt = `Generate a Swift auth implementation for ${strategy}${provider ? ` with ${provider}` : ''}. Include keychain storage for tokens, sign-in/sign-out methods, and token refresh. Return JSON array of {filename, content, isTest, isPreview}.`;
                const androidPrompt = `Generate a Kotlin auth implementation for ${strategy}${provider ? ` with ${provider}` : ''}. Include EncryptedSharedPreferences for tokens, auth interceptor, and token refresh coroutine. Return JSON array of {filename, content, isTest, isPreview}.`;

                if (platform === 'ios' || platform === 'both') {
                    const raw   = await callLlmSafe(callLlm, iOSPrompt, 'You are a senior iOS security engineer.');
                    const files = parseSwiftOutput(raw, 'AuthManager');
                    for (const f of files) {
                        const fp = `${outputDir}/ios/${f.filename}`;
                        await executeAction('workspace_write_file', { file_path: fp, content: f.content });
                        written.push(fp);
                    }
                }
                if (platform === 'android' || platform === 'both') {
                    const raw   = await callLlmSafe(callLlm, androidPrompt, 'You are a senior Android security engineer.');
                    const files = parseKotlinOutput(raw, 'AuthManager');
                    for (const f of files) {
                        const fp = `${outputDir}/android/${f.filename}`;
                        await executeAction('workspace_write_file', { file_path: fp, content: f.content });
                        written.push(fp);
                    }
                }
            }

            return safeJson({
                platform, strategy, provider: provider || null,
                files_written: written,
                summary: `${strategy} auth implemented for ${platform} (${written.length} file(s)).`,
            });
        }

        // ====================================================================
        // workspace_mob_perf_profile
        // payload: platform (ios|android), build_type?, instruments_template? (ios)
        //          profiler? (android: cpu|memory|network)
        // ====================================================================
        case 'workspace_mob_perf_profile': {
            if (!runCommand) return { ok: false, output: '', errorOutput: 'runCommand not available' };
            const platform = str(payload['platform'], 'android');

            if (platform === 'ios') {
                const scheme   = str(payload['scheme'], 'App');
                const template = str(payload['instruments_template'], 'Time Profiler');
                const result   = await runCommand(
                    ['instruments', '-t', template, '-D', '.build/profile.trace', '-l', '10000'],
                    workspaceDir, 60_000,
                );
                return safeJson({
                    platform: 'ios', ok: result.exitCode === 0,
                    template, scheme,
                    summary: result.exitCode === 0
                        ? `iOS profiling complete: ${template}. Trace saved to .build/profile.trace`
                        : `iOS profiling failed — Instruments may require Xcode.`,
                });
            }

            // Android — run a profiling Gradle task
            const profilerType = str(payload['profiler'], 'cpu');
            const gradleCmd    = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
            const result       = await runCommand(
                [gradleCmd, 'app:profileDebug', '--no-daemon'],
                workspaceDir, 120_000,
            );
            return safeJson({
                platform: 'android', profiler: profilerType, ok: result.exitCode === 0,
                output: result.stdout.slice(-1000),
                summary: result.exitCode === 0
                    ? `Android ${profilerType} profiling complete.`
                    : `Android profiling failed. Ensure AGP profiling is configured.`,
            });
        }

        // ====================================================================
        // workspace_mob_a11y_audit
        // payload: platform (ios|android|both), source_dir?
        // ====================================================================
        case 'workspace_mob_a11y_audit': {
            const platform  = str(payload['platform'], 'both');
            const sourceDir = str(payload['source_dir'], 'src');
            const issues: string[] = [];

            if (callLlm) {
                const readResult = await executeAction('workspace_list_files', { path: sourceDir, pattern: '*.swift,*.kt' });
                const prompt = [
                    `You are a mobile accessibility expert auditing ${platform} code for WCAG 2.1 and platform-specific accessibility issues.`,
                    ``,
                    `Source directory: ${sourceDir}`,
                    `Files found: ${readResult.output.slice(0, 500)}`,
                    ``,
                    `Check for:`,
                    `  iOS: missing accessibilityLabel, accessibilityHint, accessibilityTraits`,
                    `  Android: missing contentDescription, missing semantics, touch target < 48dp`,
                    `  Both: colour contrast < 4.5:1, missing focus order, dynamic text not supported`,
                    ``,
                    `Return a JSON array of { severity, file, description, fix } objects.`,
                ].join('\n');
                const raw  = await callLlmSafe(callLlm, prompt, 'You are a mobile accessibility engineer.');
                try {
                    const start = raw.indexOf('['); const end = raw.lastIndexOf(']');
                    if (start !== -1 && end !== -1) {
                        const found = JSON.parse(raw.slice(start, end + 1)) as Array<{ description?: string }>;
                        issues.push(...found.map((i) => i.description ?? '').filter(Boolean));
                    }
                } catch { /* non-JSON response */ }
            }

            return safeJson({
                platform, issue_count: issues.length,
                issues: issues.slice(0, 20),
                summary: issues.length === 0
                    ? `Accessibility audit: no issues detected for ${platform}.`
                    : `Accessibility audit: ${issues.length} issue(s) found for ${platform}.`,
            });
        }

        // ====================================================================
        // workspace_mob_store_upload  [HIGH RISK]
        // payload: platform (ios|android), artifact_path (required),
        //          bundle_id? (ios) | package_name? (android), track? (android)
        // ====================================================================
        case 'workspace_mob_store_upload': {
            const platform    = str(payload['platform']);
            const artifactPath = str(payload['artifact_path']);
            if (!artifactPath) return { ok: false, output: '', errorOutput: 'artifact_path is required' };
            if (!platform) return { ok: false, output: '', errorOutput: 'platform (ios|android) is required' };

            // Delegate to connector (App Store Connect / Google Play)
            const connType  = platform === 'ios' ? 'app_store_connect' : 'google_play';
            const connResult = await executeAction('workspace_connector_test', {
                connector: connType, action: 'upload_artifact',
                artifact_path: artifactPath,
                track: str(payload['track'], 'internal'),
                bundle_id: str(payload['bundle_id']),
                package_name: str(payload['package_name']),
            });
            return safeJson({
                ok: connResult.ok, platform, artifact_path: artifactPath,
                summary: connResult.ok
                    ? `${platform === 'ios' ? 'App Store Connect' : 'Google Play'} upload submitted: ${artifactPath}`
                    : `Store upload failed: ${connResult.errorOutput ?? 'check connector credentials'}`,
            });
        }

        // ====================================================================
        // workspace_mob_scaffold_project
        // payload: project_name (required), platform (ios|android|both),
        //          bundle_id? (ios), package_name? (android), min_ios?, min_sdk?
        // ====================================================================
        case 'workspace_mob_scaffold_project': {
            const projectName = str(payload['project_name'], 'MyApp');
            const platform    = str(payload['platform'], 'both');
            const bundleId    = str(payload['bundle_id'],    `com.example.${projectName.toLowerCase()}`);
            const packageName = str(payload['package_name'], `com.example.${projectName.toLowerCase()}`);
            const written: string[] = [];

            if (callLlm) {
                const prompt = [
                    `Generate a project scaffold for a ${platform} mobile app named "${projectName}".`,
                    platform !== 'android' ? `iOS: bundle_id=${bundleId}, SwiftUI, Swift Package Manager` : '',
                    platform !== 'ios'     ? `Android: package_name=${packageName}, Jetpack Compose, Gradle Kotlin DSL` : '',
                    `Include: folder structure, basic App entry point, theme/styling setup, README.md`,
                    `Return JSON array of {filename, content} objects.`,
                ].filter(Boolean).join('\n');
                const raw  = await callLlmSafe(callLlm, prompt, 'You are a senior mobile architect.');
                const cleanRaw = raw.replace(/^```[a-z]*\n?/im, '').replace(/```\s*$/im, '').trim();
                const s = cleanRaw.indexOf('['); const e = cleanRaw.lastIndexOf(']');
                if (s !== -1 && e !== -1) {
                    try {
                        const files = JSON.parse(cleanRaw.slice(s, e + 1)) as Array<{ filename?: unknown; content?: unknown }>;
                        for (const f of files) {
                            if (typeof f.filename !== 'string' || typeof f.content !== 'string') continue;
                            const fp = `${projectName}/${f.filename}`;
                            await executeAction('workspace_write_file', { file_path: fp, content: f.content });
                            written.push(fp);
                        }
                    } catch { /* JSON parse failed */ }
                }
            }

            return safeJson({
                project_name: projectName, platform,
                bundle_id: bundleId, package_name: packageName,
                files_written: written, file_count: written.length,
                summary: `${platform} project "${projectName}" scaffolded (${written.length} file(s)).`,
            });
        }

        // ====================================================================
        // workspace_mob_standup_report
        // payload: bot_name?, team_name?, platform?, completed?, in_progress?,
        //          blockers?, crash_rate?, store_ratings?
        // ====================================================================
        case 'workspace_mob_standup_report': {
            const botName    = str(payload['bot_name'],  'Mobile Agent');
            const teamName   = str(payload['team_name'], 'Mobile Team');
            const platform   = str(payload['platform'],  'iOS + Android');
            const completed  = Array.isArray(payload['completed'])    ? payload['completed']    as string[] : [];
            const inProgress = Array.isArray(payload['in_progress'])  ? payload['in_progress']  as string[] : [];
            const blockers   = Array.isArray(payload['blockers'])      ? payload['blockers']     as string[] : [];
            const crashRate  = typeof payload['crash_rate']    === 'number' ? payload['crash_rate']    : null;
            const ratings    = typeof payload['store_ratings'] === 'object' ? payload['store_ratings'] as Record<string, number> : null;

            const prompt = [
                `Generate a professional mobile developer standup for ${botName} (${platform}).`,
                completed.length   > 0  ? `Completed: ${completed.join(', ')}` : '',
                inProgress.length  > 0  ? `In Progress: ${inProgress.join(', ')}` : '',
                blockers.length    > 0  ? `Blockers: ${blockers.join(', ')}` : 'No blockers.',
                crashRate !== null       ? `Crash-free rate: ${crashRate}%` : '',
                ratings               ? `Store ratings: ${JSON.stringify(ratings)}` : '',
                `Format: Yesterday | Today | Blockers | App health`,
            ].filter(Boolean).join('\n');

            const spokenText = await callLlmSafe(callLlm, prompt, 'You are a mobile developer agent. Be concise and metric-driven.');
            return safeJson({
                bot_name: botName, team_name: teamName, platform,
                completed, in_progress: inProgress, blockers,
                crash_rate: crashRate, store_ratings: ratings,
                spoken_text: spokenText || `${botName} standup: ${completed.length} completed, ${inProgress.length} in progress.`,
                summary: `Mobile standup generated for ${teamName} (${platform}).`,
            });
        }
    }
}

// ---------------------------------------------------------------------------
// Post-decision hooks
// ---------------------------------------------------------------------------

export async function onMobileComponentApproved(params: {
    tenantId: string; botId?: string; workspaceId: string; taskId: string;
    componentTitle: string; documentType: import('./mobile-rag-retriever.js').MobileDocumentType;
    content: string; sourceUrl?: string;
    gatewayBaseUrl: string; serviceToken: string;
}): Promise<void> {
    try {
        const { ingestApprovedMobileComponent } = await import('./mobile-rag-retriever.js');
        await ingestApprovedMobileComponent({ ...params });
    } catch { /* non-fatal */ }
}

export async function onMobileFeedbackReceived(params: {
    tenantId: string; workspaceId: string; taskId: string;
    feedbackReasons: string[];
    gatewayBaseUrl: string; serviceToken: string;
}): Promise<void> {
    try {
        const { ingestMobileFeedback, GatewayMobileLessonStore } = await import('./mobile-lesson-pipeline.js');
        const store = new GatewayMobileLessonStore(params.gatewayBaseUrl, params.serviceToken);
        await ingestMobileFeedback(
            { tenantId: params.tenantId, workspaceId: params.workspaceId, taskId: params.taskId, documentType: 'any', actionType: 'feedback', correlationId: params.taskId },
            params.feedbackReasons.map((body) => ({ body })),
            store,
        );
    } catch { /* non-fatal */ }
}
