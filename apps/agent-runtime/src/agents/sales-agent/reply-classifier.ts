import { callAnthropic, extractText } from '../../infrastructure/anthropic-caller.js';

export type ReplyIntent =
    | 'interested'
    | 'not_now'
    | 'unsubscribe'
    | 'objection'
    | 'question'
    | 'unknown';

export interface ClassifyReplyParams {
    replyText: string;
    originalSubject: string;
}

export interface ClassifyReplyResult {
    intent: ReplyIntent;
    confidence: number;
    suggestedAction: string;
    reasoning: string;
}

const FALLBACK_RESULT: ClassifyReplyResult = {
    intent: 'unknown',
    confidence: 0,
    suggestedAction: 'manual_review',
    reasoning: 'LLM classification failed',
};

export async function classifyReply(params: ClassifyReplyParams): Promise<ClassifyReplyResult> {
    try {
        const apiKey = process.env['ANTHROPIC_API_KEY'];

        const system =
            'You are a B2B sales reply classifier. Analyse the reply and return ONLY a JSON object with keys: ' +
            'intent (one of: interested, not_now, unsubscribe, objection, question, unknown), ' +
            'confidence (number 0-1), suggestedAction (string), reasoning (string).';

        const userPrompt =
            `Original subject: ${params.originalSubject}\nReply text:\n${params.replyText}`;

        const { content } = await callAnthropic({
            tier: 'balanced',
            system,
            messages: [{ role: 'user', content: userPrompt }],
            maxTokens: 512,
        });
        const raw = extractText(content);
        const cleaned = raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();

        let parsedJson: unknown;
        try {
            parsedJson = JSON.parse(cleaned);
        } catch {
            return FALLBACK_RESULT;
        }
        if (!parsedJson || typeof parsedJson !== 'object') return FALLBACK_RESULT;
        const obj = parsedJson as Record<string, unknown>;

        const ALLOWED_INTENTS: readonly ReplyIntent[] = [
            'interested', 'not_now', 'unsubscribe', 'objection', 'question', 'unknown',
        ] as const;
        const rawIntent = typeof obj['intent'] === 'string' ? obj['intent'] : '';
        const intent: ReplyIntent = (ALLOWED_INTENTS as readonly string[]).includes(rawIntent)
            ? (rawIntent as ReplyIntent)
            : 'unknown';

        const confidenceRaw = typeof obj['confidence'] === 'number' ? obj['confidence'] : 0;
        const confidence = Math.max(0, Math.min(1, confidenceRaw));
        const suggestedAction = typeof obj['suggestedAction'] === 'string' && obj['suggestedAction'].trim()
            ? obj['suggestedAction']
            : 'manual_review';
        const reasoning = typeof obj['reasoning'] === 'string' ? obj['reasoning'] : '';

        return { intent, confidence, suggestedAction, reasoning };
    } catch {
        return FALLBACK_RESULT;
    }
}
