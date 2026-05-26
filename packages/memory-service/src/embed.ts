// ============================================================================
// EMBED
// Creates an Azure OpenAI embedding function that converts text → float32 vector.
// The returned EmbedFn is passed to the memory write/search helpers so all
// network calls can be swapped with a mock in tests.
// ============================================================================

/**
 * A function that embeds a string into a float vector.
 * The dimension depends on the Azure OpenAI deployment (1536 for text-embedding-3-small).
 */
export type EmbedFn = (text: string) => Promise<number[]>;

interface AzureEmbedResponse {
    data: Array<{ embedding: number[] }>;
}

/**
 * Build an EmbedFn backed by the Azure OpenAI Embeddings API.
 *
 * @param endpoint   - Azure OpenAI resource endpoint (e.g. https://my-resource.openai.azure.com)
 * @param deployment - Model deployment name (e.g. text-embedding-3-small)
 * @param apiKey     - Azure OpenAI API key
 */
export function createEmbedFn(params: {
    endpoint:   string;
    deployment: string;
    apiKey:     string;
}): EmbedFn {
    const { endpoint, deployment, apiKey } = params;
    const base = endpoint.replace(/\/+$/, '');
    const url  = `${base}/openai/deployments/${deployment}/embeddings?api-version=2024-02-01`;

    return async (text: string): Promise<number[]> => {
        const response = await fetch(url, {
            method:  'POST',
            headers: {
                'Content-Type': 'application/json',
                'api-key':      apiKey,
            },
            body:   JSON.stringify({ input: text.slice(0, 8192) }), // API hard cap
            signal: AbortSignal.timeout(15_000),
        });

        if (!response.ok) {
            const errText = await response.text().catch(() => response.statusText);
            throw new Error(`Embedding API error ${response.status}: ${errText}`);
        }

        const json = (await response.json()) as AzureEmbedResponse;
        const embedding = json.data[0]?.embedding;
        if (!embedding || embedding.length === 0) {
            throw new Error('Embedding API returned an empty vector');
        }
        return embedding;
    };
}
