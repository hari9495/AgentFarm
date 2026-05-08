import * as fs from 'node:fs';
import type { TriggerServiceConfig, TenantTriggerConfig } from './types.js';

const DEFAULT_AGENT_RUNTIME_URL = 'http://localhost:3001';
const DEFAULT_ANTHROPIC_API_VERSION = '2023-06-01';

/**
 * Load TriggerServiceConfig from (in priority order):
 *  1. TRIGGER_CONFIG_PATH — path to a JSON file
 *  2. TRIGGER_CONFIG — inline JSON string
 *  3. Individual environment variables (single-tenant fallback)
 */
export function loadConfig(): TriggerServiceConfig {
    const configPath = process.env['TRIGGER_CONFIG_PATH'];
    if (configPath) {
        const raw = fs.readFileSync(configPath, 'utf-8');
        return normalise(JSON.parse(raw) as Partial<TriggerServiceConfig>);
    }

    const inline = process.env['TRIGGER_CONFIG'];
    if (inline) {
        return normalise(JSON.parse(inline) as Partial<TriggerServiceConfig>);
    }

    // Single-tenant fallback from individual env vars
    const tenantId = process.env['TRIGGER_TENANT_ID'] ?? 'default';
    const defaultAgentId = process.env['TRIGGER_DEFAULT_AGENT_ID'] ?? 'default-agent';
    const tenant: TenantTriggerConfig = {
        tenantId,
        defaultAgentId,
        agents: [{ agentId: defaultAgentId, description: 'Default agent' }],
        name: tenantId,
    };

    return normalise({ tenants: [tenant] });
}

function normalise(raw: Partial<TriggerServiceConfig>): TriggerServiceConfig {
    return {
        tenants: raw.tenants ?? [],
        agentRuntimeUrl: raw.agentRuntimeUrl ?? process.env['AGENT_RUNTIME_URL'] ?? DEFAULT_AGENT_RUNTIME_URL,
        anthropicApiKey: raw.anthropicApiKey ?? process.env['ANTHROPIC_API_KEY'],
        anthropicApiVersion:
            raw.anthropicApiVersion ??
            process.env['ANTHROPIC_API_VERSION'] ??
            DEFAULT_ANTHROPIC_API_VERSION,
    };
}
