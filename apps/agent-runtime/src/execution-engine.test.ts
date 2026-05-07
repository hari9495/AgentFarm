import test from 'node:test';
import assert from 'node:assert/strict';
import {
    buildDecision,
    classifyRisk,
    normalizeActionType,
    processApprovedTask,
    processDeveloperTask,
    scoreConfidence,
    type TaskEnvelope,
} from './execution-engine.js';

const taskEnvelope = (payload: Record<string, unknown>, taskId = 'task_1'): TaskEnvelope => ({
    taskId,
    payload,
    enqueuedAt: Date.now(),
});

test('normalizeActionType prefers action_type and falls back to normalized intent', () => {
    assert.equal(normalizeActionType({ action_type: 'Create_Comment' }), 'create_comment');
    assert.equal(normalizeActionType({ intent: 'Code Review' }), 'code_review');
    assert.equal(normalizeActionType({}), 'read_task');
});

test('scoreConfidence returns high confidence for complete payload and lower confidence for ambiguous input', () => {
    const high = scoreConfidence({
        summary: 'Review API response contract for deployment endpoint',
        target: 'api-gateway',
        complexity: 'low',
        ambiguous: false,
    });

    const low = scoreConfidence({
        summary: 'todo',
        complexity: 'high',
        ambiguous: true,
    });

    assert.ok(high >= 0.8);
    assert.ok(low <= 0.5);
});

test('classifyRisk maps action policy and confidence to low/medium/high risk levels', () => {
    const high = classifyRisk('merge_release', 0.91, {});
    assert.equal(high.riskLevel, 'high');

    const highMergePr = classifyRisk('merge_pr', 0.91, {});
    assert.equal(highMergePr.riskLevel, 'high');

    const medium = classifyRisk('create_comment', 0.9, {});
    assert.equal(medium.riskLevel, 'medium');

    const mediumCreatePr = classifyRisk('create_pr', 0.9, {});
    assert.equal(mediumCreatePr.riskLevel, 'medium');

    const confidenceMedium = classifyRisk('read_task', 0.4, {});
    assert.equal(confidenceMedium.riskLevel, 'medium');

    const low = classifyRisk('read_task', 0.9, {});
    assert.equal(low.riskLevel, 'low');
});

test('buildDecision supports developer intents for code review and test planning as executable work', () => {
    const codeReview = buildDecision(taskEnvelope({
        intent: 'Code Review',
        summary: 'Review PR #41 for security and quality checks',
        target: 'PR-41',
    }));

    const testPlan = buildDecision(taskEnvelope({
        intent: 'test planning',
        summary: 'Generate positive and negative test scenarios for provisioning retries',
        target: 'provisioning-service',
    }));

    assert.equal(codeReview.actionType, 'code_review');
    assert.equal(codeReview.riskLevel, 'low');
    assert.equal(codeReview.route, 'execute');

    assert.equal(testPlan.actionType, 'test_planning');
    assert.equal(testPlan.riskLevel, 'low');
    assert.equal(testPlan.route, 'execute');
});

test('processDeveloperTask executes low-risk task with transient retries and succeeds', async () => {
    const result = await processDeveloperTask(taskEnvelope({
        action_type: 'read_task',
        summary: 'Read deployment status and post summary',
        target: 'deployments',
        simulate_transient_failures: 2,
    }));

    assert.equal(result.status, 'success');
    assert.equal(result.attempts, 3);
    assert.equal(result.transientRetries, 2);
    assert.equal(result.decision.route, 'execute');
});

