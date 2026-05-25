/**
 * Business Analyst — Interview Protocol
 *
 * Defines the structured requirements-elicitation question bank and the
 * interview state machine used by the BA interview runner.
 *
 * All exports are PURE — no I/O, no LLM calls.  The runner (business-analyst-
 * interview-runner.ts) drives the state machine by calling these helpers in
 * sequence and threading the updated session through each turn.
 *
 * Protocol structure:
 *   8 topics in priority order: business_context → current_state → pain_points
 *   → stakeholders → success_criteria → constraints → assumptions → timeline
 *
 *   Each topic has one primary question plus 2 probe questions for when the
 *   first answer is incomplete.  The classifier decides which path to take.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type InterviewTopic =
    | 'business_context'
    | 'current_state'
    | 'pain_points'
    | 'stakeholders'
    | 'success_criteria'
    | 'constraints'
    | 'assumptions'
    | 'timeline';

/** Lifecycle of a single topic within an interview session. */
export type TopicStatus =
    | 'pending'   // Not yet asked
    | 'probed'    // Primary question asked but answer was partial; probe sent
    | 'answered'  // Sufficient information captured
    | 'skipped';  // Moved on after max retries without a full answer

export interface InterviewQuestion {
    id: string;
    topic: InterviewTopic;
    /** The primary question text to speak. */
    text: string;
    /**
     * Follow-up probe questions to use when the primary answer is incomplete.
     * Used in order — probe[0] first, then probe[1] if still incomplete.
     */
    probes: string[];
    /** Required topics must be answered before the interview can conclude. */
    isRequired: boolean;
    /**
     * Minimum word count in the stakeholder's answer to consider it non-trivial.
     * Answers below this threshold are classified as 'not_answered' without
     * calling the LLM classifier.
     */
    minAnswerWords: number;
}

export interface TopicState {
    topic: InterviewTopic;
    status: TopicStatus;
    /** Concise summary of information extracted across all turns on this topic. */
    extractedInfo: string;
    /** How many times we have asked / probed this topic. */
    turnsSpent: number;
    /** The probe index we have reached (0 = used probe[0], 1 = used probe[1]). */
    probeIndex: number;
}

/** A single requirement elicited from a stakeholder answer. */
export interface ElicitedRequirement {
    id: string;
    topic: InterviewTopic;
    /** Plain-language requirement statement (e.g. "The system must..."). */
    text: string;
    /** The verbatim stakeholder quote that led to this requirement. */
    source: string;
    confidence: number;
}

export interface TranscriptEntry {
    speaker: 'agent' | 'stakeholder';
    text: string;
    timestamp: string;
}

/** Full mutable state of a running BA interview session. */
export interface BaInterviewSessionState {
    /** Matches the MeetingSession record in the gateway. */
    meetingSessionId: string;
    currentTopic: InterviewTopic;
    topicStates: Record<InterviewTopic, TopicState>;
    transcriptHistory: TranscriptEntry[];
    elicitedRequirements: ElicitedRequirement[];
    status: 'active' | 'completed' | 'aborted';
    startedAt: string;
    completedAt?: string;
}

// ---------------------------------------------------------------------------
// Question bank — Standard Requirements Elicitation Protocol
// ---------------------------------------------------------------------------

