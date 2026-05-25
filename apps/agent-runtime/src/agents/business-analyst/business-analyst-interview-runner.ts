/**
 * Business Analyst — Interview Runner
 *
 * Drives a structured BA requirements-elicitation interview over a live meeting
 * session.  Builds on the existing meeting-agent infrastructure:
 *   • startMeetingSession / logMeetingEvent — gateway session lifecycle
 *   • VoiceboxClient.transcribeAudio        — STT (speech → text)
 *   • speakResponse                         — TTS (text → audio)
 *   • Desktop-agent /capture-audio + /speak — audio I/O via virtual audio sink
 *
 * Loop structure (per turn):
 *   1. Get next question from the interview protocol state machine
 *   2. Synthesize question audio and play it into the meeting (speak)
 *   3. Capture the stakeholder's audio response
 *   4. Transcribe via VoiceboxClient
 *   5. Classify: fully_answered → advance; partially_answered → probe;
 *                not_answered → retry (max 2); off_topic → redirect
 *   6. Update session state and repeat until all required topics are covered
 *      or maxTurns is exhausted
 *   7. Speak a closing summary
 *   8. Write elicited requirements to long-term memory
 *   9. Return the completed interview result
 */

import { VoiceboxClient } from '../../voicebox-client.js';
import { startMeetingSession, logMeetingEvent } from '../meeting-agent/meeting-transcription.js';
import type {
    MeetingPlatform,
    MeetingProviderExecutor,
} from '../meeting-agent/meeting-transcription.js';
import { speakResponse } from '../../speaking-agent.js';
import type { BaProseCallerFn } from './business-analyst-tone-adapter.js';
import {
    createInterviewSessionState,
    getNextTopic,
    getQuestionTextForTopic,
    isInterviewComplete,
    applyAnsweredTopic,
    applyProbedTopic,
    applySkippedTopic,
    appendTranscriptEntry,
    completeSession,
    buildInterviewClosing,
    INTERVIEW_OPENING,
    INTERVIEW_PROTOCOL,
    MAX_TURNS_PER_TOPIC,
    type BaInterviewSessionState,
    type ElicitedRequirement,
} from './business-analyst-interview-protocol.js';
import {
    classifyAnswer,
    buildRedirectPhrase,
    type AnswerClassification,
} from './business-analyst-interview-classifier.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BaInterviewParams {
    tenantId: string;
    workspaceId: string;
    agentId: string;
    /** Desktop VM session ID for audio I/O via the virtual audio sink. */
    desktopSessionId: string;
    meetingUrl: string;
    platform: MeetingPlatform;
    /** Agent's cloned voice ID for TTS. Empty string falls back to platform default. */
    voiceId: string;
    language?: string;
    /**
     * Hard cap on total turns across all topics.
     * Prevents infinite loops in edge cases.
     * Default: 40 (8 topics × 5 turns max each).
     */
    maxTotalTurns?: number;
    /** Seconds of audio to capture per stakeholder turn. Default: 20. */
    captureDurationSeconds?: number;
    /**
     * Gateway base URL for the long-term memory write.
     * Defaults to process.env.API_GATEWAY_URL.
     */
    gatewayUrl?: string;
}

export interface BaInterviewResult {
    meetingSessionId: string;
    elicitedRequirements: ElicitedRequirement[];
    /** Full interview transcript for audit. */
    transcript: Array<{ speaker: 'agent' | 'stakeholder'; text: string; timestamp: string }>;
    topicSummary: Record<string, { status: string; extractedInfo: string }>;
    completedAt: string;
    totalTurns: number;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const gatewayBase = (override?: string): string =>
    (override ?? process.env['API_GATEWAY_URL'] ?? '').replace(/\/+$/, '');

const anthropicApiKey = (): string =>
    process.env['ANTHROPIC_API_KEY'] ?? '';

/** Speak a text string into the meeting via the desktop-agent audio sink. */
async function speakIntoMeeting(
    desktopSessionId: string,
    text: string,
    voiceId: string,
    language: string,
    gatewayUrl: string,
): Promise<void> {
    let audioBuffer: Buffer;
    try {
        audioBuffer = await speakResponse(text, voiceId, language);
    } catch (err) {
        console.warn(`[ba-interview] TTS synthesis failed: ${String(err)}`);
        return;
    }

    if (!audioBuffer || audioBuffer.length === 0) return;

    const base = gatewayBase(gatewayUrl);
    const res = await fetch(
        `${base}/v1/desktop-sessions/${encodeURIComponent(desktopSessionId)}/speak`,
        {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                audioBase64: audioBuffer.toString('base64'),
                format: 'wav',
            }),
            signal: AbortSignal.timeout(30_000),
        },
    );

    if (!res.ok) {
        console.warn(`[ba-interview] speak HTTP ${res.status} for desktop session ${desktopSessionId}`);
    }
}

