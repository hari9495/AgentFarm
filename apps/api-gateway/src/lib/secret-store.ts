/**
 * SecretStore: abstraction for retrieving connector credentials.
 *
 * The secretRefId stored on ConnectorAuthMetadata follows one of two URI schemes:
 *   - kv://<vault-name>/secrets/<secret-name>   (Azure Key Vault shorthand)
 *   - https://<vault-name>.vault.azure.net/secrets/<secret-name>  (full URL)
 *   - env://<VAR_NAME>  (dev / test: read from process.env)
 *
 * In production the secret value is a JSON string with the shape defined by
 * ConnectorCredentials in provider-clients.ts.
 */

export type SecretStore = {
    getSecret(secretRefId: string): Promise<string | null>;
    /** Write or overwrite a secret. Returns the canonical secretRefId to persist on the connector record. */
    setSecret(secretRefId: string, value: string): Promise<string>;
};

// ---------------------------------------------------------------------------
// Azure Key Vault implementation
// ---------------------------------------------------------------------------

const buildKeyVaultUrl = (secretRefId: string): { vaultUrl: string; secretName: string } | null => {
    // Full URL: https://<vault>.vault.azure.net/secrets/<name>
    const fullMatch = secretRefId.match(/^(https:\/\/[^/]+\.vault\.azure\.net)\/secrets\/([^/]+)/i);
    if (fullMatch) {
        return { vaultUrl: fullMatch[1]!, secretName: fullMatch[2]! };
    }

    // Shorthand: kv://<vault>/secrets/<name>
    const shortMatch = secretRefId.match(/^kv:\/\/([^/]+)\/secrets\/([^/]+)/i);
    if (shortMatch) {
        const vaultHost = shortMatch[1]!.includes('.vault.azure.net')
            ? shortMatch[1]!
            : `${shortMatch[1]!}.vault.azure.net`;
        return { vaultUrl: `https://${vaultHost}`, secretName: shortMatch[2]! };
    }

    return null;
};

const createAzureKeyVaultSecretStore = (): SecretStore => {
    // Lazy-initialize to avoid pulling in SDK unless DB URL is present.
    let clientCache: Map<string, unknown> | null = null;

    type KvClient = {
        getSecret(name: string): Promise<{ value?: string }>;
        setSecret(name: string, value: string): Promise<{ name: string }>;
    };

    const getClient = async (vaultUrl: string): Promise<KvClient> => {
        if (!clientCache) {
            clientCache = new Map();
        }
        if (!clientCache.has(vaultUrl)) {
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore — @azure/keyvault-secrets is an optional runtime dependency
            const { SecretClient } = await import('@azure/keyvault-secrets') as { SecretClient: new (url: string, cred: unknown) => KvClient };
            const { DefaultAzureCredential } = await import('@azure/identity');
            clientCache.set(vaultUrl, new SecretClient(vaultUrl, new DefaultAzureCredential()));
        }
        return clientCache.get(vaultUrl) as KvClient;
    };

    return {
        async getSecret(secretRefId) {
            const parsed = buildKeyVaultUrl(secretRefId);
            if (!parsed) {
                return null;
            }

            try {
                const client = await getClient(parsed.vaultUrl);
                const secret = await client.getSecret(parsed.secretName);
                return secret.value ?? null;
            } catch {
                return null;
            }
        },

        async setSecret(secretRefId, value) {
            const parsed = buildKeyVaultUrl(secretRefId);
            if (!parsed) {
                throw new Error(`Cannot write to secret ref: unsupported URI scheme — ${secretRefId}`);
            }
            const client = await getClient(parsed.vaultUrl);
            await client.setSecret(parsed.secretName, value);
            return secretRefId;
        },
    };
};

// ---------------------------------------------------------------------------
// Env-var fallback (dev / CI / test)
// Reads from env var named after the secret, e.g. env://JIRA_CREDENTIALS
// ---------------------------------------------------------------------------

const createEnvSecretStore = (): SecretStore => ({
    async getSecret(secretRefId) {
        // env://<VAR>
        const envMatch = secretRefId.match(/^env:\/\/([A-Z0-9_]+)$/i);
        if (envMatch) {
            return process.env[envMatch[1]!] ?? null;
        }
        return null;
    },

    async setSecret(secretRefId, value) {
        // env:// writes are only supported in test/dev — mutate process.env
        const envMatch = secretRefId.match(/^env:\/\/([A-Z0-9_]+)$/i);
        if (!envMatch) {
            throw new Error(`Cannot write to secret ref: unsupported URI scheme for env store — ${secretRefId}`);
        }
        process.env[envMatch[1]!] = value;
        return secretRefId;
    },
});

// ---------------------------------------------------------------------------
// Composite: tries Azure Key Vault first, falls back to env
// ---------------------------------------------------------------------------

export const createDefaultSecretStore = (): SecretStore => {
    const kvStore = createAzureKeyVaultSecretStore();
    const envStore = createEnvSecretStore();

    return {
        async getSecret(secretRefId) {
            const kvResult = await kvStore.getSecret(secretRefId);
            if (kvResult !== null) {
                return kvResult;
            }
            return envStore.getSecret(secretRefId);
        },

        async setSecret(secretRefId, value) {
            // Prefer Key Vault for kv:// and https:// refs, env store for env://
            if (secretRefId.startsWith('env://')) {
                return envStore.setSecret(secretRefId, value);
            }
            return kvStore.setSecret(secretRefId, value);
        },
    };
};

// ---------------------------------------------------------------------------
// In-memory store for tests
// ---------------------------------------------------------------------------

export const createInMemorySecretStore = (secrets: Record<string, string>): SecretStore => {
    const store = { ...secrets };
    return {
        async getSecret(secretRefId) {
            return store[secretRefId] ?? null;
        },
        async setSecret(secretRefId, value) {
            store[secretRefId] = value;
            return secretRefId;
        },
    };
};
