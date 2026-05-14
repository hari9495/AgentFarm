const CLASSIFIER_MODEL = 'claude-sonnet-4-20250514';

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

        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-api-key': apiKey ?? '',
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
                model: CLASSIFIER_MODEL,
                max_tokens: 512,
                system,
                messages: [{ role: 'user', content: userPrompt }],
            }),
        });

        if (!response.ok) {
            return FALLBACK_RESULT;
        }

        const parsed = await response.json() as { content?: Array<{ type: string; text?: string }> };
        const raw = (parsed.content ?? [])
            .filter((b) => b.type === 'text')
            .map((b) => b.text ?? '')
            .join('');
        const cleaned = raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
        return JSON.parse(cleaned) as ClassifyReplyResult;
    } catch {
        return FALLBACK_RESULT;
    }
}
