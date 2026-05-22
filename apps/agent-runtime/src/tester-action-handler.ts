/**
 * Tester Action Handler
 *
 * Bridges the LocalWorkspaceActionType dispatch switch in
 * local-workspace-executor.ts to the tester domain modules:
 *   - tester-standup-builder   (standup summary, meeting context)
 *   - connector integration    (test case sync, test run publish, bug filing)
 *   - security reporting       (aggregate .agentfarm cache)
 *
 * Design rules:
 *   - Follows the same pattern as corporate-assistant-action-handler.ts.
 *   - Pure domain functions (standup builder) are called directly.
 *   - Connector operations fall back to local .agentfarm/ storage when no client provided.
 *   - workspaceDir is optional — defaults to '' for pure-computation cases.
 *   - For workspace_standup_report's meeting-join/speak steps, pass executeAction callback;
 *     without it, the handler returns the summary text (dry-run equivalent).
 */

import { join } from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import type { LocalWorkspaceResult, LocalWorkspaceConnectorClient } from './local-workspace-executor.js';
import {
    applyDisclosureToConnectorPayload,
} from './outbound-disclosure.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TesterActionType =
    | 'workspace_standup_report'
    | 'workspace_test_case_sync'
    | 'workspace_test_run_publish'
    | 'workspace_create_bug'
    | 'workspace_security_test_report';

export function isTesterActionType(t: string): t is TesterActionType {
    return (
        t === 'workspace_standup_report' ||
        t === 'workspace_test_case_sync' ||
        t === 'workspace_test_run_publish' ||
        t === 'workspace_create_bug' ||
        t === 'workspace_security_test_report'
    );
}

type ExecuteActionCallback = (
    actionType: string,
    payload: Record<string, unknown>,
) => Promise<LocalWorkspaceResult>;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

type ExtractedPersona = { displayName: string; emailAddress: string; disclosureStatement: string };

function extractPersonaFromPayload(payload: Record<string, unknown>): ExtractedPersona | null {
    const raw = payload['_persona'];
    if (!raw || typeof raw !== 'object') return null;
    const p = raw as Record<string, unknown>;
    const displayName = typeof p['displayName'] === 'string' && p['displayName'].trim() ? p['displayName'].trim() : '';
    const emailAddress = typeof p['emailAddress'] === 'string' && p['emailAddress'].trim() ? p['emailAddress'].trim() : '';
    const disclosureStatement = typeof p['disclosureStatement'] === 'string' && p['disclosureStatement'].trim()
        ? p['disclosureStatement'].trim()
        : 'This message was sent by an AI agent.';
    if (!displayName || !emailAddress) return null;
    return { displayName, emailAddress, disclosureStatement };
}

// ---------------------------------------------------------------------------
// Main dispatcher
// ---------------------------------------------------------------------------

