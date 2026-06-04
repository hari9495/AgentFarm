import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    detectStalePullRequests,
    detectStaleTickets,
    detectBudgetWarning,
    detectCiFailure,
    detectDependencyCve,
    detectMissingAcceptanceCriteria,
    detectContradictoryRequirements,
    detectUndocumentedRequirements,
    detectEpicsWithoutBrd,
    detectProactiveSignals,
    runProactiveDetection,
} from './proactive-signal-detector.js';

// ===========================================================================
// detectStalePullRequests
// ===========================================================================

describe('detectStalePullRequests', () => {
    it('returns empty array when no PRs provided', () => {
        assert.deepEqual(detectStalePullRequests([], 7), []);
    });

    it('does not flag PRs below threshold', () => {
        const signals = detectStalePullRequests([{ id: 'pr-1', title: 'Fix', daysSinceUpdate: 3 }], 7);
        assert.equal(signals.length, 0);
    });

    it('flags PRs at exactly the threshold', () => {
        const signals = detectStalePullRequests([{ id: 'pr-1', title: 'Fix', daysSinceUpdate: 7 }], 7);
        assert.equal(signals.length, 1);
        assert.equal(signals[0]!.signalType, 'stale_pr');
        assert.equal(signals[0]!.severity, 'medium');
        assert.equal(signals[0]!.sourceRef, 'pr:pr-1');
    });

    it('flags PRs above threshold', () => {
        const signals = detectStalePullRequests([{ id: 'pr-2', title: 'Feat', daysSinceUpdate: 20 }], 7);
        assert.equal(signals.length, 1);
    });

    it('returns one signal per stale PR', () => {
        const prs = [
            { id: 'pr-1', title: 'A', daysSinceUpdate: 10 },
            { id: 'pr-2', title: 'B', daysSinceUpdate: 2 },  // below threshold
            { id: 'pr-3', title: 'C', daysSinceUpdate: 15 },
        ];
        const signals = detectStalePullRequests(prs, 7);
        assert.equal(signals.length, 2);
    });

    it('includes metadata with threshold and days', () => {
        const signals = detectStalePullRequests([{ id: 'pr-1', title: 'T', daysSinceUpdate: 9 }], 7);
        assert.equal(signals[0]!.metadata!['days_since_update'], 9);
        assert.equal(signals[0]!.metadata!['threshold_days'], 7);
    });
});

// ===========================================================================
// detectStaleTickets
// ===========================================================================

describe('detectStaleTickets', () => {
    it('returns empty array when no tickets provided', () => {
        assert.deepEqual(detectStaleTickets([], 72), []);
    });

    it('flags tickets at threshold', () => {
        const signals = detectStaleTickets([{ id: 'tk-1', title: 'Bug', hoursSinceUpdate: 72 }], 72);
        assert.equal(signals.length, 1);
        assert.equal(signals[0]!.signalType, 'stale_ticket');
        assert.equal(signals[0]!.sourceRef, 'ticket:tk-1');
    });

    it('does not flag tickets below threshold', () => {
        assert.equal(detectStaleTickets([{ id: 'tk-1', title: 'Bug', hoursSinceUpdate: 71 }], 72).length, 0);
    });
});

// ===========================================================================
// detectBudgetWarning
// ===========================================================================

describe('detectBudgetWarning', () => {
    it('returns empty array when utilization is undefined', () => {
        assert.deepEqual(detectBudgetWarning(undefined, 0.8), []);
    });

    it('returns empty array when utilization is below threshold', () => {
        assert.deepEqual(detectBudgetWarning(0.75, 0.8), []);
    });

    it('flags at exactly threshold with medium severity', () => {
        const signals = detectBudgetWarning(0.8, 0.8);
        assert.equal(signals.length, 1);
        assert.equal(signals[0]!.signalType, 'budget_warning');
        assert.equal(signals[0]!.severity, 'medium');
    });

    it('flags at 100% utilization with high severity', () => {
        const signals = detectBudgetWarning(1.0, 0.8);
        assert.equal(signals.length, 1);
        assert.equal(signals[0]!.severity, 'high');
    });

    it('flags over 100% with high severity', () => {
        const signals = detectBudgetWarning(1.2, 0.8);
        assert.equal(signals[0]!.severity, 'high');
    });

    it('summary includes percentage', () => {
        const signals = detectBudgetWarning(0.85, 0.8);
        assert.match(signals[0]!.summary, /85%/);
    });
});