/** Capture audio from the meeting and return the Buffer, or null on failure. */
async function captureFromMeeting(
    desktopSessionId: string,
    captureDurationSeconds: number,
    gatewayUrl: string,
): Promise<Buffer | null> {
    const base = gatewayBase(gatewayUrl);
    try {
        const res = await fetch(
            `${base}/v1/desktop-sessions/${encodeURIComponent(desktopSessionId)}/capture-audio`,
            {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ durationSeconds: captureDurationSeconds }),
                signal: AbortSignal.timeout((captureDurationSeconds + 15) * 1_000),
            },
        );

        if (!res.ok) {
            console.warn(`[ba-interview] capture-audio HTTP ${res.status}`);
            return null;
        }

        const body = (await res.json()) as { audioBase64?: string };
        if (!body.audioBase64) return null;

        return Buffer.from(body.audioBase64, 'base64');
    } catch (err) {
        console.warn(`[ba-interview] capture-audio failed: ${String(err)}`);
        return null;
    }
}

/**
 * Write a single elicited requirement to long-term memory via the gateway.
 * Fire-and-forget — failures are logged but never thrown.
 */
async function persistRequirementToMemory(
    requirement: ElicitedRequirement,
    workspaceId: string,
    tenantId: string,
    gatewayUrl: string,
): Promise<void> {
    const base = gatewayBase(gatewayUrl);
    if (!base) return;

    try {
        const res = await fetch(`${base}/v1/memory/patterns`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                tenantId,
                workspaceId,
                pattern: JSON.stringify({
                    type: 'elicited_requirement',
                    requirementId: requirement.id,
                    topic: requirement.topic,
                    text: requirement.text,
                    source: requirement.source,
                }),
                confidence: requirement.confidence,
                observedCount: 1,
                lastSeen: new Date().toISOString(),
            }),
            signal: AbortSignal.timeout(10_000),
        });

        if (!res.ok) {
            console.warn(`[ba-interview] memory write failed for requirement ${requirement.id}: HTTP ${res.status}`);
        }
    } catch (err) {
        console.warn(`[ba-interview] memory write error for requirement ${requirement.id}: ${String(err)}`);
    }
}

// ---------------------------------------------------------------------------
// Main interview runner
// ---------------------------------------------------------------------------

/**
 * Join a video meeting and run a structured BA requirements-elicitation
 * interview using the protocol state machine and LLM classifier.
 *
 * The interview concludes when:
 *   - All required topics are answered or skipped, OR
 *   - maxTotalTurns is exhausted
 *
 * On completion, elicited requirements are persisted to long-term memory.
 */
