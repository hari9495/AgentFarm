// Phase 13 — Agent Chat: LLM reply generation for multi-turn sessions
import { getTracer } from '@agentfarm/observability';
import { SpanStatusCode } from '@opentelemetry/api';

export type ChatMessage = {
    role: 'system' | 'user' | 'assistant';
    content: string;
};

export type ChatReplyParams = {
    messages: ChatMessage[];
    agentId?: string | null;
    tenantId: string;
    provider?: string;
    env?: NodeJS.ProcessEnv;
};

export type ChatReplyResult = {
    content: string;
};

export function getChatReplyMock(messages: ChatMessage[]): ChatReplyResult {
    let last: ChatMessage | undefined;
    for (const m of messages) {
        if (m.role === 'user') last = m;
    }
    return { content: `Echo: ${last?.content ?? ''}` };
}

/**
 * Streaming variant of getChatReply. Yields LLM output tokens as they arrive
 * so callers can write SSE chunks incrementally rather than buffering the
 * entire response. Falls back to a single-chunk yield for the mock provider.
 */
export async function* streamChatReply(params: ChatReplyParams): AsyncGenerator<string, void, unknown> {
    const env = params.env ?? process.env;
    const provider = params.provider ?? env['LLM_PROVIDER'] ?? 'mock';

    if (provider === 'mock') {
        yield getChatReplyMock(params.messages).content;
        return;
    }

    const baseUrl  = (env['LLM_BASE_URL'] ?? 'http://localhost:11434').replace(/\/+$/, '');
    const apiKey   = env['LLM_API_KEY'] ?? 'no-key';
    const model    = env['LLM_MODEL'] ?? 'llama3';
    const timeoutMs = Number(env['LLM_TIMEOUT_MS'] ?? 30_000);
    const tracer   = getTracer('agentfarm.llm.dispatch');

    const systemContent = [
        `You are a helpful AI agent. TenantId: ${params.tenantId}.`,
        params.agentId ? ` AgentId: ${params.agentId}.` : '',
    ].join('');

    const messages: ChatMessage[] = [
        { role: 'system', content: systemContent },
        ...params.messages,
    ];

    const span = tracer.startSpan('llm.stream', {
        attributes: {
            'llm.provider': provider,
            'llm.model':    model,
            'llm.stream':   true,
            'agent.id':     params.agentId ?? '',
            'tenant.id':    params.tenantId,
        },
    });

    let tokenCount = 0;
    try {
        const response = await fetch(`${baseUrl}/chat/completions`, {
            method:  'POST',
            headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
            body:    JSON.stringify({ model, temperature: 0, stream: true, messages }),
            signal:  AbortSignal.timeout(timeoutMs),
        });

        if (!response.ok || !response.body) {
            throw new Error(`LLM stream request failed: ${response.status}`);
        }

        const reader  = response.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buf += decoder.decode(value, { stream: true });
                const lines = buf.split('\n');
                buf = lines.pop() ?? '';
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed.startsWith('data: ')) continue;
                    const payload = trimmed.slice(6);
                    if (payload === '[DONE]') { span.end(); return; }
                    try {
                        const event = JSON.parse(payload) as {
                            choices?: Array<{ delta?: { content?: string } }>;
                        };
                        const token = event.choices?.[0]?.delta?.content;
                        if (token) { tokenCount++; yield token; }
                    } catch { /* skip malformed SSE lines */ }
                }
            }
        } finally {
            reader.cancel().catch(() => {});
        }
        span.setAttribute('llm.token_chunks', tokenCount);
        span.setStatus({ code: SpanStatusCode.OK });
    } catch (err) {
        span.recordException(err as Error);
        span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
        throw err;
    } finally {
        span.end();
    }
}

export async function getChatReply(params: ChatReplyParams): Promise<ChatReplyResult> {
    const env = params.env ?? process.env;
    const provider = params.provider ?? env['LLM_PROVIDER'] ?? 'mock';

    if (provider === 'mock') {
        return getChatReplyMock(params.messages);
    }

    const baseUrl = (env['LLM_BASE_URL'] ?? 'http://localhost:11434').replace(/\/+$/, '');
    const apiKey = env['LLM_API_KEY'] ?? 'no-key';
    const model = env['LLM_MODEL'] ?? 'llama3';
    const timeoutMs = Number(env['LLM_TIMEOUT_MS'] ?? 30_000);
    const tracer = getTracer('agentfarm.llm.dispatch');

    const systemContent = [
        `You are a helpful AI agent. TenantId: ${params.tenantId}.`,
        params.agentId ? ` AgentId: ${params.agentId}.` : '',
    ].join('');

    const messages: ChatMessage[] = [
        { role: 'system', content: systemContent },
        ...params.messages,
    ];

    const span = tracer.startSpan('llm.request', {
        attributes: {
            'llm.provider': provider,
            'llm.model':    model,
            'llm.stream':   false,
            'agent.id':     params.agentId ?? '',
            'tenant.id':    params.tenantId,
        },
    });

    try {
        const response = await fetch(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({ model, temperature: 0, messages }),
            signal: AbortSignal.timeout(timeoutMs),
        });

        if (!response.ok) {
            throw new Error(`LLM request failed: ${response.status}`);
        }

        const parsed = await response.json() as {
            choices?: { message?: { content?: string } }[];
        };
        const content = parsed.choices?.[0]?.message?.content ?? '';
        span.setAttribute('llm.response_chars', content.length);
        span.setStatus({ code: SpanStatusCode.OK });
        return { content };
    } catch (err) {
        span.recordException(err as Error);
        span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
        throw err;
    } finally {
        span.end();
    }
}
