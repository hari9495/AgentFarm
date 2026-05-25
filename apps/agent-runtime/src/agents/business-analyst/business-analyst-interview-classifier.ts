/**
 * Business Analyst — Interview Answer Classifier
 *
 * Classifies a stakeholder's answer to a BA elicitation question using an LLM.
 * Determines:
 *   1. Whether the question was answered (fully / partially / not at all / off-topic)
 *   2. What information was extracted from the answer
 *   3. What requirements can be inferred from what was said
 *
 * Uses an injectable BaProseCallerFn so this module is fully testable without
 * a live LLM endpoint.
 *
 * Short-circuit rules (no LLM call needed):
 *   - Answer is empty or < minAnswerWords words → 'not_answered'
 *   - Answer is identical to the question → 'not_answered'
 */

import type { BaProseCallerFn } from './business-analyst-tone-adapter.js';
import type { ElicitedRequirement, InterviewTopic } from './business-analyst-interview-protocol.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AnswerClassification =
    | 'fully_answered'     // Substantive, direct answer — advance to next topic
    | 'partially_answered' // Relevant but incomplete — send a probe
    | 'not_answered'       // No relevant content — rephrase and ask again
    | 'off_topic';         // Stakeholder addressed something else — acknowledge and redirect

export interface ClassifyAnswerInput {
    /** The exact question text that was asked. */
    question: string;
    /** The stakeholder's transcribed response. */
    answer: string;
    topic: InterviewTopic;
    /** Minimum word count below which we skip the LLM and return 'not_answered'. */
    minAnswerWords: number;
}

export interface ClassifyAnswerResult {
    classification: AnswerClassification;
    /** Concise 1–2 sentence summary of the information extracted. */
    extractedInfo: string;
    /** Requirements inferred from this answer. */
    elicitedRequirements: ElicitedRequirement[];
    /** Classifier confidence in [0, 1]. */
    confidence: number;
    /**
     * A suggested probe question to use when classification is 'partially_answered'.
     * May be undefined — the runner falls back to the protocol's probe list in that case.
     */
    suggestedProbe?: string;
}

// ---------------------------------------------------------------------------
// System prompt for the LLM classifier
// ---------------------------------------------------------------------------

const CLASSIFIER_SYSTEM_PROMPT = `You are a Business Analyst elicitation classifier. Your job is to analyse a stakeholder's answer to a BA interview question and return a structured JSON classification.

Return ONLY valid JSON — no markdown fences, no explanation. Use this exact shape:
{
  "classification": "fully_answered" | "partially_answered" | "not_answered" | "off_topic",
  "extractedInfo": "<1–2 sentence summary of key information learned>",
  "requirements": [
    {
      "text": "<clear, testable requirement statement starting with 'The system must...' or 'The process must...'>",
      "source": "<verbatim phrase from the answer that implied this requirement>",
      "confidence": <0.0–1.0>
    }
  ],
  "confidence": <0.0–1.0, your confidence in the classification>,
  "suggestedProbe": "<optional follow-up question if partially_answered, else omit the field>"
}

Classification rules:
- fully_answered: Answer is substantive (20+ words) and directly addresses the question with concrete information.
- partially_answered: Answer is relevant but vague, incomplete, or lacks specifics needed for requirements.
- not_answered: Answer is empty, off-script filler ("I don't know", "maybe", "yes"), or fewer than 5 meaningful words.
- off_topic: Stakeholder answered a completely different question — acknowledge and redirect.

Requirement extraction rules:
- Only extract requirements if there is clear evidence in the answer.
- Requirements must be specific and testable. Bad: "The system should be fast." Good: "The system must process batch uploads within 30 seconds."
- If no clear requirements can be inferred, return an empty requirements array.
- Do not invent requirements not supported by the answer.`;

// ---------------------------------------------------------------------------
// Short-circuit helper
// ---------------------------------------------------------------------------

function wordCount(text: string): number {
    return text.trim().split(/\s+/).filter(Boolean).length;
}