test('processDeveloperTask queues medium/high-risk tasks for approval instead of direct execution', async () => {
    const mediumRisk = await processDeveloperTask(taskEnvelope({
        action_type: 'create_comment',
        summary: 'Create status comment on issue',
        target: 'JIRA-55',
    }));

    const highRisk = await processDeveloperTask(taskEnvelope({
        action_type: 'merge_release',
        summary: 'Merge release branch into main',
        target: 'main',
    }));

    const createPrRisk = await processDeveloperTask(taskEnvelope({
        action_type: 'create_pr',
        summary: 'Open pull request from feature branch',
        target: 'repo/main',
    }));

    const mergePrRisk = await processDeveloperTask(taskEnvelope({
        action_type: 'merge_pr',
        summary: 'Merge approved pull request into main',
        target: 'repo/main',
    }));

    const meetingSpeakRisk = await processDeveloperTask(taskEnvelope({
        action_type: 'workspace_meeting_speak',
        summary: 'Speak live interview questions in customer call',
        target: 'teams meeting',
    }));

    const meetingInterviewRisk = await processDeveloperTask(taskEnvelope({
        action_type: 'workspace_meeting_interview_live',
        summary: 'Capture candidate answers and generate follow-up prompts',
        target: 'teams interview bridge',
    }));

    assert.equal(mediumRisk.status, 'approval_required');
    assert.equal(mediumRisk.decision.riskLevel, 'medium');
    assert.equal(mediumRisk.attempts, 0);

    assert.equal(highRisk.status, 'approval_required');
    assert.equal(highRisk.decision.riskLevel, 'high');
    assert.equal(highRisk.attempts, 0);

    assert.equal(createPrRisk.status, 'approval_required');
    assert.equal(createPrRisk.decision.riskLevel, 'medium');
    assert.equal(createPrRisk.attempts, 0);

    assert.equal(mergePrRisk.status, 'approval_required');
    assert.equal(mergePrRisk.decision.riskLevel, 'high');
    assert.equal(mergePrRisk.attempts, 0);

    assert.equal(meetingSpeakRisk.status, 'approval_required');
    assert.equal(meetingSpeakRisk.decision.riskLevel, 'high');
    assert.equal(meetingSpeakRisk.attempts, 0);

    assert.equal(meetingInterviewRisk.status, 'approval_required');
    assert.equal(meetingInterviewRisk.decision.riskLevel, 'high');
    assert.equal(meetingInterviewRisk.attempts, 0);
});

test('processDeveloperTask marks non-retryable executor failures as runtime_exception', async () => {
    const failed = await processDeveloperTask(taskEnvelope({
        action_type: 'read_task',
        summary: 'Read status',
        target: 'deployments',
        force_failure: true,
    }));

    assert.equal(failed.status, 'failed');
    assert.equal(failed.failureClass, 'runtime_exception');
    assert.equal(failed.attempts, 1);
    assert.equal(failed.transientRetries, 0);
});

test('processDeveloperTask marks exhausted transient retries as transient_error', async () => {
    const failed = await processDeveloperTask(taskEnvelope({
        action_type: 'read_task',
        summary: 'Read status and notify owner',
        target: 'deployments',
        simulate_transient_failures: 3,
        disable_auto_research_retry: true,
    }), {
        maxAttempts: 3,
    });

    assert.equal(failed.status, 'failed');
    assert.equal(failed.failureClass, 'transient_error');
    assert.equal(failed.attempts, 3);
    assert.equal(failed.transientRetries, 2);
});

