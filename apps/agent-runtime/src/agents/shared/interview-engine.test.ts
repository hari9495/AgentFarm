import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    runProtocolInterview,
    type AnswerClassification,
    type InterviewIO,
    type InterviewQuestionSpec,
} from './interview-engine.js';

const PROTOCOL: InterviewQuestionSpec[] = [
    { id: 'q1', question: 'Tell me about your Go experience.' },
    { id: 'q2', question: 'Why are you looking to move?' },
];

/** Build a fake IO whose classify is scripted per (question → sequence of classifications). */
function fakeIO(script: {
    answers?: string[];
    classifyBy?: (question: string, callIndex: number) => AnswerClassification;
}): { io: InterviewIO; asked: string[] } {
    const asked: string[] = [];
    let listenIdx = 0;
    let classifyIdx = 0;
    const io: InterviewIO = {
        ask: async (t) => { asked.push(t); },
        listen: async () => script.answers?.[listenIdx++] ?? `answer ${listenIdx}`,
        classify: async (q) => (script.classifyBy ? script.classifyBy(q, classifyIdx++) : 'fully_answered'),
    };
    return { io, asked };
}

describe('runProtocolInterview', () => {
    it('advances through every question when each is fully answered', async () => {
        const { io, asked } = fakeIO({});
        const res = await runProtocolInterview({ protocol: PROTOCOL, io, opening: 'Hi!', closing: 'Thanks!' });

        assert.equal(res.completed, true);
        assert.equal(res.totalTurns, 2, 'one turn per question, no probes');
        assert.deepEqual(res.results.map((r) => r.status), ['answered', 'answered']);
        // opening + q1 + q2 + closing were spoken
        assert.equal(asked[0], 'Hi!');
        assert.equal(asked.at(-1), 'Thanks!');
        // transcript interleaves agent/interviewee
        assert.equal(res.transcript[0]?.speaker, 'agent');
    });

    it('probes once on a partial answer then advances', async () => {
        // q1: partial then full (2 turns). q2: full (1 turn).
        let n = 0;
        const { io } = fakeIO({
            classifyBy: () => { n += 1; return n === 1 ? 'partially_answered' : 'fully_answered'; },
        });
        const res = await runProtocolInterview({ protocol: PROTOCOL, io });
        assert.equal(res.results[0]?.probes, 1);
        assert.equal(res.results[0]?.status, 'answered');
        assert.equal(res.totalTurns, 3);
    });

    it('stops probing after maxProbes and records partial/unanswered', async () => {
        const proto: InterviewQuestionSpec[] = [{ id: 'q1', question: 'Q1?', maxProbes: 1 }];
        const { io } = fakeIO({ classifyBy: () => 'partially_answered' });
        const res = await runProtocolInterview({ protocol: proto, io });
        assert.equal(res.results[0]?.probes, 1, 'one probe, then give up');
        assert.equal(res.results[0]?.status, 'partial');
        assert.equal(res.totalTurns, 2);
    });

    it('marks a required question that is never answered as not completed', async () => {
        const proto: InterviewQuestionSpec[] = [{ id: 'q1', question: 'Q1?', maxProbes: 0, required: true }];
        const { io } = fakeIO({ classifyBy: () => 'not_answered' });
        const res = await runProtocolInterview({ protocol: proto, io });
        assert.equal(res.results[0]?.status, 'unanswered');
        assert.equal(res.completed, false);
    });

    it('optional questions do not block completion', async () => {
        const proto: InterviewQuestionSpec[] = [
            { id: 'q1', question: 'Required?', required: true, maxProbes: 0 },
            { id: 'q2', question: 'Optional?', required: false, maxProbes: 0 },
        ];
        let n = 0;
        const { io } = fakeIO({ classifyBy: () => { n += 1; return n === 1 ? 'fully_answered' : 'not_answered'; } });
        const res = await runProtocolInterview({ protocol: proto, io });
        assert.equal(res.completed, true, 'required answered, optional unanswered → still complete');
    });

    it('respects the global turn cap and marks the rest skipped', async () => {
        const proto: InterviewQuestionSpec[] = [
            { id: 'q1', question: 'Q1?', maxProbes: 0 },
            { id: 'q2', question: 'Q2?', maxProbes: 0 },
            { id: 'q3', question: 'Q3?', maxProbes: 0 },
        ];
        const { io } = fakeIO({ classifyBy: () => 'fully_answered' });
        const res = await runProtocolInterview({ protocol: proto, io, maxTotalTurns: 2 });
        assert.equal(res.totalTurns, 2);
        assert.equal(res.results.find((r) => r.id === 'q3')?.status, 'skipped');
    });

    it('uses a custom followUp when provided', async () => {
        const proto: InterviewQuestionSpec[] = [{ id: 'q1', question: 'Q1?', maxProbes: 1 }];
        const probes: string[] = [];
        let n = 0;
        const io: InterviewIO = {
            ask: async () => {},
            listen: async () => 'meh',
            classify: async () => { n += 1; return n === 1 ? 'partially_answered' : 'fully_answered'; },
            followUp: async (q) => { const p = `probe:${q}`; probes.push(p); return p; },
        };
        const res = await runProtocolInterview({ protocol: proto, io });
        assert.deepEqual(probes, ['probe:Q1?']);
        assert.equal(res.results[0]?.status, 'answered');
    });
});
