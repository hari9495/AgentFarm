import assert from 'node:assert/strict';
import test from 'node:test';
import { scoreTaskCorrectness, toRuntimeQualitySignal } from './correctness-scorer.js';

test('scoreTaskCorrectness applies risk weighting', () => {
    const score = scoreTaskCorrectness([
        {
            actionId: '1',
            actionType: 'click',
            agentId: 'agent',
            workspaceId: 'ws',
            taskId: 'task',
            sessionId: 'session',
            type: 'browser',
            action: 'click',
            target: '#one',
            payload: {},
            screenshotBefore: 'b',
            screenshotAfter: 'a',
            startedAt: new Date('2026-05-07T00:00:00.000Z'),
            completedAt: new Date('2026-05-07T00:00:01.000Z'),
            durationMs: 1000,
            success: true,
            riskLevel: 'high',
            verified: false,
        },
        {
            actionId: '2',
            actionType: 'click',
            agentId: 'agent',
            workspaceId: 'ws',
            taskId: 'task',
            sessionId: 'session',
            type: 'browser',
            action: 'click',
            target: '#two',
            payload: {},
            screenshotBefore: 'b',
            screenshotAfter: 'a',
            startedAt: new Date('2026-05-07T00:00:02.000Z'),
            completedAt: new Date('2026-05-07T00:00:03.000Z'),
            durationMs: 1000,
            success: true,
            riskLevel: 'low',
            verified: true,
        },
    ]);

    assert.equal(score.totalActions, 2);
    assert.equal(score.verifiedActions, 1);
    assert.equal(score.correctnessScore, 25);
});

test('toRuntimeQualitySignal maps score to [0..1] quality signal', () => {
    const payload = toRuntimeQualitySignal(
        {
            totalActions: 4,
            verifiedActions: 3,
            weightedTotal: 10,
            weightedVerified: 8,
            correctnessScore: 80,
        },
        'openai',
    );

    assert.equal(payload.provider, 'openai');
    assert.equal(payload.score, 0.8);
});