test('processDeveloperTask performs one research-assisted retry after repeated failures', async () => {
    const originalFetch = globalThis.fetch;
    const fetchCalls: string[] = [];
    globalThis.fetch = (async (input: string | URL | Request) => {
        fetchCalls.push(String(input));
        return new Response('<html><body>Retry guidance for transient failures.</body></html>', {
            status: 200,
            headers: { 'content-type': 'text/html' },
        });
    }) as typeof fetch;

    try {
        const result = await processDeveloperTask(taskEnvelope({
            action_type: 'read_task',
            summary: 'Read status and recover after repeated failures',
            target: 'deployments',
            simulate_transient_failures: 2,
        }), {
            maxAttempts: 2,
        });

        assert.equal(result.status, 'success');
        assert.equal(result.attempts, 3);
        assert.equal(result.executionPayload['_research_retry_attempted'], true);
        assert.ok(fetchCalls.length > 0, 'research fetch should run before the extra retry');
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('processApprovedTask executes approved risky action through retry flow', async () => {
    const approved = await processApprovedTask(taskEnvelope({
        action_type: 'merge_release',
        summary: 'Merge release after human approval',
        target: 'main',
        simulate_transient_failures: 1,
    }));

    assert.equal(approved.status, 'success');
    assert.equal(approved.decision.route, 'execute');
    assert.equal(approved.attempts, 2);
    assert.equal(approved.transientRetries, 1);
});

// --- Edge-case hardening ---

test('normalizeActionType treats whitespace-only action_type as missing and falls back to intent', () => {
    assert.equal(normalizeActionType({ action_type: '   ' }), 'read_task');
    assert.equal(normalizeActionType({ action_type: '   ', intent: 'Code Review' }), 'code_review');
});

test('normalizeActionType treats non-string action_type as missing and falls back to intent', () => {
    assert.equal(normalizeActionType({ action_type: 42 }), 'read_task');
    assert.equal(normalizeActionType({ action_type: null, intent: 'test planning' }), 'test_planning');
});

test('scoreConfidence reduces score for any truthy ambiguous value, not only boolean true', () => {
    const booleanTrue = scoreConfidence({
        summary: 'A complete and clear task description',
        target: 'main',
        ambiguous: true,
    });
    const truthyNumber = scoreConfidence({
        summary: 'A complete and clear task description',
        target: 'main',
        ambiguous: 1,
    });
    const nonAmbiguous = scoreConfidence({
        summary: 'A complete and clear task description',
        target: 'main',
        ambiguous: false,
    });

    // Both truthy values should reduce confidence equally
    assert.equal(booleanTrue, truthyNumber);
    // Non-ambiguous should score higher
    assert.ok(nonAmbiguous > booleanTrue);
});

test('classifyRisk risk_hint=low explicitly overrides confidence-based medium risk', () => {
    // Confidence below threshold would normally produce medium, but risk_hint=low forces low
    const result = classifyRisk('read_task', 0.4, { risk_hint: 'low' });
    assert.equal(result.riskLevel, 'low');
    assert.match(result.reason, /explicitly overrides/);
});

test('classifyRisk unknown risk_hint values do not affect classification', () => {
    const result = classifyRisk('read_task', 0.9, { risk_hint: 'critical' });
    assert.equal(result.riskLevel, 'low');
});

test('scoreConfidence reaches minimum score when all penalty conditions are applied simultaneously', () => {
    const score = scoreConfidence({
        summary: 'x',           // too short: -0.18
        complexity: 'high',     // -0.16
        ambiguous: true,        // -0.20
        // no target:           // -0.10
    });
    // 0.92 - 0.18 - 0.16 - 0.20 - 0.10 = 0.28, clamped to 0.28 (never goes negative)
    assert.equal(score, 0.28);
    assert.ok(score >= 0, 'confidence must never go below 0');
});

test('buildDecision routes risk_hint=high payload to approval even for normally-low action', () => {
    const decision = buildDecision(taskEnvelope({
        action_type: 'read_task',
        summary: 'Read and summarize the backlog item',
        target: 'JIRA-1',
        risk_hint: 'high',
    }));

    assert.equal(decision.riskLevel, 'high');
    assert.equal(decision.route, 'approval');
});

test('processDeveloperTask uses llmDecisionResolver output when available', async () => {
    const result = await processDeveloperTask(taskEnvelope({
        action_type: 'read_task',
        summary: 'Post deployment update',
        target: 'deployments',
    }), {
        modelProvider: 'openai',
        llmDecisionResolver: async () => ({
            decision: {
                actionType: 'create_comment',
                confidence: 0.87,
                riskLevel: 'medium',
                route: 'approval',
                reason: 'Requires stakeholder-visible update.',
            },
            metadata: {
                modelProvider: 'openai',
                model: 'gpt-4o-mini',
                modelProfile: 'speed_first',
                promptTokens: 120,
                completionTokens: 40,
                totalTokens: 160,
            },
        }),
    });

    assert.equal(result.status, 'approval_required');
    assert.equal(result.decision.actionType, 'create_comment');
    assert.equal(result.decision.riskLevel, 'medium');
    assert.equal(result.llmExecution?.classificationSource, 'llm');
    assert.equal(result.llmExecution?.modelProvider, 'openai');
    assert.equal(result.llmExecution?.modelProfile, 'speed_first');
    assert.equal(result.llmExecution?.totalTokens, 160);
    assert.equal(result.payloadOverrideSource, 'none');
    assert.deepEqual(result.executionPayload, {
        action_type: 'read_task',
        summary: 'Post deployment update',
        target: 'deployments',
    });
});

test('processDeveloperTask merges payloadOverrides into executionPayload', async () => {
    const result = await processDeveloperTask(taskEnvelope({
        action_type: 'workspace_subagent_spawn',
        prompt: 'Fix the flaky test',
    }), {
        modelProvider: 'openai',
        llmDecisionResolver: async () => ({
            decision: {
                actionType: 'workspace_subagent_spawn',
                confidence: 0.91,
                riskLevel: 'high',
                route: 'approval',
                reason: 'Planner generated a bounded implementation plan.',
            },
            metadata: {
                modelProvider: 'openai',
                model: 'gpt-4.1',
                modelProfile: 'quality_first',
                promptTokens: 220,
                completionTokens: 90,
                totalTokens: 310,
            },
            payloadOverrides: {
                test_command: 'pnpm --filter @agentfarm/agent-runtime test',
                initial_plan: [
                    {
                        description: 'inspect the failing slice',
                        actions: [{ action: 'run_tests', command: 'pnpm --filter @agentfarm/agent-runtime test' }],
                    },
                ],
            },
        }),
    });

    assert.equal(result.status, 'approval_required');
    assert.equal(result.executionPayload['prompt'], 'Fix the flaky test');
    assert.equal(result.executionPayload['test_command'], 'pnpm --filter @agentfarm/agent-runtime test');
    assert.ok(Array.isArray(result.executionPayload['initial_plan']));
    assert.equal(result.payloadOverrideSource, 'llm_generated');
});

test('processDeveloperTask injects audit ancestry when runtime context is present', async () => {
    const result = await processDeveloperTask(taskEnvelope({
        action_type: 'workspace_browser_open',
        summary: 'Open the website workspace in the browser',
        target: 'https://example.com',
        tenantId: 'ten_deadbeef',
        workspaceId: 'ws_runtime',
        botId: 'bot_runtime',
        roleKey: 'developer',
    }));

    assert.equal(result.status, 'approval_required');
    assert.match(String(result.executionPayload['audit_agent_instance_id']), /^agt_deadbeef_developer_[a-f0-9]{4}$/);
    assert.match(String(result.executionPayload['session_id']), /^ses_agt_[a-f0-9]{4}_\d{8}T\d{6}_[a-f0-9]{4}$/);
    assert.match(String(result.executionPayload['recording_id']), /^rec_ses_[a-f0-9]{4}$/);
    assert.equal(result.executionPayload['audit_tenant_id'], 'ten_deadbeef');
    assert.equal(result.executionPayload['audit_role'], 'developer');
});

test('processDeveloperTask falls back to heuristic decision when llmDecisionResolver throws', async () => {
    const result = await processDeveloperTask(taskEnvelope({
        action_type: 'read_task',
        summary: 'Read deployment status',
        target: 'deployments',
    }), {
        modelProvider: 'openai',
        llmDecisionResolver: async () => {
            throw new Error('provider_unavailable');
        },
    });

    assert.equal(result.status, 'success');
    assert.equal(result.decision.actionType, 'read_task');
    assert.equal(result.llmExecution?.classificationSource, 'heuristic');
    assert.equal(result.llmExecution?.fallbackReason, 'llm_resolution_failed');
});