// ===========================================================================
// detectCiFailure
// ===========================================================================

describe('detectCiFailure', () => {
    it('returns empty array for non-main branch failures', () => {
        const signals = detectCiFailure([{ workflowName: 'build', branch: 'feature', failureCount: 3 }], 1);
        assert.equal(signals.length, 0);
    });

    it('flags main branch failures at threshold', () => {
        const signals = detectCiFailure([{ workflowName: 'build', branch: 'main', failureCount: 1 }], 1);
        assert.equal(signals.length, 1);
        assert.equal(signals[0]!.signalType, 'ci_failure_on_main');
    });

    it('does not flag main branch failures below threshold', () => {
        assert.equal(detectCiFailure([{ workflowName: 'build', branch: 'main', failureCount: 0 }], 1).length, 0);
    });

    it('severity is high when failureCount exceeds threshold+1', () => {
        const signals = detectCiFailure([{ workflowName: 'test', branch: 'main', failureCount: 3 }], 1);
        assert.equal(signals[0]!.severity, 'high');
    });

    it('severity is medium at exactly the threshold', () => {
        const signals = detectCiFailure([{ workflowName: 'test', branch: 'main', failureCount: 1 }], 1);
        assert.equal(signals[0]!.severity, 'medium');
    });

    it('includes recommended_action in metadata', () => {
        const signals = detectCiFailure([{ workflowName: 'test', branch: 'main', failureCount: 2 }], 1);
        assert.equal(signals[0]!.metadata!['recommended_action'], 'workspace_run_ci_checks');
    });
});

// ===========================================================================
// detectDependencyCve
// ===========================================================================

describe('detectDependencyCve', () => {
    it('returns empty array when no vulnerabilities provided', () => {
        assert.deepEqual(detectDependencyCve([], 'high'), []);
    });

    it('filters out vulnerabilities below severity threshold', () => {
        const signals = detectDependencyCve(
            [{ dependencyName: 'lodash', cveId: 'CVE-123', severity: 'low' }], 'high',
        );
        assert.equal(signals.length, 0);
    });

    it('includes vulnerabilities at threshold severity', () => {
        const signals = detectDependencyCve(
            [{ dependencyName: 'lodash', cveId: 'CVE-123', severity: 'high' }], 'high',
        );
        assert.equal(signals.length, 1);
        assert.equal(signals[0]!.signalType, 'dependency_cve');
    });

    it('includes vulnerabilities above threshold', () => {
        const signals = detectDependencyCve(
            [{ dependencyName: 'express', cveId: 'CVE-999', severity: 'critical' }], 'medium',
        );
        assert.equal(signals.length, 1);
    });

    it('severity is high for critical vulnerabilities', () => {
        const signals = detectDependencyCve(
            [{ dependencyName: 'pkg', cveId: 'CVE-1', severity: 'critical' }], 'medium',
        );
        assert.equal(signals[0]!.severity, 'high');
    });

    it('severity is medium for non-critical vulnerabilities', () => {
        const signals = detectDependencyCve(
            [{ dependencyName: 'pkg', cveId: 'CVE-2', severity: 'high' }], 'medium',
        );
        assert.equal(signals[0]!.severity, 'medium');
    });
});

// ===========================================================================
// detectMissingAcceptanceCriteria
// ===========================================================================

describe('detectMissingAcceptanceCriteria', () => {
    it('only flags stories (not tasks/bugs/epics)', () => {
        const stories = [
            { id: 's1', title: 'Story', type: 'story' as const, hasAcceptanceCriteria: false, hoursSinceCreated: 30 },
            { id: 't1', title: 'Task', type: 'task' as const, hasAcceptanceCriteria: false, hoursSinceCreated: 30 },
        ];
        const signals = detectMissingAcceptanceCriteria(stories, 24);
        assert.equal(signals.length, 1);
        assert.equal(signals[0]!.sourceRef, 'story:s1');
    });

    it('does not flag stories that already have AC', () => {
        const stories = [
            { id: 's1', title: 'Story', type: 'story' as const, hasAcceptanceCriteria: true, hoursSinceCreated: 30 },
        ];
        assert.equal(detectMissingAcceptanceCriteria(stories, 24).length, 0);
    });

    it('does not flag stories below threshold age', () => {
        const stories = [
            { id: 's1', title: 'Story', type: 'story' as const, hasAcceptanceCriteria: false, hoursSinceCreated: 20 },
        ];
        assert.equal(detectMissingAcceptanceCriteria(stories, 24).length, 0);
    });

    it('flags stories at threshold', () => {
        const stories = [
            { id: 's1', title: 'Story', type: 'story' as const, hasAcceptanceCriteria: false, hoursSinceCreated: 24 },
        ];
        const signals = detectMissingAcceptanceCriteria(stories, 24);
        assert.equal(signals.length, 1);
        assert.equal(signals[0]!.signalType, 'ba_missing_acceptance_criteria');
        assert.equal(signals[0]!.severity, 'medium');
    });
});