function isLowSignalAnswer(answer: string): boolean {
    const lower = answer.toLowerCase().trim();
    const filler = [
        "i don't know", "i dont know", "not sure", "maybe", "yes", "no", "yeah",
        "yep", "nope", "ok", "okay", "uh", "um", "hmm", "right", "sure",
    ];
    return filler.some((f) => lower === f) || lower.length < 8;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Classify a stakeholder's answer to a BA interview question.
 *
 * Short-circuits to 'not_answered' when the answer is trivially short or
 * a low-signal filler phrase, avoiding unnecessary LLM calls.
 */
export async function classifyAnswer(
    input: ClassifyAnswerInput,
    caller: BaProseCallerFn,
): Promise<ClassifyAnswerResult> {
    const { question, answer, topic, minAnswerWords } = input;

    // Short-circuit: empty or trivially short answers
    if (!answer.trim() || wordCount(answer) < minAnswerWords || isLowSignalAnswer(answer)) {
        return {
            classification: 'not_answered',
            extractedInfo: '',
            elicitedRequirements: [],
            confidence: 0.95,
        };
    }

    const userPrompt =
        `Topic: ${topic}\n` +
        `Question asked: "${question}"\n` +
        `Stakeholder's answer: "${answer.slice(0, 2000)}"` +  // Guard against huge transcripts
        `\n\nClassify this answer and extract any requirements.`;

    const result = await caller(CLASSIFIER_SYSTEM_PROMPT, userPrompt);

    if (!result.text) {
        // LLM call failed — fall back conservatively to 'not_answered'
        return {
            classification: 'not_answered',
            extractedInfo: '',
            elicitedRequirements: [],
            confidence: 0,
        };
    }

    return parseClassifierResponse(result.text, topic);
}

// ---------------------------------------------------------------------------
// Response parser
// ---------------------------------------------------------------------------

type RawClassifierResponse = {
    classification?: AnswerClassification;
    extractedInfo?: string;
    requirements?: Array<{
        text?: string;
        source?: string;
        confidence?: number;
    }>;
    confidence?: number;
    suggestedProbe?: string;
};

function parseClassifierResponse(
    raw: string,
    topic: InterviewTopic,
): ClassifyAnswerResult {
    // Strip any accidental markdown code fences
    const cleaned = raw
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```\s*$/i, '')
        .trim();

    let parsed: RawClassifierResponse;
    try {
        parsed = JSON.parse(cleaned) as RawClassifierResponse;
    } catch {
        // JSON parse failure — conservative fallback
        return {
            classification: 'partially_answered',
            extractedInfo: raw.slice(0, 200),
            elicitedRequirements: [],
            confidence: 0.1,
        };
    }

    const validClassifications: AnswerClassification[] = [
        'fully_answered',
        'partially_answered',
        'not_answered',
        'off_topic',
    ];

    const classification: AnswerClassification =
        validClassifications.includes(parsed.classification as AnswerClassification)
            ? (parsed.classification as AnswerClassification)
            : 'partially_answered';

    const elicitedRequirements: ElicitedRequirement[] = (parsed.requirements ?? [])
        .filter((r) => r.text && r.text.trim().length > 0)
        .map((r, i) => ({
            id: `req_${topic}_${Date.now()}_${i}`,
            topic,
            text: (r.text ?? '').trim(),
            source: (r.source ?? '').trim(),
            confidence: typeof r.confidence === 'number'
                ? Math.min(1, Math.max(0, r.confidence))
                : 0.6,
        }));

    return {
        classification,
        extractedInfo: (parsed.extractedInfo ?? '').trim(),
        elicitedRequirements,
        confidence: typeof parsed.confidence === 'number'
            ? Math.min(1, Math.max(0, parsed.confidence))
            : 0.5,
        suggestedProbe: parsed.suggestedProbe?.trim() || undefined,
    };
}

// ---------------------------------------------------------------------------
// Redirect phrases — used when the stakeholder goes off-topic
// ---------------------------------------------------------------------------

/**
 * Build a polite redirect phrase to use when the stakeholder goes off-topic.
 * The redirect acknowledges what was said then steers back.
 */
export function buildRedirectPhrase(topic: InterviewTopic): string {
    const topicLabels: Record<InterviewTopic, string> = {
        business_context: "the business problem we're solving",
        current_state: "how the current process works",
        pain_points: "the pain points with the current situation",
        stakeholders: "who is affected by this change",
        success_criteria: "what success looks like for this project",
        constraints: "the constraints we need to work within",
        assumptions: "the assumptions we're making",
        timeline: "the target timeline",
    };
    const label = topicLabels[topic] ?? "the question I asked";
    return (
        `That's useful context, thank you. I'd like to come back to ${label} — ` +
        `could you help me understand that first?`
    );
}
