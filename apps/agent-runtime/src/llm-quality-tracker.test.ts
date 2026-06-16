import test from 'node:test';
import assert from 'node:assert/strict';
import { recordQualitySignal, resetQualitySignals } from './llm-quality-tracker.js';
import {
    __setLangfuseClientForTests,
    resetLangfuseForTests,
    type LangfuseLike,
} from '@agentfarm/llm-trace';

const makeFake = () => {
    const scores: Array<Record<string, unknown>> = [];
    const client: LangfuseLike = {
        trace() { return { id: 't', generation() { return { end() {}, update() {} }; }, update() {} }; },
        async flushAsync() {}, async shutdownAsync() {},
        score(body) { scores.push(body); return undefined; },
    };
    return { client, scores };
};

test('recordQualitySignal persists a Langfuse score on the task trace', () => {
    resetQualitySignals();
    resetLangfuseForTests();
    const { client, scores } = makeFake();
    __setLangfuseClientForTests(client);
    try {
        const event = recordQualitySignal({
            provider: 'anthropic',
            actionType: 'create_pr',
            signal: 'action_approved',
            taskId: 'task-42',
            reason: 'looks good',
        });
        assert.ok(event);
        assert.equal(scores.length, 1);
        assert.equal(scores[0]!['traceId'], 'task-42');
        assert.equal(scores[0]!['name'], 'quality');
        assert.equal(scores[0]!['dataType'], 'NUMERIC');
        assert.equal(typeof scores[0]!['value'], 'number');
        assert.match(String(scores[0]!['comment']), /action_approved/);
    } finally {
        __setLangfuseClientForTests(null);
        resetLangfuseForTests();
        resetQualitySignals();
    }
});

test('recordQualitySignal emits no score when taskId is absent', () => {
    resetQualitySignals();
    resetLangfuseForTests();
    const { client, scores } = makeFake();
    __setLangfuseClientForTests(client);
    try {
        recordQualitySignal({ provider: 'openai', actionType: 'read_task', signal: 'action_succeeded' });
        assert.equal(scores.length, 0);
    } finally {
        __setLangfuseClientForTests(null);
        resetLangfuseForTests();
        resetQualitySignals();
    }
});
