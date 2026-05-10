import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
    initObservability,
    getTracer,
    getMeter,
    recordAgentAction,
    recordTaskDuration,
    recordApprovalLatency,
    resetObservabilityForTests,
} from '../index.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const sampleAttrs = () => ({
    taskId: 'task_test_001',
    agentId: 'agent_test_001',
    workspaceId: 'ws_test_001',
    actionType: 'file_write',
    success: true,
    durationMs: 42,
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('observability', () => {
    after(async () => {
        await resetObservabilityForTests();
    });

    describe('before initObservability', () => {
        test('getTracer returns an object before init', () => {
            const tracer = getTracer('test-service');
            assert.ok(tracer, 'expected a truthy tracer before init');
        });

        test('getMeter returns an object before init', () => {
            const meter = getMeter('test-service');
            assert.ok(meter, 'expected a truthy meter before init');
        });

        test('recordAgentAction does not throw before init', () => {
            assert.doesNotThrow(() => {
                recordAgentAction(sampleAttrs());
            });
        });

        test('recordTaskDuration does not throw before init', () => {
            assert.doesNotThrow(() => {
                recordTaskDuration('task_001', 100, true);
            });
        });

        test('recordApprovalLatency does not throw before init', () => {
            assert.doesNotThrow(() => {
                recordApprovalLatency('approval_001', 200);
            });
        });
    });

    describe('initObservability', () => {
        test('init without connection string logs a warning and does not throw', () => {
            const warnings: string[] = [];
            const orig = console.warn;
            console.warn = (...args: unknown[]) => { warnings.push(String(args[0])); };
            try {
                assert.doesNotThrow(() => {
                    initObservability({ serviceName: 'test-svc' });
                });
                assert.ok(
                    warnings.some((w) => w.includes('[obs]')),
                    `expected an [obs] warning, got: ${JSON.stringify(warnings)}`,
                );
            } finally {
                console.warn = orig;
            }
        });

        test('calling initObservability twice logs a warning and does not throw', () => {
            // First call already done in the test above; second call should warn and return.
            const warnings: string[] = [];
            const orig = console.warn;
            console.warn = (...args: unknown[]) => { warnings.push(String(args[0])); };
            try {
                assert.doesNotThrow(() => {
                    initObservability({ serviceName: 'test-svc-again' });
                });
                assert.ok(
                    warnings.some((w) => w.includes('more than once')),
                    `expected idempotency warning, got: ${JSON.stringify(warnings)}`,
                );
            } finally {
                console.warn = orig;
            }
        });

        test('init with enableConsoleExporter false does not throw', async () => {
            // Reset so we can re-initialise cleanly.
            await resetObservabilityForTests();
            assert.doesNotThrow(() => {
                initObservability({ serviceName: 'test-no-console', enableConsoleExporter: false });
            });
        });
    });

    describe('after initObservability', () => {
        test('getTracer returns an object after init', () => {
            const tracer = getTracer('test-service-post-init');
            assert.ok(tracer, 'expected a truthy tracer after init');
        });

        test('getMeter returns an object after init', () => {
            const meter = getMeter('test-service-post-init');
            assert.ok(meter, 'expected a truthy meter after init');
        });

        test('recordAgentAction does not throw after init', () => {
            assert.doesNotThrow(() => {
                recordAgentAction(sampleAttrs());
            });
        });

        test('recordTaskDuration does not throw after init', () => {
            assert.doesNotThrow(() => {
                recordTaskDuration('task_001', 123, false);
            });
        });

        test('recordApprovalLatency does not throw after init', () => {
            assert.doesNotThrow(() => {
                recordApprovalLatency('approval_001', 456);
            });
        });
    });
});