// ===========================================================================
// detectContradictoryRequirements
// ===========================================================================

describe('detectContradictoryRequirements', () => {
    it('returns empty array for empty input', () => {
        assert.deepEqual(detectContradictoryRequirements([]), []);
    });

    it('creates one signal per conflict with correct shape', () => {
        const conflict = {
            requirementAId: 'req-1', requirementAText: 'System shall do A',
            requirementBId: 'req-2', requirementBText: 'System shall not do A',
            conflictDescription: 'Logical contradiction', severity: 'high' as const,
        };
        const signals = detectContradictoryRequirements([conflict]);
        assert.equal(signals.length, 1);
        assert.equal(signals[0]!.signalType, 'ba_contradictory_requirements');
        assert.equal(signals[0]!.severity, 'high');
        assert.equal(signals[0]!.sourceRef, 'conflict:req-1:req-2');
        assert.equal(signals[0]!.metadata!['recommended_action'], 'workspace_ba_gap_analysis');
    });

    it('preserves severity from input (low/medium/high)', () => {
        for (const sev of ['low', 'medium', 'high'] as const) {
            const signals = detectContradictoryRequirements([{
                requirementAId: 'a', requirementAText: 'A',
                requirementBId: 'b', requirementBText: 'B',
                conflictDescription: 'desc', severity: sev,
            }]);
            assert.equal(signals[0]!.severity, sev);
        }
    });
});

// ===========================================================================
// detectUndocumentedRequirements
// ===========================================================================

describe('detectUndocumentedRequirements', () => {
    it('does not flag threads below threshold', () => {
        const threads = [{ threadId: 't1', channel: 'eng', platform: 'slack' as const, summary: 'Need X', hoursSincePosted: 24 }];
        assert.equal(detectUndocumentedRequirements(threads, 48).length, 0);
    });

    it('flags threads at or above threshold', () => {
        const threads = [{ threadId: 't1', channel: 'eng', platform: 'slack' as const, summary: 'Need X', hoursSincePosted: 48 }];
        const signals = detectUndocumentedRequirements(threads, 48);
        assert.equal(signals.length, 1);
        assert.equal(signals[0]!.signalType, 'ba_undocumented_requirement');
        assert.equal(signals[0]!.sourceRef, 'thread:slack:t1');
        assert.equal(signals[0]!.metadata!['recommended_action'], 'workspace_ba_elicit_requirements');
    });
});

// ===========================================================================
// detectEpicsWithoutBrd
// ===========================================================================

describe('detectEpicsWithoutBrd', () => {
    it('does not flag epics that have a BRD', () => {
        const epics = [{ id: 'e1', title: 'Epic', hasLinkedBrd: true, daysSinceCreated: 10 }];
        assert.equal(detectEpicsWithoutBrd(epics, 3).length, 0);
    });

    it('does not flag epics below threshold', () => {
        const epics = [{ id: 'e1', title: 'Epic', hasLinkedBrd: false, daysSinceCreated: 2 }];
        assert.equal(detectEpicsWithoutBrd(epics, 3).length, 0);
    });

    it('flags epics at threshold with medium severity', () => {
        const epics = [{ id: 'e1', title: 'Epic', hasLinkedBrd: false, daysSinceCreated: 3 }];
        const signals = detectEpicsWithoutBrd(epics, 3);
        assert.equal(signals.length, 1);
        assert.equal(signals[0]!.severity, 'medium');
        assert.equal(signals[0]!.signalType, 'ba_epic_without_brd');
    });

    it('escalates to high severity when age >= 2× threshold', () => {
        const epics = [{ id: 'e1', title: 'Epic', hasLinkedBrd: false, daysSinceCreated: 6 }];
        const signals = detectEpicsWithoutBrd(epics, 3);
        assert.equal(signals[0]!.severity, 'high');
    });
});

// ===========================================================================
// detectProactiveSignals (orchestration)
// ===========================================================================