export const INTERVIEW_PROTOCOL: InterviewQuestion[] = [
    {
        id: 'bc_1',
        topic: 'business_context',
        text: "Let's start with the big picture. What business problem or opportunity is this project addressing?",
        probes: [
            "What would happen to the business if this problem isn't solved in the next six months?",
            "How does this initiative connect to the company's strategic goals or OKRs?",
        ],
        isRequired: true,
        minAnswerWords: 8,
    },
    {
        id: 'cs_1',
        topic: 'current_state',
        text: "Walk me through how this process or system works today, end to end.",
        probes: [
            "What tools, systems, or manual steps are part of the current workflow?",
            "Roughly how many people are involved, and what does a typical day look like for them?",
        ],
        isRequired: true,
        minAnswerWords: 10,
    },
    {
        id: 'pp_1',
        topic: 'pain_points',
        text: "What are the biggest frustrations or pain points with the current situation?",
        probes: [
            "How often does that pain point occur, and what is the business impact when it does?",
            "Is there a specific incident or failure that triggered this project?",
        ],
        isRequired: true,
        minAnswerWords: 8,
    },
    {
        id: 'sh_1',
        topic: 'stakeholders',
        text: "Who are the key people or teams affected by this change — both those who would benefit and those who might be impacted negatively?",
        probes: [
            "Who has final sign-off authority on requirements and scope?",
            "Are there any groups who might resist this change, and why?",
        ],
        isRequired: true,
        minAnswerWords: 5,
    },
    {
        id: 'sc_1',
        topic: 'success_criteria',
        text: "What does success look like for this project? How will you know when it's done and done well?",
        probes: [
            "Are there measurable targets — like time saved, error rate reduction, or revenue impact?",
            "What is the minimum viable outcome that would still be acceptable to stakeholders?",
        ],
        isRequired: true,
        minAnswerWords: 8,
    },
    {
        id: 'co_1',
        topic: 'constraints',
        text: "Are there any constraints we need to work within — budget, technology, regulatory, or organisational?",
        probes: [
            "Are there existing systems we must integrate with that cannot be replaced or changed?",
            "Are there compliance, data privacy, or regulatory requirements that apply here?",
        ],
        isRequired: false,
        minAnswerWords: 5,
    },
    {
        id: 'as_1',
        topic: 'assumptions',
        text: "What assumptions are we making that, if proven wrong, would significantly change the scope or approach?",
        probes: [
            "Are there dependencies on other teams or projects that aren't confirmed yet?",
            "What risks are we knowingly accepting by proceeding with this approach?",
        ],
        isRequired: false,
        minAnswerWords: 5,
    },
    {
        id: 'tl_1',
        topic: 'timeline',
        text: "Is there a target date or deadline for this? And is there any flexibility if the scope changes?",
        probes: [
            "What is driving that date — a business event, contract, or regulatory deadline?",
            "If the full scope can't be delivered by then, which outcomes are non-negotiable?",
        ],
        isRequired: false,
        minAnswerWords: 3,
    },
];

/** Topics in the order they should be interviewed. */
export const TOPIC_ORDER: InterviewTopic[] = [
    'business_context',
    'current_state',
    'pain_points',
    'stakeholders',
    'success_criteria',
    'constraints',
    'assumptions',
    'timeline',
];

/** Maximum number of turns (primary + probes + retries) per topic before skipping. */
export const MAX_TURNS_PER_TOPIC = 3;

// ---------------------------------------------------------------------------
// State machine helpers
// ---------------------------------------------------------------------------

/** Create a fresh interview session state for a new meeting. */
export function createInterviewSessionState(
    meetingSessionId: string,
): BaInterviewSessionState {
    const topicStates = Object.fromEntries(
        TOPIC_ORDER.map((topic): [InterviewTopic, TopicState] => [
            topic,
            {
                topic,
                status: 'pending',
                extractedInfo: '',
                turnsSpent: 0,
                probeIndex: 0,
            },
        ]),
    ) as Record<InterviewTopic, TopicState>;

    return {
        meetingSessionId,
        currentTopic: 'business_context',
        topicStates,
        transcriptHistory: [],
        elicitedRequirements: [],
        status: 'active',
        startedAt: new Date().toISOString(),
    };
}

/**
 * Get the next question text to ask for the current topic.
 * Returns the primary question on the first turn, then probes in sequence.
 */
export function getQuestionTextForTopic(
    topic: InterviewTopic,
    topicState: TopicState,
): string {
    const question = INTERVIEW_PROTOCOL.find((q) => q.topic === topic);
    if (!question) return "Can you tell me more about that?";

    if (topicState.turnsSpent === 0) return question.text;

    const probeIdx = Math.min(topicState.probeIndex, question.probes.length - 1);
    return question.probes[probeIdx] ?? question.text;
}

/**
 * Advance the session to the next pending or probed topic.
 * Returns null when all topics have been answered or skipped.
 */
export function getNextTopic(
    session: BaInterviewSessionState,
): InterviewTopic | null {
    for (const topic of TOPIC_ORDER) {
        const state = session.topicStates[topic];
        if (state.status === 'pending' || state.status === 'probed') {
            return topic;
        }
    }
    return null;
}

/**
 * Return true when the interview should conclude:
 *   - All required topics are answered or skipped, AND
 *   - All optional topics are answered, skipped, or still pending (optional can be skipped at wrap-up)
 */
