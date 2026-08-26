/**
 * interview-engine.ts — a generic, protocol-driven interview loop shared by any
 * agent that runs a structured conversation over a live meeting (recruiter phone
 * screens / interviews, BA requirements elicitation, …).
 *
 * The engine owns only the ORCHESTRATION — ask a question, listen, classify the
 * answer, probe once or twice, advance, and record a transcript + per-question
 * result. All I/O (speaking into the meeting, capturing/transcribing the reply,
 * classifying the answer) is INJECTED, so the engine is pure logic and fully
 * unit-testable without any media stack. The live adapter (desktop-agent speak +
 * capture + STT + LLM classify) plugs the same InterviewIO into a real call.
 *
 * This generalizes the previously BA-only, untested interview runner.
 */

export type AnswerClassification =
    | 'fully_answered'
    | 'partially_answered'
    | 'not_answered'
    | 'off_topic';

export interface InterviewQuestionSpec {
    id: string;
    question: string;
    /** Required questions must be at least partially answered for a "completed" run. Default true. */
    required?: boolean;
    /** Max follow-up probes before moving on. Default 1. */
    maxProbes?: number;
}

export interface InterviewIO {
    /** Deliver a line into the meeting (TTS + play). */
    ask(text: string): Promise<void>;
    /** Capture + transcribe the interviewee's reply. */
    listen(): Promise<string>;
    /** Classify the reply against the question. */
    classify(question: string, answer: string): Promise<AnswerClassification>;
    /** Optional probe/redirect line; a plain fallback is used when absent. */
    followUp?(question: string, answer: string, classification: AnswerClassification): Promise<string>;
}

export type QuestionStatus = 'answered' | 'partial' | 'unanswered' | 'skipped';

export interface InterviewQuestionResult {
    id: string;
    question: string;
    status: QuestionStatus;
    answer: string;
    probes: number;
}

export interface ProtocolInterviewResult {
    transcript: Array<{ speaker: 'agent' | 'interviewee'; text: string }>;
    results: InterviewQuestionResult[];
    /** True when every required question was at least partially answered. */
    completed: boolean;
    totalTurns: number;
}

export interface RunProtocolInterviewParams {
    protocol: InterviewQuestionSpec[];
    io: InterviewIO;
    opening?: string;
    closing?: string;
    /** Hard cap on ask→listen turns across the whole interview (loop guard). */
    maxTotalTurns?: number;
}

const defaultProbe = (question: string): string =>
    `Thanks — could you tell me a little more about that? ${question}`;

export async function runProtocolInterview(
    params: RunProtocolInterviewParams,
): Promise<ProtocolInterviewResult> {
    const { protocol, io } = params;
    const transcript: ProtocolInterviewResult['transcript'] = [];
    const results: InterviewQuestionResult[] = [];
    const maxTotal =
        params.maxTotalTurns ??
        protocol.reduce((n, q) => n + 1 + (q.maxProbes ?? 1), 0) + 1;
    let totalTurns = 0;

    const agentSay = async (text: string) => {
        await io.ask(text);
        transcript.push({ speaker: 'agent', text });
    };

    if (params.opening) await agentSay(params.opening);

    for (const q of protocol) {
        // Global turn budget spent — leave the rest unasked (marked skipped below).
        if (totalTurns >= maxTotal) break;

        const maxProbes = q.maxProbes ?? 1;
        let probes = 0;
        let answer = '';
        let status: QuestionStatus = 'unanswered';
        let askText = q.question;

        for (;;) {
            if (totalTurns >= maxTotal) break;
            totalTurns += 1;
            await agentSay(askText);
            answer = await io.listen();
            transcript.push({ speaker: 'interviewee', text: answer });

            const classification = await io.classify(q.question, answer);
            if (classification === 'fully_answered') {
                status = 'answered';
                break;
            }
            if (probes < maxProbes) {
                probes += 1;
                askText = io.followUp
                    ? await io.followUp(q.question, answer, classification)
                    : defaultProbe(q.question);
                continue;
            }
            status = classification === 'partially_answered' ? 'partial' : 'unanswered';
            break;
        }

        results.push({ id: q.id, question: q.question, status, answer, probes });
    }

    // Any question never reached (turn budget exhausted) → skipped.
    for (const q of protocol) {
        if (!results.some((r) => r.id === q.id)) {
            results.push({ id: q.id, question: q.question, status: 'skipped', answer: '', probes: 0 });
        }
    }

    if (params.closing) await agentSay(params.closing);

    const completed = protocol
        .filter((q) => q.required !== false)
        .every((q) => {
            const r = results.find((x) => x.id === q.id);
            return !!r && (r.status === 'answered' || r.status === 'partial');
        });

    return { transcript, results, completed, totalTurns };
}
