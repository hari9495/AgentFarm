const PERSONALISER_MODEL = 'claude-sonnet-4-20250514';

export interface PersonaliseEmailParams {
    prospect: {
        firstName: string;
        lastName: string;
        email: string;
        company: string;
        title?: string | null;
        industry?: string | null;
    };
    productDescription: string;
    icp: string;
    emailTone: string;
    sequenceStep: number;
    previousSubject?: string | null;
}

export interface PersonalisedEmail {
    subject: string;
    body: string;
    reasoning: string;
}

export async function personaliseEmail(params: PersonaliseEmailParams): Promise<PersonalisedEmail> {
    const apiKey = process.env['ANTHROPIC_API_KEY'];
    if (!apiKey) {
        throw new Error(
            'personaliseEmail: ANTHROPIC_API_KEY env var is not set. Refusing to call the LLM with an empty key.',
        );
    }
    const stepContext =
        params.sequenceStep === 1
            ? 'This is the first outreach email — introduce the product clearly and concisely.'
            : `This is follow-up #${params.sequenceStep - 1} — the previous subject was "${params.previousSubject ?? 'unknown'}". Reference the prior contact naturally.`;

    const system =
        'You are an expert B2B sales copywriter. Write personalised outreach emails that are concise, relevant, and human. ' +
        'Return ONLY a JSON object with keys: subject (string), body (string, HTML-safe plain text), reasoning (string). ' +
        'Use only the facts provided. Do NOT invent statistics, customer names, case studies, or product features that are not in the input.';

    const userPrompt =
        `Prospect: ${params.prospect.firstName} ${params.prospect.lastName}, ${params.prospect.title ?? 'Unknown Title'} at ${params.prospect.company}` +
        (params.prospect.industry ? ` (${params.prospect.industry})` : '') +
        `\nProduct: ${params.productDescription}` +
        `\nIdeal Customer Profile: ${params.icp}` +
        `\nTone: ${params.emailTone}` +
        `\n${stepContext}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
            model: PERSONALISER_MODEL,
            max_tokens: 1024,
            system,
            messages: [{ role: 'user', content: userPrompt }],
        }),
    });

    if (!response.ok) {
        throw new Error(`Anthropic API error ${response.status}: ${await response.text()}`);
    }

    const parsed = await response.json() as { content?: Array<{ type: string; text?: string }> };
    const raw = (parsed.content ?? [])
        .filter((b) => b.type === 'text')
        .map((b) => b.text ?? '')
        .join('');
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();

    let candidate: unknown;
    try {
        candidate = JSON.parse(cleaned);
    } catch (err) {
        throw new Error(`personaliseEmail: LLM returned non-JSON output. Raw: ${raw.slice(0, 200)}. Error: ${String(err)}`);
    }

    if (!candidate || typeof candidate !== 'object') {
        throw new Error('personaliseEmail: LLM output is not an object.');
    }
    const obj = candidate as Record<string, unknown>;
    const subject = typeof obj['subject'] === 'string' ? obj['subject'].trim() : '';
    const body = typeof obj['body'] === 'string' ? obj['body'].trim() : '';
    const reasoning = typeof obj['reasoning'] === 'string' ? obj['reasoning'] : '';

    if (!subject) {
        throw new Error('personaliseEmail: LLM returned an empty or non-string subject. Refusing to draft an email without a subject line.');
    }
    if (!body) {
        throw new Error('personaliseEmail: LLM returned an empty or non-string body. Refusing to draft an empty email.');
    }

    return { subject, body, reasoning };
}
