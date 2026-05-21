/**
 * LLM decision brain for the meeting-agent.
 *
 * Reads the meeting transcript history and calls a configured LLM to decide
 * whether and what the agent should say next. Supports OpenAI-compatible
 * endpoints (OpenAI, Azure OpenAI, GitHub Models, Groq, etc.) and the
 * Anthropic Messages API.
 *
 * When `think()` returns `null` the caller should stay silent. When it
 * returns a non-empty string the caller should invoke `/say` with that text.
 */

export const DEFAULT_BRAIN_SYSTEM_PROMPT =
    'You are an AI assistant participating in a meeting. ' +
    'Listen to what participants say and respond when your input is helpful ' +
    'or when you are directly addressed. ' +
    'Keep responses concise — under 3 sentences unless detail is explicitly requested. ' +
    'If the conversation is flowing naturally without needing your input, ' +
    'respond with an empty string to stay silent. ' +
    'Do not repeat or paraphrase what participants just said. ' +
    'Do not introduce yourself more than once.';

/** LLM provider selector. OpenAI-compatible covers OpenAI, Azure, GitHub Models, Groq, etc. */
export type BrainLlmProvider = 'openai' | 'anthropic';

export interface MeetingBrainOptions {
    /** LLM provider. */
    provider: BrainLlmProvider;
    /** API key sent to the LLM provider. */
    apiKey: string;
    /**
     * Override base URL, e.g. `https://models.inference.ai.azure.com` for
     * GitHub Models or `https://api.groq.com/openai/v1` for Groq.
     * Defaults to `https://api.openai.com/v1` (openai) or
     * `https://api.anthropic.com` (anthropic).
     */
    baseUrl?: string;
    /**
     * Model identifier. Defaults to `gpt-4o-mini` (openai) or
     * `claude-3-5-sonnet-latest` (anthropic).
     */
    model?: string;
    /** System prompt injected at the start of every LLM conversation. */
    systemPrompt?: string;
    /** Max tokens in the LLM reply. Default 512. */
    maxTokens?: number;
    /** Request timeout in ms. Default 30 000. */
    timeoutMs?: number;
    /** Injected fetch implementation — primarily for unit tests. */
    fetchImpl?: typeof fetch;
}

/** A single turn in the meeting conversation. */
export interface BrainTurn {
    /** `user` = participant, `assistant` = agent. */
    role: 'user' | 'assistant';
    /** The utterance text. */
    text: string;
    /** Optional speaker name prepended to the message content. */
    speaker?: string;
}

// ── Provider defaults ─────────────────────────────────────────────────────────

const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';
const DEFAULT_ANTHROPIC_BASE_URL = 'https://api.anthropic.com';
const DEFAULT_ANTHROPIC_MODEL = 'claude-3-5-sonnet-latest';
const DEFAULT_ANTHROPIC_API_VERSION = '2023-06-01';

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

// ── MeetingBrain ─────────────────────────────────────────────────────────────

export class MeetingBrain {
    private readonly provider: BrainLlmProvider;
    private readonly apiKey: string;
    private readonly baseUrl: string;
    private readonly model: string;
    private readonly systemPrompt: string;
    private readonly maxTokens: number;
    private readonly timeoutMs: number;
    private readonly fetchImpl: typeof fetch;

    constructor(options: MeetingBrainOptions) {
        if (!options.apiKey) throw new Error('MeetingBrain: apiKey is required');
        const isAnthropic = options.provider === 'anthropic';
        this.provider = options.provider;
        this.apiKey = options.apiKey;
        this.baseUrl = (
            options.baseUrl ?? (isAnthropic ? DEFAULT_ANTHROPIC_BASE_URL : DEFAULT_OPENAI_BASE_URL)
        ).replace(/\/+$/u, '');
        this.model = options.model ?? (isAnthropic ? DEFAULT_ANTHROPIC_MODEL : DEFAULT_OPENAI_MODEL);
        this.systemPrompt = options.systemPrompt ?? DEFAULT_BRAIN_SYSTEM_PROMPT;
        this.maxTokens = options.maxTokens ?? 512;
        this.timeoutMs = options.timeoutMs ?? 30_000;
        this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    }

    /**
     * Given the meeting conversation history, decide whether the agent should
     * speak and return the reply text.  Returns `null` when the agent should
     * stay silent (LLM returned blank or whitespace-only content).
     *
     * @param opts.memoryContext - Optional past-exchange context block built by
     *   `MeetingEpisodicMemory.buildContextBlock()`.  When provided it is
     *   appended to the system prompt so the LLM is aware of prior interactions
     *   with the current speaker without polluting the message history.
     */
    async think(history: BrainTurn[], opts?: { memoryContext?: string }): Promise<string | null> {
        const effectiveSystemPrompt =
            opts?.memoryContext
                ? `${this.systemPrompt}\n\n${opts.memoryContext}`
                : this.systemPrompt;

        const messages: ChatMessage[] = history.map((turn) => ({
            role: turn.role,
            content: turn.speaker ? `${turn.speaker}: ${turn.text}` : turn.text,
        }));

        const text =
            this.provider === 'anthropic'
                ? await this._callAnthropic(messages, effectiveSystemPrompt)
                : await this._callOpenAI(messages, effectiveSystemPrompt);

        const trimmed = text.trim();
        return trimmed || null;
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private async _callOpenAI(messages: ChatMessage[], systemPrompt: string): Promise<string> {
        const response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`,
            },
            body: JSON.stringify({
                model: this.model,
                max_tokens: this.maxTokens,
                temperature: 0.7,
                messages: [
                    { role: 'system', content: systemPrompt },
                    ...messages,
                ],
            }),
            signal: AbortSignal.timeout(this.timeoutMs),
        });

        if (!response.ok) {
            throw new Error(`MeetingBrain: OpenAI request failed with HTTP ${response.status}`);
        }

        const data = (await response.json()) as {
            choices?: Array<{ message?: { content?: string } }>;
        };
        return data.choices?.[0]?.message?.content ?? '';
    }

    private async _callAnthropic(messages: ChatMessage[], systemPrompt: string): Promise<string> {
        // Anthropic Messages API: system is a top-level field, not in messages[].
        const anthropicMessages = messages.filter((m) => m.role !== 'system');

        const response = await this.fetchImpl(`${this.baseUrl}/v1/messages`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': this.apiKey,
                'anthropic-version': DEFAULT_ANTHROPIC_API_VERSION,
            },
            body: JSON.stringify({
                model: this.model,
                max_tokens: this.maxTokens,
                system: systemPrompt,
                messages: anthropicMessages,
            }),
            signal: AbortSignal.timeout(this.timeoutMs),
        });

        if (!response.ok) {
            throw new Error(`MeetingBrain: Anthropic request failed with HTTP ${response.status}`);
        }

        const data = (await response.json()) as {
            content?: Array<{ text?: string }>;
        };
        return data.content?.[0]?.text ?? '';
    }
}
