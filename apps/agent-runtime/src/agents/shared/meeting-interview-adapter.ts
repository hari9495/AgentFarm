/**
 * meeting-interview-adapter.ts — the LIVE wire for the interview engine.
 *
 * Turns the engine's injected ask/listen into real meeting I/O:
 *   • join the meeting via the desktop-agent
 *   • ask  → TTS (speakResponse) → POST /v1/desktop-sessions/:id/speak
 *   • listen → POST /v1/desktop-sessions/:id/capture-audio → Voicebox STT
 *   • classify → naive length heuristic (see note)
 * then runs runProtocolInterview and returns the scored result + meetingSessionId.
 *
 * All external effects (fetch, TTS, STT, session-create) are injectable so the
 * orchestration is unit-testable without a live media stack; the defaults are the
 * real primitives.
 */

import { startMeetingSession, type MeetingPlatform } from '../meeting-agent/meeting-transcription.js';
import { logMeetingEvent } from '../meeting-agent/meeting-audit-logger.js';
import { speakResponse } from '../../speaking-agent.js';
import { VoiceboxClient } from '../../voicebox-client.js';
import {
    runProtocolInterview,
    type AnswerClassification,
    type InterviewIO,
    type InterviewQuestionSpec,
    type ProtocolInterviewResult,
} from './interview-engine.js';

/**
 * Injected client an agent action calls to run a protocol interview over a live
 * meeting. The executor defaults it to runMeetingProtocolInterview; tests pass a
 * fake. Shared by recruiter (phone screen) and BA (requirements elicitation).
 */
export type MeetingProtocolInterviewClient = (input: {
    tenantId: string;
    workspaceId: string;
    agentId: string;
    desktopSessionId: string;
    meetingUrl: string;
    platform: string;
    protocol: InterviewQuestionSpec[];
    opening?: string;
    closing?: string;
    language?: string;
}) => Promise<ProtocolInterviewResult & { meetingSessionId?: string }>;

export interface MeetingProtocolInterviewParams {
    tenantId: string;
    workspaceId: string;
    agentId: string;
    desktopSessionId: string;
    meetingUrl: string;
    platform: MeetingPlatform;
    protocol: InterviewQuestionSpec[];
    opening?: string;
    closing?: string;
    voiceId?: string;
    language?: string;
    captureDurationSeconds?: number;
    gatewayUrl?: string;
}

/** Injectable effects — defaults are the real primitives; tests pass fakes. */
export interface MeetingInterviewDeps {
    fetchImpl?: typeof fetch;
    tts?: (text: string, voiceId: string, language: string) => Promise<Buffer>;
    stt?: (audio: Buffer) => Promise<string>;
    startSession?: typeof startMeetingSession;
    classify?: (question: string, answer: string) => AnswerClassification | Promise<AnswerClassification>;
}

const gatewayBase = (override?: string): string =>
    (override ?? process.env['API_GATEWAY_URL'] ?? '').replace(/\/+$/u, '');

// ponytail: naive length heuristic — no LLM, deterministic. Swap for the LLM
// classifier when transcript quality makes the extra call worth it.
const heuristicClassify = (_question: string, answer: string): AnswerClassification => {
    const words = answer.trim().split(/\s+/u).filter(Boolean);
    if (words.length < 3) return 'not_answered';
    if (words.length < 12) return 'partially_answered';
    return 'fully_answered';
};

export async function runMeetingProtocolInterview(
    params: MeetingProtocolInterviewParams,
    deps: MeetingInterviewDeps = {},
): Promise<ProtocolInterviewResult & { meetingSessionId: string }> {
    const fetchImpl = deps.fetchImpl ?? fetch;
    const tts = deps.tts ?? speakResponse;
    const stt = deps.stt ?? ((audio: Buffer) => new VoiceboxClient().transcribeAudio(audio, 'audio/wav').then((r) => r.text));
    const startSession = deps.startSession ?? startMeetingSession;
    const classify = deps.classify ?? heuristicClassify;

    const base = gatewayBase(params.gatewayUrl);
    const {
        tenantId, workspaceId, agentId, desktopSessionId, meetingUrl, platform,
        voiceId = '', language = 'en', captureDurationSeconds = 20,
    } = params;

    // 1 — Join the meeting via the desktop-agent.
    const joinRes = await fetchImpl(
        `${base}/v1/desktop-sessions/${encodeURIComponent(desktopSessionId)}/join-meeting`,
        {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ meetingUrl, platform }),
            signal: AbortSignal.timeout(60_000),
        },
    );
    if (!joinRes.ok) {
        throw new Error(`[meeting-interview] join failed HTTP ${joinRes.status}`);
    }

    // 2 — Create the gateway meeting-session record.
    const { sessionId: meetingSessionId } = await startSession({ tenantId, workspaceId, agentId, meetingUrl, platform });
    await logMeetingEvent({
        meetingSessionId, tenantId, workspaceId, agentId, platform,
        eventType: 'joined', summary: `Agent joined ${platform} meeting for a protocol interview`,
        payload: { meetingUrl, desktopSessionId, questions: params.protocol.length },
    }).catch(() => {});

    // 3 — Build the live I/O and run the engine.
    const io: InterviewIO = {
        ask: async (text) => {
            const audio = await tts(text, voiceId, language);
            if (!audio || audio.length === 0) return;
            await fetchImpl(
                `${base}/v1/desktop-sessions/${encodeURIComponent(desktopSessionId)}/speak`,
                {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ audioBase64: audio.toString('base64'), format: 'wav' }),
                    signal: AbortSignal.timeout(30_000),
                },
            );
        },
        listen: async () => {
            const res = await fetchImpl(
                `${base}/v1/desktop-sessions/${encodeURIComponent(desktopSessionId)}/capture-audio`,
                {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ durationSeconds: captureDurationSeconds }),
                    signal: AbortSignal.timeout((captureDurationSeconds + 15) * 1_000),
                },
            );
            if (!res.ok) return '';
            const body = (await res.json()) as { audioBase64?: string };
            if (!body.audioBase64) return '';
            return stt(Buffer.from(body.audioBase64, 'base64'));
        },
        classify: async (question, answer) => classify(question, answer),
    };

    const result = await runProtocolInterview({
        protocol: params.protocol,
        io,
        ...(params.opening ? { opening: params.opening } : {}),
        ...(params.closing ? { closing: params.closing } : {}),
    });

    await logMeetingEvent({
        meetingSessionId, tenantId, workspaceId, agentId, platform,
        eventType: 'left',
        summary: `Agent completed protocol interview (${result.results.filter((r) => r.status === 'answered').length}/${result.results.length} answered)`,
    }).catch(() => {});

    return { ...result, meetingSessionId };
}