export async function handleTesterAction(params: {
    actionType: TesterActionType;
    tenantId: string;
    botId: string;
    taskId: string;
    payload: Record<string, unknown>;
    workspaceDir?: string;
    connectorActionExecuteClient?: LocalWorkspaceConnectorClient;
    /** Optional callback to execute generic workspace actions (e.g. meeting_join, meeting_speak).
     *  Required for workspace_standup_report non-dry-run path. */
    executeAction?: ExecuteActionCallback;
}): Promise<LocalWorkspaceResult> {
    const {
        actionType,
        tenantId: _tenantId,
        botId: _botId,
        taskId: _taskId,
        payload,
        workspaceDir = '',
        connectorActionExecuteClient,
        executeAction,
    } = params;

    void _tenantId; void _botId; void _taskId; // available for future per-action audit use

    switch (actionType) {

        // ------------------------------------------------------------------
        // workspace_standup_report
        // Generate a structured standup summary from episodic memory and
        // optionally join + speak at a meeting.
        // payload: { recent_memory?, bot_name?, team_name?, meeting_type?,
        //            meeting_url?, dry_run? }
        // ------------------------------------------------------------------
        case 'workspace_standup_report': {
            const { buildStandupSummary, buildMeetingContext } = await import('./tester-standup-builder.js');
            const dryRun = payload['dry_run'] === true;
            const botName = typeof payload['bot_name'] === 'string' && payload['bot_name'].trim()
                ? payload['bot_name'].trim()
                : 'AI Tester';
            const teamName = typeof payload['team_name'] === 'string' && payload['team_name'].trim()
                ? payload['team_name'].trim()
                : 'the team';
            const meetingType = (['standup', 'scrum_planning', 'sprint_review', 'retrospective'] as const)
                .includes(payload['meeting_type'] as never)
                ? (payload['meeting_type'] as 'standup' | 'scrum_planning' | 'sprint_review' | 'retrospective')
                : 'standup';
            const rawMemory = Array.isArray(payload['recent_memory'])
                ? (payload['recent_memory'] as unknown[]).filter((x) => typeof x === 'string') as string[]
                : [];

            const summary = buildStandupSummary(rawMemory, { botName, teamName });
            const context = buildMeetingContext(meetingType, { botName, teamName, standupSummary: summary });

            if (dryRun || !executeAction) {
                return {
                    ok: true,
                    output: JSON.stringify({ dry_run: true, summary, context }, null, 2),
                };
            }

            // Join meeting first if a URL was provided, then speak.
            const meetingUrlRaw = typeof payload['meeting_url'] === 'string' ? payload['meeting_url'].trim() : '';
            if (meetingUrlRaw) {
                const joinResult = await executeAction('workspace_meeting_join', {
                    meeting_url: meetingUrlRaw,
                    mode: 'browser',
                });
                if (!joinResult.ok) {
                    return { ok: false, output: '', errorOutput: `Failed to join meeting: ${joinResult.errorOutput}` };
                }
                await new Promise<void>((resolve) => setTimeout(resolve, 4000));
            }

            const speakResult = await executeAction('workspace_meeting_speak', {
                mode: 'statement',
                script: [context.openingStatement, context.closingStatement],
                pace_seconds: 3,
            });
            return {
                ok: speakResult.ok,
                output: JSON.stringify({ summary, spoken: speakResult.ok }, null, 2),
                errorOutput: speakResult.errorOutput,
            };
        }

        // ------------------------------------------------------------------
        // workspace_test_case_sync
        // Sync test cases to TestRail / Zephyr via connector, with local
        // .agentfarm/test-registry.json fallback when connector unavailable.
        // payload: { provider?, test_cases? }
        // ------------------------------------------------------------------
        case 'workspace_test_case_sync': {
            const provider = typeof payload['provider'] === 'string' ? payload['provider'] : 'testrail';
            if (!connectorActionExecuteClient) {
                const registryPath = join(workspaceDir, '.agentfarm', 'test-registry.json');
                await mkdir(join(workspaceDir, '.agentfarm'), { recursive: true }).catch(() => undefined);
                let registry: { provider: string; test_cases: unknown[]; runs: unknown[]; last_updated: string } = {
                    provider: 'local',
                    test_cases: [],
                    runs: [],
                    last_updated: new Date().toISOString(),
                };
                try {
                    registry = JSON.parse(await readFile(registryPath, 'utf-8'));
                } catch {
                    // no existing registry — use defaults
                }
                const incomingCases = Array.isArray(payload['test_cases']) ? payload['test_cases'] : [];
                const existingIds = new Set((registry.test_cases as { id?: unknown }[]).map((tc) => tc.id));
                for (const tc of incomingCases) {
                    const tcObj = typeof tc === 'object' && tc !== null ? tc as { id?: unknown } : { id: undefined };
                    if (tcObj.id && existingIds.has(tcObj.id)) {
                        const idx = (registry.test_cases as { id?: unknown }[]).findIndex((t) => t.id === tcObj.id);
                        if (idx !== -1) registry.test_cases[idx] = tc;
                    } else {
                        registry.test_cases.push(tc);
                        if (tcObj.id) existingIds.add(tcObj.id);
                    }
                }
                registry.last_updated = new Date().toISOString();
                await writeFile(registryPath, JSON.stringify(registry, null, 2), 'utf-8');
                return {
                    ok: true,
                    output: JSON.stringify({
                        provider: 'local',
                        file: '.agentfarm/test-registry.json',
                        synced_count: incomingCases.length,
                        total_cases: registry.test_cases.length,
                        note: `No ${provider} connector configured — test cases saved locally. Configure connector credentials to sync to ${provider}.`,
                    }, null, 2),
                    errorOutput: '',
                };
            }
            try {
                const result = await connectorActionExecuteClient({
                    connectorType: provider,
                    actionType: 'sync_test_cases',
                    payload,
                });
                return { ok: true, output: JSON.stringify(result, null, 2), errorOutput: '' };
            } catch (err) {
                return { ok: false, output: '', errorOutput: `Test case sync failed: ${String(err)}` };
            }
        }

        // ------------------------------------------------------------------
        // workspace_test_run_publish
        // Publish test run results to TestRail / Zephyr via connector, with
        // local .agentfarm/test-registry.json fallback.
        // payload: { provider?, ...run fields }
        // ------------------------------------------------------------------
        case 'workspace_test_run_publish': {
            const provider = typeof payload['provider'] === 'string' ? payload['provider'] : 'testrail';
            if (!connectorActionExecuteClient) {
                const registryPath = join(workspaceDir, '.agentfarm', 'test-registry.json');
                await mkdir(join(workspaceDir, '.agentfarm'), { recursive: true }).catch(() => undefined);
                let registry: { provider: string; test_cases: unknown[]; runs: unknown[]; last_updated: string } = {
                    provider: 'local',
                    test_cases: [],
                    runs: [],
                    last_updated: new Date().toISOString(),
                };
                try {
                    registry = JSON.parse(await readFile(registryPath, 'utf-8'));
                } catch {
                    // no existing registry — use defaults
                }
                const runRecord = {
                    id: `run-${Date.now()}`,
                    published_at: new Date().toISOString(),
                    ...(typeof payload === 'object' && payload !== null ? payload : {}),
                };
                registry.runs.push(runRecord);
                registry.last_updated = new Date().toISOString();
                await writeFile(registryPath, JSON.stringify(registry, null, 2), 'utf-8');
                return {
                    ok: true,
                    output: JSON.stringify({
                        provider: 'local',
                        file: '.agentfarm/test-registry.json',
                        run_id: runRecord.id,
                        total_runs: registry.runs.length,
                        note: `No ${provider} connector configured — run results saved locally. Configure connector credentials to publish to ${provider}.`,
                    }, null, 2),
                    errorOutput: '',
                };
            }
            try {
                const result = await connectorActionExecuteClient({
                    connectorType: provider,
                    actionType: 'publish_test_run',
                    payload,
                });
                return { ok: true, output: JSON.stringify(result, null, 2), errorOutput: '' };
            } catch (err) {
                return { ok: false, output: '', errorOutput: `Test run publish failed: ${String(err)}` };
            }
        }

        // ------------------------------------------------------------------
        // workspace_create_bug
        // File a defect report from a test failure.
        // Tries connector (GitHub/Jira/Linear), then falls back to writing
        // .agentfarm/defect-reports/<id>.json for manual triage.
        // payload: { test_name, error_message, stack_trace?, environment?,
        //            severity?, component?, provider? }
        // ------------------------------------------------------------------
        case 'workspace_create_bug': {
            const testName = typeof payload['test_name'] === 'string' ? payload['test_name'] : 'Unknown test';
            const errorMessage = typeof payload['error_message'] === 'string' ? payload['error_message'] : '';
            const stackTrace = typeof payload['stack_trace'] === 'string' ? payload['stack_trace'] : '';
            const environment = typeof payload['environment'] === 'string' ? payload['environment'] : 'test';
            const severity = typeof payload['severity'] === 'string' ? payload['severity'] : 'medium';
            const component = typeof payload['component'] === 'string' ? payload['component'] : '';
            const provider = typeof payload['provider'] === 'string' ? payload['provider'].toLowerCase() : 'github';

            if (!errorMessage) {
                return { ok: false, output: '', errorOutput: 'payload.error_message is required.' };
            }

            const title = `[BUG] ${testName}: ${errorMessage.slice(0, 100)}`;
            const body = [
                '## Bug Report — Auto-generated from Test Failure',
                '',
                `**Test:** \`${testName}\``,
                `**Environment:** ${environment}`,
                `**Severity:** ${severity}`,
                ...(component ? [`**Component:** ${component}`] : []),
                '',
                '### Error',
                '```',
                errorMessage,
                '```',
                ...(stackTrace ? ['', '### Stack Trace', '```', stackTrace.slice(0, 2000), '```'] : []),
                '',
                '### Steps to Reproduce',
                `1. Run test \`${testName}\``,
                '2. Observe the failure.',
                '',
                '---',
                `_Auto-generated by AgentFarm Tester agent at ${new Date().toISOString()}._`,
            ].join('\n');

            // Try connector (GitHub / Jira / Linear)
            if (connectorActionExecuteClient) {
                const bugPersona = extractPersonaFromPayload(payload);
                const signedBug = applyDisclosureToConnectorPayload({
                    connectorType: provider,
                    actionType: 'create_issue',
                    payload: {
                        title,
                        body,
                        labels: ['bug', 'auto-generated'],
                        severity,
                        ...(component ? { component } : {}),
                    },
                    persona: bugPersona,
                });
                const connResult = await connectorActionExecuteClient({
                    connectorType: provider,
                    actionType: 'create_issue',
                    payload: signedBug.payload,
                });
                if (connResult.ok) {
                    return {
                        ok: true,
                        output: JSON.stringify({ status: 'created', provider, title }, null, 2),
                    };
                }
            }

            // Local fallback: write to .agentfarm/defect-reports/
            const defectDir = join(workspaceDir, '.agentfarm', 'defect-reports');
            await mkdir(defectDir, { recursive: true }).catch(() => undefined);
            const safeId = testName.replace(/[^a-z0-9_-]/gi, '_').slice(0, 60);
            const reportPath = join(defectDir, `${safeId}-${Date.now()}.json`);
            await writeFile(
                reportPath,
                JSON.stringify(
                    {
                        title,
                        test_name: testName,
                        error_message: errorMessage,
                        stack_trace: stackTrace,
                        environment,
                        severity,
                        component,
                        created_at: new Date().toISOString(),
                        status: 'open',
                        markdown_body: body,
                    },
                    null, 2,
                ),
            );
            return {
                ok: true,
                output: JSON.stringify({
                    status: 'saved_locally',
                    report_path: reportPath.replace(workspaceDir, '.'),
                    title,
                    note: connectorActionExecuteClient
                        ? `Connector "${provider}" unavailable — defect saved locally. Configure connector to auto-file issues.`
                        : `No "${provider}" connector configured — defect saved locally at ${reportPath.replace(workspaceDir, '.')}.`,
                }, null, 2),
            };
        }

        // ------------------------------------------------------------------
        // workspace_security_test_report
        // Aggregate security findings from .agentfarm cache files (SAST,
        // secret scan, DAST) into a consolidated report.
        // payload: {} (no required fields — reads from .agentfarm/)
        // ------------------------------------------------------------------
        case 'workspace_security_test_report': {
            const cacheDir = join(workspaceDir, '.agentfarm');
            const readJson = async (name: string): Promise<unknown> => {
                const raw = await readFile(join(cacheDir, name), 'utf8').catch(() => null);
                return raw ? JSON.parse(raw) : null;
            };
            const [sast, secrets, dast] = await Promise.all([
                readJson('sast-result.json'),
                readJson('secret-scan-result.json'),
                readJson('dast-result.json'),
            ]);
            const report = {
                sast: sast ?? 'No SAST results (run workspace_sast_scan first)',
                secrets: secrets ?? 'No secret scan results (run workspace_secret_scan first)',
                dast: dast ?? 'No DAST results (run workspace_dast_scan first)',
            };
            return { ok: true, output: JSON.stringify(report, null, 2), errorOutput: '' };
        }

        default: {
            const _exhaustive: never = actionType;
            return {
                ok: false,
                output: '',
                errorOutput: `Unknown tester action: ${_exhaustive as string}`,
            };
        }
    }
}