export function isInterviewComplete(session: BaInterviewSessionState): boolean {
    for (const question of INTERVIEW_PROTOCOL) {
        const state = session.topicStates[question.topic];
        if (question.isRequired && state.status !== 'answered' && state.status !== 'skipped') {
            return false;
        }
    }
    return true;
}

/** Apply the result of a successful answer classification to the session. */
export function applyAnsweredTopic(
    session: BaInterviewSessionState,
    topic: InterviewTopic,
    extractedInfo: string,
    newRequirements: ElicitedRequirement[],
): BaInterviewSessionState {
    return {
        ...session,
        topicStates: {
            ...session.topicStates,
            [topic]: {
                ...session.topicStates[topic],
                status: 'answered',
                extractedInfo,
                turnsSpent: session.topicStates[topic].turnsSpent + 1,
            },
        },
        elicitedRequirements: [...session.elicitedRequirements, ...newRequirements],
    };
}

/** Record that we sent a probe and are still waiting for a better answer. */
export function applyProbedTopic(
    session: BaInterviewSessionState,
    topic: InterviewTopic,
    partialInfo: string,
    newRequirements: ElicitedRequirement[],
): BaInterviewSessionState {
    const current = session.topicStates[topic];
    return {
        ...session,
        topicStates: {
            ...session.topicStates,
            [topic]: {
                ...current,
                status: 'probed',
                extractedInfo: current.extractedInfo
                    ? `${current.extractedInfo} ${partialInfo}`.trim()
                    : partialInfo,
                turnsSpent: current.turnsSpent + 1,
                probeIndex: current.probeIndex + 1,
            },
        },
        elicitedRequirements: [...session.elicitedRequirements, ...newRequirements],
    };
}

/** Mark a topic as skipped after exhausting turns. */
export function applySkippedTopic(
    session: BaInterviewSessionState,
    topic: InterviewTopic,
): BaInterviewSessionState {
    return {
        ...session,
        topicStates: {
            ...session.topicStates,
            [topic]: {
                ...session.topicStates[topic],
                status: 'skipped',
                turnsSpent: session.topicStates[topic].turnsSpent + 1,
            },
        },
    };
}

/** Append an entry to the transcript history. */
export function appendTranscriptEntry(
    session: BaInterviewSessionState,
    speaker: 'agent' | 'stakeholder',
    text: string,
): BaInterviewSessionState {
    return {
        ...session,
        transcriptHistory: [
            ...session.transcriptHistory,
            { speaker, text, timestamp: new Date().toISOString() },
        ],
    };
}

/** Mark the session as completed. */
export function completeSession(
    session: BaInterviewSessionState,
): BaInterviewSessionState {
    return {
        ...session,
        status: 'completed',
        completedAt: new Date().toISOString(),
    };
}

// ---------------------------------------------------------------------------
// Opening and closing scripts
// ---------------------------------------------------------------------------

export const INTERVIEW_OPENING =
    "Hi, thanks for making time for this. I'm your Business Analyst agent. " +
    "I have a set of structured questions to help us capture the requirements for this project. " +
    "The whole session should take about twenty to thirty minutes. " +
    "Please feel free to answer as fully as you like — the more context you give me, the better. " +
    "Let's start.";

export function buildInterviewClosing(session: BaInterviewSessionState): string {
    const reqCount = session.elicitedRequirements.length;
    const topicsAnswered = Object.values(session.topicStates).filter(
        (s) => s.status === 'answered',
    ).length;
    const topicsSkipped = Object.values(session.topicStates).filter(
        (s) => s.status === 'skipped',
    ).length;

    const parts = [
        `That covers everything I needed to ask.`,
        `I've captured ${reqCount} requirement${reqCount !== 1 ? 's' : ''} across ${topicsAnswered} topic${topicsAnswered !== 1 ? 's' : ''}.`,
    ];
    if (topicsSkipped > 0) {
        parts.push(
            `We skipped ${topicsSkipped} topic${topicsSkipped !== 1 ? 's' : ''} — I'll follow up in writing for those.`,
        );
    }
    parts.push(
        `I'll compile a draft requirements document and send it over for your review. Thank you.`,
    );
    return parts.join(' ');
}
