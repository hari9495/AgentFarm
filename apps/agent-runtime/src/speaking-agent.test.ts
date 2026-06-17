import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    cloneAgentVoice,
    speakResponse,
    listenAndRespond,
    runSpeakingAgentLoop,
    shouldRespond,
    buildSystemPrompt,
    resetMeetingHistory,
    fetchRecentWorkContext,
} from './speaking-agent.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fakeJsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
    });
}

function fakeBinaryResponse(bytes: Buffer, status = 200): Response {
    return new Response(new Uint8Array(bytes).buffer, {
        status,
        headers: { 'content-type': 'audio/wav' },
    });
}

function makeWavBytes(samples = 4): Buffer {
    const dataSize = samples * 2; // 16-bit PCM mono
    const buf = Buffer.alloc(44 + dataSize, 0);
    buf.write('RIFF', 0, 'ascii');
    buf.writeUInt32LE(36 + dataSize, 4);
    buf.write('WAVE', 8, 'ascii');
    buf.write('fmt ', 12, 'ascii');
    buf.writeUInt32LE(16, 16);
    buf.writeUInt16LE(1, 20);  // PCM
    buf.writeUInt16LE(1, 22);  // mono
    buf.writeUInt32LE(48000, 24);
    buf.writeUInt32LE(96000, 28);
    buf.writeUInt16LE(2, 32);
    buf.writeUInt16LE(16, 34);
    buf.write('data', 36, 'ascii');
    buf.writeUInt32LE(dataSize, 40);
    return buf;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const _savedApiKey = process.env['ANTHROPIC_API_KEY'];
process.env['ANTHROPIC_API_KEY'] = process.env['ANTHROPIC_API_KEY'] || 'test-key-for-mock';

describe('speaking-agent', () => {
    // -----------------------------------------------------------------------
    // cloneAgentVoice
    // -----------------------------------------------------------------------

    it('cloneAgentVoice returns a voiceId string', async (t) => {
        // Both calls (clone-voice + PATCH session) return the same fake JSON;
        // cloneVoice reads voice_id from the first call.
        t.mock.method(globalThis, 'fetch', async () =>
            fakeJsonResponse({ voice_id: 'clone-abc', name: 'agent-sess-1', language: 'en' }),
        );

        const result = await cloneAgentVoice('sess-1', Buffer.from('fake-audio'));

        assert.equal(typeof result, 'string');
        assert.equal(result, 'clone-abc');
    });

    it('cloneAgentVoice patches the meeting session with the voiceId', async (t) => {
        const calls: Array<{ url: string; method: string; body: string }> = [];

        t.mock.method(globalThis, 'fetch', async (url: string, opts: RequestInit) => {
            calls.push({
                url: String(url),
                method: opts.method ?? 'GET',
                body: (opts.body as string) ?? '',
            });
            return fakeJsonResponse({ voice_id: 'patch-xyz', name: 'agent-sess-patch', language: 'en' });
        });

        await cloneAgentVoice('sess-patch', Buffer.from('audio-bytes'));

        assert.equal(calls.length, 2, 'expected 2 fetch calls (clone + patch)');

        const patchCall = calls[1]!;
        assert.equal(patchCall.method, 'PATCH');
        assert.ok(patchCall.url.includes('sess-patch'), 'PATCH URL should contain sessionId');

        const body = JSON.parse(patchCall.body) as Record<string, unknown>;
        assert.equal(body['agentVoiceId'], 'patch-xyz');
    });

    // -----------------------------------------------------------------------
    // speakResponse
    // -----------------------------------------------------------------------

    it('speakResponse returns a Buffer', async (t) => {
        const fakeWav = makeWavBytes();
        t.mock.method(globalThis, 'fetch', async () => fakeBinaryResponse(fakeWav));

        const result = await speakResponse('Hello there', 'voice-123', 'en');

        assert.ok(result instanceof Buffer, 'result should be a Buffer');
        assert.deepEqual(result, fakeWav);
    });

    it('speakResponse passes language to synthesize endpoint', async (t) => {
        let capturedBody: string | null = null;
        t.mock.method(globalThis, 'fetch', async (_url: string, opts: RequestInit) => {
            capturedBody = opts.body as string;
            return fakeBinaryResponse(makeWavBytes());
        });

        await speakResponse('こんにちは', 'voice-ja', 'ja');

        assert.ok(capturedBody !== null, 'fetch body should be captured');
        const parsed = JSON.parse(capturedBody) as Record<string, unknown>;
        assert.equal(parsed['language'], 'ja');
    });

    // -----------------------------------------------------------------------
    // listenAndRespond
    // -----------------------------------------------------------------------

    it('listenAndRespond returns a Buffer', async (t) => {
        const fakeWav = makeWavBytes();
        resetMeetingHistory('sess-listen');

        // Sequential responses for each fetch call in order:
        // 1. GET /v1/meetings/:sessionId  (standup session — gate auto-passes)
        // 2. POST /v1/transcribe          (VoiceboxClient multipart → TranscribeResult)
        // 3. POST anthropic.com           (Anthropic → content block)
        // 4. POST /v1/synthesize          (Voicebox → WAV bytes)
        const responses = [
            fakeJsonResponse({
                agentVoiceId: 'voice-loop',
                speakingEnabled: true,
                meetingPurpose: 'standup',
            }),
            fakeJsonResponse({ text: 'test input text', language: 'en', confidence: 0.95 }),
            fakeJsonResponse({ content: [{ type: 'text', text: 'Agent reply here.' }] }),
            fakeBinaryResponse(fakeWav),
        ];
        let callIdx = 0;
        t.mock.method(globalThis, 'fetch', async () => responses[callIdx++]!);

        const result = await listenAndRespond('sess-listen', Buffer.from('audio'), 'en');

        assert.ok(result instanceof Buffer, 'result should be a Buffer');
        assert.deepEqual(result, fakeWav);
    });

    it('listenAndRespond returns empty buffer when transcript is silence', async (t) => {
        resetMeetingHistory('sess-silence');
        const responses = [
            fakeJsonResponse({ agentVoiceId: 'v1', speakingEnabled: true }),
            fakeJsonResponse({ text: '   ', language: 'en', confidence: 0.1 }),
        ];
        let callIdx = 0;
        let totalCalls = 0;
        t.mock.method(globalThis, 'fetch', async () => {
            totalCalls++;
            return responses[callIdx++]!;
        });

        const result = await listenAndRespond('sess-silence', Buffer.from('audio'), 'en');

        assert.equal(result.length, 0, 'silence should produce empty buffer');
        assert.equal(totalCalls, 2, 'should not call Anthropic or TTS when gated out');
    });

    it('listenAndRespond skips Anthropic when not addressed by name and not a question', async (t) => {
        resetMeetingHistory('sess-nogate');
        const responses = [
            fakeJsonResponse({
                agentVoiceId: 'v1',
                speakingEnabled: true,
                meetingPurpose: 'design_review',
            }),
            fakeJsonResponse({ text: 'and then we ship it next week', language: 'en', confidence: 0.9 }),
        ];
        let callIdx = 0;
        let totalCalls = 0;
        t.mock.method(globalThis, 'fetch', async () => {
            totalCalls++;
            return responses[callIdx++]!;
        });

        const result = await listenAndRespond('sess-nogate', Buffer.from('audio'), 'en');

        assert.equal(result.length, 0);
        assert.equal(totalCalls, 2, 'should not call Anthropic when nobody addressed the agent');
    });

    it('listenAndRespond includes system prompt and conversation history in Anthropic call', async (t) => {
        const fakeWav = makeWavBytes();
        resetMeetingHistory('sess-history');

        let anthropicBody: Record<string, unknown> | null = null;
        const responses: Response[] = [
            // Turn 1
            fakeJsonResponse({
                agentVoiceId: 'voice-h',
                speakingEnabled: true,
                meetingPurpose: 'standup',
            }),
            fakeJsonResponse({ text: 'good morning team', language: 'en', confidence: 0.95 }),
            fakeJsonResponse({ content: [{ type: 'text', text: 'Morning everyone.' }] }),
            fakeBinaryResponse(fakeWav),
            // Turn 2
            fakeJsonResponse({
                agentVoiceId: 'voice-h',
                speakingEnabled: true,
                meetingPurpose: 'standup',
            }),
            fakeJsonResponse({ text: 'what did you ship yesterday', language: 'en', confidence: 0.95 }),
            fakeJsonResponse({ content: [{ type: 'text', text: 'I shipped Sprint 16 yesterday.' }] }),
            fakeBinaryResponse(fakeWav),
        ];
        let callIdx = 0;
        t.mock.method(globalThis, 'fetch', async (url: string, opts: RequestInit) => {
            const u = String(url);
            if (u.includes('anthropic.com')) {
                anthropicBody = JSON.parse(opts.body as string) as Record<string, unknown>;
            }
            return responses[callIdx++]!;
        });

        await listenAndRespond('sess-history', Buffer.from('a1'), 'en');
        await listenAndRespond('sess-history', Buffer.from('a2'), 'en');

        assert.ok(anthropicBody, 'should have captured an Anthropic call');
        assert.ok(typeof anthropicBody!['system'] === 'string', 'should send a system prompt');
        assert.ok(
            String(anthropicBody!['system']).toLowerCase().includes('standup'),
            'standup system prompt should mention standup',
        );

        const messages = anthropicBody!['messages'] as Array<{ role: string; content: string }>;
        assert.ok(Array.isArray(messages));
        // Turn 2 should include both turn-1 user, turn-1 assistant, and turn-2 user
        assert.equal(messages.length, 3, 'second turn should carry history (user, assistant, user)');
        assert.equal(messages[0]!.role, 'user');
        assert.equal(messages[0]!.content, 'good morning team');
        assert.equal(messages[1]!.role, 'assistant');
        assert.equal(messages[1]!.content, 'Morning everyone.');
        assert.equal(messages[2]!.role, 'user');
        assert.equal(messages[2]!.content, 'what did you ship yesterday');
    });

    // -----------------------------------------------------------------------
    // shouldRespond
    // -----------------------------------------------------------------------

    it('shouldRespond returns false for empty / whitespace transcripts', () => {
        assert.equal(shouldRespond('', 'Alex'), false);
        assert.equal(shouldRespond('   ', 'Alex'), false);
        assert.equal(shouldRespond('um', 'Alex'), false);
    });

    it('shouldRespond returns true when addressed by displayName', () => {
        assert.equal(shouldRespond('Hey Alex can you take a look', 'Alex'), true);
        assert.equal(shouldRespond('alex what do you think', 'Alex'), true);
    });

    it('shouldRespond returns true for questions even without name', () => {
        assert.equal(shouldRespond('Does anyone know how to fix this?', 'Alex'), true);
    });

    it('shouldRespond returns true for standup purpose regardless', () => {
        assert.equal(shouldRespond('moving on to next person', 'Alex', 'standup'), true);
    });

    it('shouldRespond returns false for non-addressed statements outside standup', () => {
        assert.equal(shouldRespond('and then we deploy on Friday', 'Alex'), false);
        assert.equal(shouldRespond('and then we deploy on Friday', 'Alex', 'design_review'), false);
    });

    // -----------------------------------------------------------------------
    // fetchRecentWorkContext
    // -----------------------------------------------------------------------

    it('fetchRecentWorkContext returns empty string when gateway returns no records', async (t) => {
        process.env['API_GATEWAY_URL'] = 'http://gw.test';
        t.mock.method(globalThis, 'fetch', async () => fakeJsonResponse({ botId: 'bot_1', count: 0, records: [] }));
        const result = await fetchRecentWorkContext('bot_1');
        assert.equal(result, '');
    });

    it('fetchRecentWorkContext returns empty string on HTTP error', async (t) => {
        process.env['API_GATEWAY_URL'] = 'http://gw.test';
        t.mock.method(globalThis, 'fetch', async () => fakeJsonResponse({ error: 'boom' }, 500));
        const result = await fetchRecentWorkContext('bot_1');
        assert.equal(result, '');
    });

    it('fetchRecentWorkContext returns empty string when fetch throws', async (t) => {
        process.env['API_GATEWAY_URL'] = 'http://gw.test';
        t.mock.method(globalThis, 'fetch', async () => { throw new Error('network down'); });
        const result = await fetchRecentWorkContext('bot_1');
        assert.equal(result, '');
    });

    it('fetchRecentWorkContext returns empty string when API_GATEWAY_URL is unset', async (t) => {
        const prev = process.env['API_GATEWAY_URL'];
        delete process.env['API_GATEWAY_URL'];
        try {
            let fetchCalls = 0;
            t.mock.method(globalThis, 'fetch', async () => { fetchCalls++; return fakeJsonResponse({}); });
            const result = await fetchRecentWorkContext('bot_1');
            assert.equal(result, '');
            assert.equal(fetchCalls, 0, 'should not call fetch when gateway URL is missing');
        } finally {
            if (prev !== undefined) process.env['API_GATEWAY_URL'] = prev;
        }
    });

    it('fetchRecentWorkContext formats completed / in-progress / failed sections', async (t) => {
        process.env['API_GATEWAY_URL'] = 'http://gw.test';
        t.mock.method(globalThis, 'fetch', async () => fakeJsonResponse({
            botId: 'bot_1',
            count: 3,
            records: [
                { id: 'a', actionType: 'git_commit', inputSummary: 'add login', outputSummary: 'sha abc', status: 'completed', createdAt: '2026-01-01', completedAt: '2026-01-01' },
                { id: 'b', actionType: 'workspace_create_pr', inputSummary: 'open PR', outputSummary: 'PR #42', status: 'in_progress', createdAt: '2026-01-01', completedAt: null },
                { id: 'c', actionType: 'test_run', inputSummary: 'run suite', outputSummary: 'failed 3', status: 'failed', createdAt: '2026-01-01', completedAt: '2026-01-01' },
            ],
        }));
        const result = await fetchRecentWorkContext('bot_1');
        assert.match(result, /Completed in the last 24h:/);
        assert.match(result, /\[git_commit\] add login → sha abc/);
        assert.match(result, /In progress:/);
        assert.match(result, /\[workspace_create_pr\] open PR → PR #42/);
        assert.match(result, /Failed \/ blocked:/);
        assert.match(result, /\[test_run\] run suite → failed 3/);
    });

    it('listenAndRespond fetches recent work for standup and includes it in system prompt', async (t) => {
        process.env['API_GATEWAY_URL'] = 'http://gw.test';
        process.env['GATEWAY_URL'] = 'http://gw.test';
        const fakeWav = makeWavBytes();
        resetMeetingHistory('sess-recent');

        let anthropicSystem: string | null = null;
        let recentWorkCalls = 0;
        const responses: Response[] = [
            // 1. GET meeting session (standup, with agentId+tenantId so recent-work fires)
            fakeJsonResponse({
                agentVoiceId: 'voice-r',
                speakingEnabled: true,
                meetingPurpose: 'standup',
                agentId: 'bot_recent',
                tenantId: 'tenant_1',
            }),
            // 2. POST /v1/transcribe
            fakeJsonResponse({ text: 'team meeting', language: 'en', confidence: 0.95 }),
            // 3. GET /v1/personas/:botId (loadPersonaForBot)
            fakeJsonResponse({ persona: null }),
            // 4. GET /v1/agents/:botId/recent-work
            fakeJsonResponse({
                botId: 'bot_recent',
                count: 1,
                records: [
                    { id: 'x', actionType: 'git_commit', inputSummary: 'fix bug', outputSummary: 'sha 123', status: 'completed', createdAt: '2026-01-01', completedAt: '2026-01-01' },
                ],
            }),
            // 5. POST anthropic
            fakeJsonResponse({ content: [{ type: 'text', text: 'Yesterday I fixed a bug.' }] }),
            // 6. POST /v1/synthesize
            fakeBinaryResponse(fakeWav),
        ];
        let callIdx = 0;
        t.mock.method(globalThis, 'fetch', async (url: string, opts: RequestInit) => {
            const u = String(url);
            if (u.includes('/recent-work')) recentWorkCalls++;
            if (u.includes('anthropic.com')) {
                anthropicSystem = (JSON.parse(opts.body as string) as { system: string }).system;
            }
            return responses[callIdx++] ?? fakeJsonResponse({});
        });

        await listenAndRespond('sess-recent', Buffer.from('a'), 'en');

        assert.equal(recentWorkCalls, 1, 'should call recent-work exactly once');
        assert.ok(anthropicSystem, 'should send a system prompt');
        assert.match(String(anthropicSystem), /factual summary of your recent work/);
        assert.match(String(anthropicSystem), /\[git_commit\] fix bug → sha 123/);
    });

    it('listenAndRespond reuses cached recent-work across turns (single fetch)', async (t) => {
        process.env['API_GATEWAY_URL'] = 'http://gw.test';
        process.env['GATEWAY_URL'] = 'http://gw.test';
        const fakeWav = makeWavBytes();
        resetMeetingHistory('sess-cache');

        let recentWorkCalls = 0;
        const sessionResp = () => fakeJsonResponse({
            agentVoiceId: 'v',
            speakingEnabled: true,
            meetingPurpose: 'standup',
            agentId: 'bot_cache',
            tenantId: 'tenant_1',
        });
        const personaResp = () => fakeJsonResponse({ persona: null });
        const recentResp = () => fakeJsonResponse({
            botId: 'bot_cache',
            count: 1,
            records: [{ id: 'x', actionType: 'git_commit', inputSummary: 'foo', outputSummary: 'bar', status: 'completed', createdAt: '2026-01-01', completedAt: '2026-01-01' }],
        });
        const anthropicResp = () => fakeJsonResponse({ content: [{ type: 'text', text: 'ok.' }] });
        const ttsResp = () => fakeBinaryResponse(fakeWav);

        // Turn 1: session, transcribe, persona, recent-work, anthropic, tts
        // Turn 2: session, transcribe, anthropic, tts  (persona cached 5min, recent-work cached per-session)
        const responses: Array<() => Response> = [
            sessionResp, () => fakeJsonResponse({ text: 'good morning', language: 'en', confidence: 0.9 }), personaResp, recentResp, anthropicResp, ttsResp,
            sessionResp, () => fakeJsonResponse({ text: 'what is next', language: 'en', confidence: 0.9 }), anthropicResp, ttsResp,
        ];
        let callIdx = 0;
        t.mock.method(globalThis, 'fetch', async (url: string) => {
            const u = String(url);
            if (u.includes('/recent-work')) recentWorkCalls++;
            return (responses[callIdx++] ?? (() => fakeJsonResponse({})))();
        });

        await listenAndRespond('sess-cache', Buffer.from('a1'), 'en');
        await listenAndRespond('sess-cache', Buffer.from('a2'), 'en');

        assert.equal(recentWorkCalls, 1, 'recent-work should be fetched once and cached');
    });

    it('listenAndRespond does NOT fetch recent-work for non-standup meetings', async (t) => {
        process.env['API_GATEWAY_URL'] = 'http://gw.test';
        process.env['GATEWAY_URL'] = 'http://gw.test';
        const fakeWav = makeWavBytes();
        resetMeetingHistory('sess-nostand');

        let recentWorkCalls = 0;
        const responses: Response[] = [
            fakeJsonResponse({
                agentVoiceId: 'v',
                speakingEnabled: true,
                meetingPurpose: 'design_review',
                agentId: 'bot_nostand',
                tenantId: 'tenant_1',
            }),
            fakeJsonResponse({ text: 'Alex what do you think', language: 'en', confidence: 0.9 }),
            fakeJsonResponse({ persona: { displayName: 'Alex' } }),
            fakeJsonResponse({ content: [{ type: 'text', text: 'Looks good.' }] }),
            fakeBinaryResponse(fakeWav),
        ];
        let callIdx = 0;
        t.mock.method(globalThis, 'fetch', async (url: string) => {
            const u = String(url);
            if (u.includes('/recent-work')) recentWorkCalls++;
            return responses[callIdx++] ?? fakeJsonResponse({});
        });

        await listenAndRespond('sess-nostand', Buffer.from('a'), 'en');

        assert.equal(recentWorkCalls, 0, 'non-standup meetings should not fetch recent work');
    });

    // -----------------------------------------------------------------------
    // buildSystemPrompt with recent work
    // -----------------------------------------------------------------------

    it('buildSystemPrompt includes recent work block and anti-hallucination note', () => {
        const prompt = buildSystemPrompt(
            { displayName: 'Alex', emailAddress: 'a@x.io', communicationStyle: 'professional', disclosureStatement: 'I am an AI agent.' } as any,
            'standup',
            'Completed in the last 24h:\n  - [git_commit] add login → sha abc',
        );
        assert.match(prompt, /factual summary of your recent work/);
        assert.match(prompt, /Do not invent tasks/);
        assert.match(prompt, /\[git_commit\] add login → sha abc/);
    });

    it('buildSystemPrompt omits work block when recentWork is empty', () => {
        const prompt = buildSystemPrompt(
            { displayName: 'Alex' } as any,
            'standup',
            '',
        );
        assert.doesNotMatch(prompt, /factual summary of your recent work/);
    });

    // -----------------------------------------------------------------------
    // buildSystemPrompt
    // -----------------------------------------------------------------------

    it('buildSystemPrompt includes persona name, email, disclosure', () => {
        const prompt = buildSystemPrompt(
            {
                botId: 'bot-1',
                displayName: 'Alex Chen',
                emailAddress: 'alex@example.com',
                avatarUrl: null,
                communicationStyle: 'concise',
                disclosureStatement: 'I am an AI developer agent.',
                language: 'en',
                timezone: 'UTC',
                workingHours: null,
            } as unknown as Parameters<typeof buildSystemPrompt>[0],
            'standup',
        );
        assert.ok(prompt.includes('Alex Chen'), 'should include displayName');
        assert.ok(prompt.includes('alex@example.com'), 'should include email');
        assert.ok(prompt.includes('I am an AI developer agent.'), 'should include disclosure');
        assert.ok(prompt.toLowerCase().includes('standup'), 'should include standup guidance');
        assert.ok(prompt.toLowerCase().includes('blocker'), 'standup guidance should mention blockers');
    });

    it('buildSystemPrompt degrades gracefully with null persona', () => {
        const prompt = buildSystemPrompt(null, null);
        assert.ok(prompt.length > 0);
        assert.ok(prompt.toLowerCase().includes('agent'));
    });

    // -----------------------------------------------------------------------
    // runSpeakingAgentLoop
    // -----------------------------------------------------------------------

    it('runSpeakingAgentLoop returns early if speakingEnabled is false', async (t) => {
        let fetchCallCount = 0;
        t.mock.method(globalThis, 'fetch', async () => {
            fetchCallCount++;
            return fakeJsonResponse({ agentVoiceId: null, speakingEnabled: false });
        });

        await runSpeakingAgentLoop('sess-disabled', 'en', { desktopSessionId: 'desktop-x' });

        // Only the one GET to check speakingEnabled should have been made
        assert.equal(fetchCallCount, 1, 'should only fetch the session once before returning early');
    });
});