export async function runBaInterviewSession(
    params: BaInterviewParams,
    caller: BaProseCallerFn,
    executor: MeetingProviderExecutor,
): Promise<BaInterviewResult> {
    const {
        tenantId,
        workspaceId,
        agentId,
        desktopSessionId,
        meetingUrl,
        platform,
        voiceId,
        language = 'en',
        maxTotalTurns = 40,
        captureDurationSeconds = 20,
        gatewayUrl,
    } = params;

    const base = gatewayBase(gatewayUrl);

    // ------------------------------------------------------------------
    // Step 1 — Join the meeting via desktop-agent
    // ------------------------------------------------------------------
    const joinRes = await fetch(
        `${base}/v1/desktop-sessions/${encodeURIComponent(desktopSessionId)}/join-meeting`,
        {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ meetingUrl, platform }),
            signal: AbortSignal.timeout(60_000),
        },
    );
    if (!joinRes.ok) {
        const errText = await joinRes.text().catch(() => '');
        throw new Error(`[ba-interview] join-meeting failed HTTP ${joinRes.status}: ${errText}`);
    }

    // ------------------------------------------------------------------
    // Step 2 — Create a MeetingSession record in the gateway
    // ------------------------------------------------------------------
    const { sessionId: meetingSessionId } = await startMeetingSession({
        tenantId,
        workspaceId,
        agentId,
        meetingUrl,
        platform,
    });

    await logMeetingEvent({
        meetingSessionId,
        tenantId,
        workspaceId,
        agentId,
        platform,
        eventType: 'joined',
        summary: `BA interview agent joined ${platform} meeting`,
        payload: { meetingUrl, desktopSessionId, interviewMode: 'requirements_elicitation' },
    });

    // ------------------------------------------------------------------
    // Step 3 — Initialise the interview state machine
    // ------------------------------------------------------------------
    let session: BaInterviewSessionState = createInterviewSessionState(meetingSessionId);

    // ------------------------------------------------------------------
    // Step 4 — Speak the opening
    // ------------------------------------------------------------------
    await speakIntoMeeting(desktopSessionId, INTERVIEW_OPENING, voiceId, language, gatewayUrl ?? '');
    session = appendTranscriptEntry(session, 'agent', INTERVIEW_OPENING);

    await logMeetingEvent({
        meetingSessionId,
        tenantId,
        workspaceId,
        agentId,
        platform,
        eventType: 'spoke',
        summary: 'BA interview opening delivered',
    });

    // ------------------------------------------------------------------
    // Step 5 — Interview loop
    // ------------------------------------------------------------------
    let totalTurns = 0;

    while (totalTurns < maxTotalTurns && !isInterviewComplete(session)) {
        const currentTopic = getNextTopic(session);
        if (!currentTopic) break;

        const topicState = session.topicStates[currentTopic];
        const protocolQuestion = INTERVIEW_PROTOCOL.find((q) => q.topic === currentTopic);

        // Exhausted max turns on this topic — skip it
        if (topicState.turnsSpent >= MAX_TURNS_PER_TOPIC) {
            session = applySkippedTopic(session, currentTopic);
            await logMeetingEvent({
                meetingSessionId,
                tenantId,
                workspaceId,
                agentId,
                platform,
                eventType: 'spoke',
                severity: 'warn',
                summary: `Topic "${currentTopic}" skipped after ${MAX_TURNS_PER_TOPIC} turns`,
            });
            continue;
        }

        // Determine the question / probe to ask
        const questionText = getQuestionTextForTopic(currentTopic, topicState);

        // -- Speak the question --
        await speakIntoMeeting(desktopSessionId, questionText, voiceId, language, gatewayUrl ?? '');
        session = appendTranscriptEntry(session, 'agent', questionText);
        totalTurns++;

        await logMeetingEvent({
            meetingSessionId,
            tenantId,
            workspaceId,
            agentId,
            platform,
            eventType: 'spoke',
            summary: `Asked topic "${currentTopic}" turn ${topicState.turnsSpent + 1}`,
            payload: { topic: currentTopic, questionText },
        });

        // -- Capture audio response --
        const audioBuffer = await captureFromMeeting(desktopSessionId, captureDurationSeconds, gatewayUrl ?? '');

        if (!audioBuffer) {
            // Capture failed — treat as no answer, try next loop iteration
            console.warn(`[ba-interview] audio capture failed on turn ${totalTurns}, retrying`);
            continue;
        }

        // -- Transcribe --
        const voicebox = new VoiceboxClient();
        let transcribedText = '';
        try {
            const transcribed = await voicebox.transcribeAudio(audioBuffer, 'audio/wav');
            transcribedText = (transcribed.text ?? '').trim();
        } catch (transcribeErr) {
            console.warn(`[ba-interview] transcription failed: ${String(transcribeErr)}`);
        }

        if (transcribedText) {
            session = appendTranscriptEntry(session, 'stakeholder', transcribedText);
        }

        await logMeetingEvent({
            meetingSessionId,
            tenantId,
            workspaceId,
            agentId,
            platform,
            eventType: 'transcribed',
            summary: `Stakeholder answer transcribed — ${transcribedText.split(/\s+/).length} words`,
            payload: { topic: currentTopic, wordCount: transcribedText.split(/\s+/).length },
        });

        // -- Classify the answer --
        const classification = await classifyAnswer(
            {
                question: questionText,
                answer: transcribedText,
                topic: currentTopic,
                minAnswerWords: protocolQuestion?.minAnswerWords ?? 5,
            },
            caller,
        );

        await logMeetingEvent({
            meetingSessionId,
            tenantId,
            workspaceId,
            agentId,
            platform,
            eventType: 'listened',
            summary: `Answer classified as "${classification.classification}" for topic "${currentTopic}"`,
            payload: {
                topic: currentTopic,
                classification: classification.classification,
                requirementsExtracted: classification.elicitedRequirements.length,
            },
        });

        // -- Act on classification --
        const action = pickAction(classification.classification, topicState.turnsSpent);

        if (action === 'advance') {
            session = applyAnsweredTopic(
                session,
                currentTopic,
                classification.extractedInfo,
                classification.elicitedRequirements,
            );

            // Acknowledge and bridge to the next topic
            const acknowledgement = buildAcknowledgement(currentTopic, classification.extractedInfo);
            await speakIntoMeeting(desktopSessionId, acknowledgement, voiceId, language, gatewayUrl ?? '');
            session = appendTranscriptEntry(session, 'agent', acknowledgement);

        } else if (action === 'probe') {
            session = applyProbedTopic(
                session,
                currentTopic,
                classification.extractedInfo,
                classification.elicitedRequirements,
            );
            // The probe question itself is handled on the next iteration
            // via getQuestionTextForTopic() picking the next probe index

        } else if (action === 'redirect') {
            const redirect = buildRedirectPhrase(currentTopic);
            await speakIntoMeeting(desktopSessionId, redirect, voiceId, language, gatewayUrl ?? '');
            session = appendTranscriptEntry(session, 'agent', redirect);
            // Don't advance — next iteration re-asks the same topic

        } else {
            // action === 'retry' or 'skip'
            if (topicState.turnsSpent + 1 >= MAX_TURNS_PER_TOPIC) {
                session = applySkippedTopic(session, currentTopic);
            }
            // Otherwise we just let the loop increment turnsSpent on the next probe
        }
    }

    // ------------------------------------------------------------------
    // Step 6 — Speak closing summary
    // ------------------------------------------------------------------
    session = completeSession(session);
    const closing = buildInterviewClosing(session);
    await speakIntoMeeting(desktopSessionId, closing, voiceId, language, gatewayUrl ?? '');
    session = appendTranscriptEntry(session, 'agent', closing);

    await logMeetingEvent({
        meetingSessionId,
        tenantId,
        workspaceId,
        agentId,
        platform,
        eventType: 'summarised',
        summary: `BA interview complete — ${session.elicitedRequirements.length} requirements elicited`,
        payload: {
            requirementCount: session.elicitedRequirements.length,
            totalTurns,
        },
    });

    await logMeetingEvent({
        meetingSessionId,
        tenantId,
        workspaceId,
        agentId,
        platform,
        eventType: 'left',
        summary: 'BA interview agent left the meeting',
    });

    // ------------------------------------------------------------------
    // Step 7 — Persist elicited requirements to long-term memory
    // ------------------------------------------------------------------
    await Promise.allSettled(
        session.elicitedRequirements.map((req) =>
            persistRequirementToMemory(req, workspaceId, tenantId, gatewayUrl ?? ''),
        ),
    );

    // ------------------------------------------------------------------
    // Step 8 — Notify via executor (e.g. post summary to Slack)
    // ------------------------------------------------------------------
    try {
        const summaryLines = [
            `📋 *BA Interview Complete — ${session.elicitedRequirements.length} Requirements Elicited*`,
            '',
            ...INTERVIEW_PROTOCOL.map((q) => {
                const state = session.topicStates[q.topic];
                const icon =
                    state.status === 'answered' ? '✅' :
                    state.status === 'skipped' ? '⏭️' : '⬜';
                return `${icon} *${formatTopicName(q.topic)}*: ${state.extractedInfo || '_No information captured_'}`;
            }),
            '',
            `_Total turns: ${totalTurns} | Requirements ready for review_`,
        ];

        await executor({
            connectorType: 'slack',
            actionType: 'send_message',
            payload: { text: summaryLines.join('\n'), language },
            attempt: 1,
            secretRefId: null,
        });
    } catch (notifyErr) {
        console.warn(`[ba-interview] Slack notification failed (non-fatal): ${String(notifyErr)}`);
    }

    // ------------------------------------------------------------------
    // Return
    // ------------------------------------------------------------------
    return {
        meetingSessionId,
        elicitedRequirements: session.elicitedRequirements,
        transcript: session.transcriptHistory,
        topicSummary: Object.fromEntries(
            Object.entries(session.topicStates).map(([topic, state]) => [
                topic,
                { status: state.status, extractedInfo: state.extractedInfo },
            ]),
        ),
        completedAt: session.completedAt ?? new Date().toISOString(),
        totalTurns,
    };
}