describe('detectProactiveSignals', () => {
    const baseSignalInput = () => ({
        tenantId: 'tenant_1', workspaceId: 'ws_1',
        botId: 'bot_1', correlationId: 'corr_1',
    });

    it('returns empty array when no inputs provided', () => {
        assert.deepEqual(detectProactiveSignals(baseSignalInput()), []);
    });

    it('uses default thresholds when not specified', () => {
        const signals = detectProactiveSignals({
            ...baseSignalInput(),
            pullRequests: [{ id: 'pr-1', title: 'Old PR', daysSinceUpdate: 14 }],
        });
        assert.equal(signals.length, 1);
        assert.equal(signals[0]!.signalType, 'stale_pr');
    });

    it('respects custom stalePrThresholdDays', () => {
        const below = detectProactiveSignals({
            ...baseSignalInput(),
            pullRequests: [{ id: 'pr-1', title: 'PR', daysSinceUpdate: 5 }],
            stalePrThresholdDays: 10,
        });
        assert.equal(below.length, 0);

        const above = detectProactiveSignals({
            ...baseSignalInput(),
            pullRequests: [{ id: 'pr-1', title: 'PR', daysSinceUpdate: 11 }],
            stalePrThresholdDays: 10,
        });
        assert.equal(above.length, 1);
    });

    it('aggregates signals from all detector types', () => {
        const signals = detectProactiveSignals({
            ...baseSignalInput(),
            pullRequests: [{ id: 'pr-1', title: 'Old', daysSinceUpdate: 20 }],
            tickets: [{ id: 'tk-1', title: 'Old', hoursSinceUpdate: 100 }],
            budgetUtilizationRatio: 0.9,
        });
        const types = signals.map(s => s.signalType);
        assert.ok(types.includes('stale_pr'));
        assert.ok(types.includes('stale_ticket'));
        assert.ok(types.includes('budget_warning'));
    });

    it('includes BA signals in aggregated output', () => {
        const signals = detectProactiveSignals({
            ...baseSignalInput(),
            storiesWithoutAcceptanceCriteria: [{
                id: 's1', title: 'Story', type: 'story',
                hasAcceptanceCriteria: false, hoursSinceCreated: 48,
            }],
        });
        assert.equal(signals.length, 1);
        assert.equal(signals[0]!.signalType, 'ba_missing_acceptance_criteria');
    });
});

// ===========================================================================
// runProactiveDetection (async wrapper)
// ===========================================================================

describe('runProactiveDetection', () => {
    it('returns detected signals enriched with connectors_considered', async () => {
        const connectors = [{ tool: 'github' }, { tool: 'jira' }];
        const signals = await runProactiveDetection('ws_1', connectors, {
            tenantId: 'tenant_1', botId: 'bot_1', correlationId: 'corr_1',
            pullRequests: [{ id: 'pr-1', title: 'Stale', daysSinceUpdate: 20 }],
        });
        assert.equal(signals.length, 1);
        assert.deepEqual(signals[0]!.metadata!['connectors_considered'], ['github', 'jira']);
    });

    it('returns empty array when no signals detected', async () => {
        const signals = await runProactiveDetection('ws_1', [], {
            tenantId: 'tenant_1', botId: 'bot_1', correlationId: 'corr_1',
        });
        assert.deepEqual(signals, []);
    });

    it('calls writeAuditEvent for each detected signal', async () => {
        const auditCalls: unknown[] = [];
        await runProactiveDetection('ws_1', [], {
            tenantId: 'tenant_1', botId: 'bot_1', correlationId: 'corr_1',
            pullRequests: [
                { id: 'pr-1', title: 'Old A', daysSinceUpdate: 20 },
                { id: 'pr-2', title: 'Old B', daysSinceUpdate: 25 },
            ],
        }, (event) => auditCalls.push(event));
        assert.equal(auditCalls.length, 2);
    });

    it('does not call writeAuditEvent when no signals detected', async () => {
        const auditCalls: unknown[] = [];
        await runProactiveDetection('ws_1', [], {
            tenantId: 'tenant_1', botId: 'bot_1', correlationId: 'corr_1',
        }, (event) => auditCalls.push(event));
        assert.equal(auditCalls.length, 0);
    });

    it('uses default tenantId and botId when input omitted', async () => {
        const signals = await runProactiveDetection('ws_1', []);
        assert.deepEqual(signals, []);
    });
});
