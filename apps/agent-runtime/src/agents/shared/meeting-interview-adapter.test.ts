import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { runMeetingProtocolInterview } from './meeting-interview-adapter.js';
import type { InterviewQuestionSpec } from './interview-engine.js';

const PROTOCOL: InterviewQuestionSpec[] = [
    { id: 'q1', question: 'Tell me about your experience.' },
    { id: 'q2', question: 'Why this role?' },
];

describe('runMeetingProtocolInterview (live adapter, faked I/O)', () => {
    it('joins, runs the protocol over live I/O, and returns the session + scored results', async () => {
        const calls: string[] = [];
        const spoken: string[] = [];

        const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
            const href = typeof url === 'string' ? url : url.toString();
            calls.push(href);
            if (href.includes('/join-meeting')) return new Response(null, { status: 200 });
            if (href.includes('/speak')) {
                const body = JSON.parse(String(init?.body ?? '{}')) as { audioBase64?: string };
                spoken.push(Buffer.from(body.audioBase64 ?? '', 'base64').toString('utf8'));
                return new Response(null, { status: 200 });
            }
            if (href.includes('/capture-audio')) {
                return new Response(JSON.stringify({ audioBase64: Buffer.from('x').toString('base64') }), {
                    status: 200, headers: { 'content-type': 'application/json' },
                });
            }
            return new Response(null, { status: 404 });
        }) as typeof fetch;

        const result = await runMeetingProtocolInterview(
            {
                tenantId: 't', workspaceId: 'w', agentId: 'a',
                desktopSessionId: 'ds-1', meetingUrl: 'https://zoom.us/j/1', platform: 'zoom',
                protocol: PROTOCOL, opening: 'Hello', closing: 'Bye',
            },
            {
                fetchImpl,
                tts: async (text) => Buffer.from(text, 'utf8'),        // "audio" = the text bytes
                stt: async () => 'this is a sufficiently long answer with plenty of words to pass',
                startSession: async () => ({ sessionId: 'mtg-1' }),
                // default classify heuristic: >=12 words → fully_answered
            },
        );

        assert.equal(result.meetingSessionId, 'mtg-1');
        assert.equal(result.completed, true);
        assert.deepEqual(result.results.map((r) => r.status), ['answered', 'answered']);
        // joined before anything else
        assert.ok(calls[0]!.includes('/join-meeting'));
        // opening + both questions + closing were spoken (TTS text round-tripped through /speak)
        assert.ok(spoken.includes('Hello'));
        assert.ok(spoken.includes('Tell me about your experience.'));
        assert.ok(spoken.includes('Bye'));
    });

    it('throws if the join fails (so the caller can fall back / surface it)', async () => {
        const fetchImpl = (async (url: string | URL | Request) => {
            const href = typeof url === 'string' ? url : url.toString();
            if (href.includes('/join-meeting')) return new Response(null, { status: 503 });
            return new Response(null, { status: 200 });
        }) as typeof fetch;

        await assert.rejects(
            () => runMeetingProtocolInterview(
                {
                    tenantId: 't', workspaceId: 'w', agentId: 'a',
                    desktopSessionId: 'ds-1', meetingUrl: 'https://zoom.us/j/1', platform: 'zoom',
                    protocol: PROTOCOL,
                },
                { fetchImpl, tts: async () => Buffer.from('x'), stt: async () => 'x', startSession: async () => ({ sessionId: 'm' }) },
            ),
            /join failed HTTP 503/,
        );
    });
});