// ---------------------------------------------------------------------------
// Decision helpers
// ---------------------------------------------------------------------------

type TurnAction = 'advance' | 'probe' | 'redirect' | 'retry';

/**
 * Map a classification + turn count to a concrete action.
 *
 * Strategy:
 *   fully_answered → always advance
 *   partially_answered → probe on first partial; skip after that
 *   off_topic → redirect once; advance after two redirects (stakeholder intent unclear)
 *   not_answered → retry once; skip on second failure
 */
function pickAction(
    classification: AnswerClassification,
    turnsSpent: number,
): TurnAction {
    switch (classification) {
        case 'fully_answered':
            return 'advance';
        case 'partially_answered':
            return turnsSpent < MAX_TURNS_PER_TOPIC - 1 ? 'probe' : 'advance';
        case 'off_topic':
            return turnsSpent < 2 ? 'redirect' : 'advance';
        case 'not_answered':
            return turnsSpent < MAX_TURNS_PER_TOPIC - 1 ? 'retry' : 'advance';
    }
}

// ---------------------------------------------------------------------------
// Acknowledgement phrases
// ---------------------------------------------------------------------------

/**
 * Build a brief acknowledgement that confirms the agent heard the answer and
 * bridges naturally to the next topic.
 */
function buildAcknowledgement(topic: InterviewTopic, extractedInfo: string): string {
    const bridges: Record<InterviewTopic, string> = {
        business_context: "That gives me a clear picture of the problem space.",
        current_state: "Good — that helps me understand the starting point.",
        pain_points: "Understood, those are important pain points to document.",
        stakeholders: "Good, that helps me map the stakeholder landscape.",
        success_criteria: "Clear. Those success criteria will anchor the acceptance criteria.",
        constraints: "Noted. Those constraints will shape the solution options.",
        assumptions: "Good. Capturing those assumptions now will help manage risk.",
        timeline: "Got it. I'll factor that into the requirements prioritisation.",
    };

    const bridge = bridges[topic] ?? "Thank you, that's helpful.";
    const infoNote = extractedInfo
        ? ` I've noted: "${extractedInfo.slice(0, 120)}${extractedInfo.length > 120 ? '…' : ''}"`
        : '';
    return `${bridge}${infoNote} Let me move on to the next question.`;
}

function formatTopicName(topic: InterviewTopic): string {
    return topic
        .split('_')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
}
