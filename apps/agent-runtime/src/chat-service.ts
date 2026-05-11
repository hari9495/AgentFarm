// Phase 13 — Agent Chat: LLM reply generation for multi-turn sessions

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

    const systemContent = [
        `You are a helpful AI agent. TenantId: ${params.tenantId}.`,
        params.agentId ? ` AgentId: ${params.agentId}.` : '',
    ].join('');

    const messages: ChatMessage[] = [
        { role: 'system', content: systemContent },
        ...params.messages,
    ];

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
    return { content };
}
