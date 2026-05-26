/**
 * Persona context loader for agent-runtime.
 *
 * Fetches the AgentPersona for a given bot from the API gateway before task execution.
 * Results are cached in-process for 60 seconds to avoid per-task HTTP overhead.
 * Returns null (graceful degradation) on 404 or network errors — the task still runs.
 */

import type { AgentPersonaRecord } from '@agentfarm/shared-types';

const CACHE_TTL_MS = 60_000;

type CacheEntry = {
    persona: AgentPersonaRecord | null;
    expiresAt: number;
};

const cache = new Map<string, CacheEntry>();

function getCacheKey(botId: string, tenantId: string): string {
    return `${tenantId}:${botId}`;
}

/**
 * Load the AgentPersona for a bot from the API gateway.
 *
 * @param botId    The bot ID whose persona should be loaded.
 * @param tenantId The tenant ID (used for cache scoping).
 * @returns The AgentPersonaRecord, or null if not found / unavailable.
 */
export async function loadPersonaForBot(
    botId: string,
    tenantId: string,
): Promise<AgentPersonaRecord | null> {
    const key = getCacheKey(botId, tenantId);
    const now = Date.now();

    const cached = cache.get(key);
    if (cached && cached.expiresAt > now) {
        return cached.persona;
    }

    const gatewayUrl = process.env['GATEWAY_URL'] ?? '';
    const serviceToken = process.env['INTERNAL_SERVICE_TOKEN'] ?? '';

    if (!gatewayUrl) {
        cache.set(key, { persona: null, expiresAt: now + CACHE_TTL_MS });
        return null;
    }

    try {
        const res = await fetch(`${gatewayUrl}/v1/personas/${encodeURIComponent(botId)}`, {
            headers: {
                Authorization: `Bearer ${serviceToken}`,
                'Content-Type': 'application/json',
            },
        });

        if (res.status === 404) {
            cache.set(key, { persona: null, expiresAt: now + CACHE_TTL_MS });
            return null;
        }

        if (!res.ok) {
            // Non-404 error — do not cache, allow retry on next task
            return null;
        }

        const body = (await res.json()) as { persona: AgentPersonaRecord };
        const persona = body.persona;
        cache.set(key, { persona, expiresAt: now + CACHE_TTL_MS });
        return persona;
    } catch {
        // Network error — graceful degradation, do not cache
        return null;
    }
}

/** Exposed for tests — clear the in-process cache. */
export function clearPersonaCache(): void {
    cache.clear();
}

// ---------------------------------------------------------------------------
// Role-aware fallback loader
// ---------------------------------------------------------------------------

import { getTesterDefaultPersona } from './agents/tester/tester-persona-defaults.js';
import { getTechnicalWriterDefaultPersona } from './agents/technical-writer/technical-writer-persona-defaults.js';
import { getContentWriterDefaultPersona } from './agents/content-writer/content-writer-persona-defaults.js';
import { getBusinessAnalystDefaultPersona } from './agents/business-analyst/business-analyst-persona-defaults.js';
import { getProjectManagerDefaultPersona } from './agents/project-manager/project-manager-persona-defaults.js';
import { getDevopsDefaultPersona } from './agents/devops/devops-persona-defaults.js';

/**
 * Load the persona for a bot, falling back to role-specific defaults when the
 * gateway returns null (no custom persona configured).
 *
 * @param botId    The bot ID.
 * @param tenantId The tenant ID.
 * @param role     The bot's role key (e.g. 'tester', 'technical_writer').
 */
export async function loadPersonaForBotWithFallback(
    botId: string,
    tenantId: string,
    role: string,
): Promise<AgentPersonaRecord | null> {
    const persona = await loadPersonaForBot(botId, tenantId);
    if (persona !== null) return persona;

    if (role === 'tester') {
        return getTesterDefaultPersona(botId, tenantId);
    }
    if (role === 'technical_writer') {
        return getTechnicalWriterDefaultPersona(botId, tenantId);
    }
    if (role === 'content_writer') {
        return getContentWriterDefaultPersona(botId, tenantId);
    }
    if (role === 'business_analyst') {
        return getBusinessAnalystDefaultPersona(botId, tenantId);
    }
    if (role === 'project_manager_product_owner_scrum_master') {
        return getProjectManagerDefaultPersona(botId, tenantId);
    }
    if (role === 'devops_engineer') {
        return getDevopsDefaultPersona(botId, tenantId);
    }

    return null;
}
