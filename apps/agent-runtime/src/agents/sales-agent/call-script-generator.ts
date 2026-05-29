import { callAnthropic, extractText } from '../../infrastructure/anthropic-caller.js';

export interface CallScriptContext {
    prospectName: string;
    company: string;
    title?: string;
    productDescription: string;
    icp: string;
}

export interface CallScript {
    openingLine: string;
    valueProposition: string;
    questionToAsk: string;
    fullScript: string;
}

export async function generateCallScript(ctx: CallScriptContext): Promise<CallScript> {
    const fallback: CallScript = {
        openingLine: `Hi ${ctx.prospectName}, hope I'm not catching you at a bad time.`,
        valueProposition: `We help companies like ${ctx.company} with ${ctx.productDescription}.`,
        questionToAsk: 'Is this a good time for a quick 30-second overview?',
        fullScript: `Hi ${ctx.prospectName}, hope I'm not catching you at a bad time. I'll keep this short — we help companies like ${ctx.company} with ${ctx.productDescription}. Is this a good time for a quick 30-second overview?`,
    };

    const apiKey = process.env['ANTHROPIC_API_KEY'];
    if (!apiKey) return fallback;

    const system = `You are an expert SDR coach. Generate a short, natural cold call opening script for a B2B sales call.
Keep the full script under 40 seconds when spoken (about 80-100 words). Conversational, not pushy.
Return ONLY valid JSON (no markdown):
{ "openingLine": "...", "valueProposition": "...", "questionToAsk": "...", "fullScript": "..." }`;

    const userPrompt = `Prospect: ${ctx.prospectName}, ${ctx.title ?? 'professional'} at ${ctx.company}
Product: ${ctx.productDescription}
ICP: ${ctx.icp}
Generate the cold call opening script.`;

    const { content } = await callAnthropic({
        tier: 'balanced',
        system,
        messages: [{ role: 'user', content: userPrompt }],
        maxTokens: 512,
    });
    const raw = extractText(content);
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();

    try {
        const obj = JSON.parse(cleaned) as Record<string, unknown>;
        return {
            openingLine: typeof obj['openingLine'] === 'string' ? obj['openingLine'] : fallback.openingLine,
            valueProposition: typeof obj['valueProposition'] === 'string' ? obj['valueProposition'] : fallback.valueProposition,
            questionToAsk: typeof obj['questionToAsk'] === 'string' ? obj['questionToAsk'] : fallback.questionToAsk,
            fullScript: typeof obj['fullScript'] === 'string' ? obj['fullScript'] : fallback.fullScript,
        };
    } catch {
        return fallback;
    }
}

// Called by the Twilio webhook on each conversation turn
export async function generateCallTurnResponse(
    prospectUtterance: string,
    intent: string,
    turnNumber: number,
    ctx: CallScriptContext,
): Promise<{ text: string; shouldHangUp: boolean }> {
    const wrapUp = {
        text: `Thank you for your time, ${ctx.prospectName}. I'll follow up with some information by email. Have a great day!`,
        shouldHangUp: true,
    };

    if (turnNumber >= 5) return wrapUp;

    const apiKey = process.env['ANTHROPIC_API_KEY'];
    if (!apiKey) return wrapUp;

    const system = `You are an AI sales agent on a live phone call. Generate the next spoken utterance.
Rules: max 50 words. Natural spoken language. No jargon. Do not repeat yourself.
- If intent is "unsubscribe" or "not_now": politely end the call, set shouldHangUp: true.
- If intent is "interested": move toward booking a meeting.
- If intent is "objection": address it briefly and pivot.
- If intent is "question": answer concisely and re-engage.
- If turn >= 4: wrap up and set shouldHangUp: true.
Return ONLY valid JSON: { "text": "...", "shouldHangUp": false }`;

    const userPrompt = `Prospect said: "${prospectUtterance}"
Classified intent: ${intent}
Turn number: ${turnNumber} of 5
Product: ${ctx.productDescription} | Company being sold to: ${ctx.company}`;

    const { content: _wrapBlocks } = await callAnthropic({
        tier: 'balanced',
        system,
        messages: [{ role: 'user', content: userPrompt }],
        maxTokens: 256,
    });
    const raw = extractText(_wrapBlocks);
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();

    try {
        const obj = JSON.parse(cleaned) as Record<string, unknown>;
        const shouldHangUp =
            obj['shouldHangUp'] === true ||
            intent === 'unsubscribe' ||
            turnNumber >= 4;
        return {
            text: typeof obj['text'] === 'string' ? obj['text'] : wrapUp.text,
            shouldHangUp,
        };
    } catch {
        return wrapUp;
    }
}

// Classify spoken input from a prospect (same logic as reply-classifier but for speech)
export async function classifyCallUtterance(
    speechText: string,
): Promise<{ intent: string; confidence: number }> {
    const apiKey = process.env['ANTHROPIC_API_KEY'];
    if (!apiKey) return { intent: 'unknown', confidence: 0 };

    const system =
        'You are a B2B sales call classifier. Classify the spoken prospect utterance and return ONLY JSON: ' +
        '{ "intent": "interested|not_now|unsubscribe|objection|question|unknown", "confidence": 0.0-1.0 }';

    const { content: _classBlocks } = await callAnthropic({
        tier: 'balanced',
        system,
        messages: [{ role: 'user', content: speechText }],
        maxTokens: 128,
    });
    const raw = extractText(_classBlocks);
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();

    try {
        const obj = JSON.parse(cleaned) as Record<string, unknown>;
        const VALID = ['interested', 'not_now', 'unsubscribe', 'objection', 'question', 'unknown'];
        const intent = typeof obj['intent'] === 'string' && VALID.includes(obj['intent'])
            ? obj['intent']
            : 'unknown';
        const confidence = typeof obj['confidence'] === 'number'
            ? Math.max(0, Math.min(1, obj['confidence']))
            : 0;
        return { intent, confidence };
    } catch {
        return { intent: 'unknown', confidence: 0 };
    }
}
