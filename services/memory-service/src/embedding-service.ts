// ============================================================================
// EMBEDDING SERVICE
// Sprint 4 — pgvector Episodic Memory (2026-05-15)
//
// Calls Azure OpenAI embeddings API.
// Returns a 1536-dimension float vector for any input text.
// ============================================================================

export interface EmbeddingServiceConfig {
    /** Azure OpenAI endpoint, e.g. https://<resource>.openai.azure.com */
    endpoint: string;
    /** Deployment name for the embedding model, e.g. text-embedding-3-small */
    deployment: string;
    /** API key (Azure OpenAI key) */
    apiKey: string;
    /** API version (default: 2024-02-01) */
    apiVersion?: string;
}

export interface EmbedFn {
    (text: string): Promise<number[]>;
}

/**
 * Build an embed function bound to an Azure OpenAI deployment.
 *
 * Usage:
 *   const embed = createEmbedFn({ endpoint, deployment, apiKey });
 *   const vector = await embed("refactor auth module to use JWT");
 */
export function createEmbedFn(config: EmbeddingServiceConfig): EmbedFn {
    const { endpoint, deployment, apiKey } = config;
    const apiVersion = config.apiVersion ?? '2024-02-01';
    const url = `${endpoint.replace(/\/$/, '')}/openai/deployments/${deployment}/embeddings?api-version=${apiVersion}`;

    return async function embed(text: string): Promise<number[]> {
        if (!text || text.trim().length === 0) {
            throw new TypeError('embed: input text must be non-empty');
        }

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'api-key': apiKey,
            },
            body: JSON.stringify({ input: text }),
        });

        if (!response.ok) {
            const body = await response.text().catch(() => '');
            throw new Error(
                `embed: Azure OpenAI returned ${response.status} ${response.statusText}: ${body}`
            );
        }

        const json = await response.json() as {
            data: Array<{ embedding: number[] }>;
        };

        const embedding = json?.data?.[0]?.embedding;
        if (!Array.isArray(embedding) || embedding.length === 0) {
            throw new Error('embed: response did not contain a valid embedding vector');
        }

        return embedding;
    };
}
