/**
 * Phase 22 — Per-agent (per-botId) rate limiting.
 *
 * Uses the same in-memory store as rate-limit.ts by delegating to rateLimit()
 * with an `agent:<botId>` key prefix, keeping all three tiers independent:
 *   IP  →  tenant  →  agent
 *
 * Config is loaded from the AgentRateLimit DB table and cached for 60 s.
 * Call invalidateAgentRateLimitCache after upsert/delete in management routes.
 */
import { rateLimit, type RateLimitResult } from './rate-limit.js';
import type { PrismaClient } from '@prisma/client';

export type { RateLimitResult };

// ---------------------------------------------------------------------------
// In-memory enforcement (delegates to shared rate-limit store)
// ---------------------------------------------------------------------------

export function rateLimitAgent(
    botId: string,
    opts: { limit: number; windowMs: number },
): RateLimitResult {
    return rateLimit(`agent:${botId}`, opts);
}

// ---------------------------------------------------------------------------
// Config cache — 60-second TTL per botId+tenantId pair
// ---------------------------------------------------------------------------

type AgentRateLimitConfig = {
    requestsPerMinute: number;
    burstLimit: number;
    enabled: boolean;
};

type CacheEntry = {
    config: AgentRateLimitConfig | null;
    fetchedAt: number;
};

const CONFIG_CACHE_TTL_MS = 60_000;
const configCache = new Map<string, CacheEntry>();

export async function getAgentRateLimitConfig(
    botId: string,
    tenantId: string,
    prisma: PrismaClient,
): Promise<AgentRateLimitConfig | null> {
    const cacheKey = `${tenantId}:${botId}`;
    const cached = configCache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt < CONFIG_CACHE_TTL_MS) {
        return cached.config;
    }

    const row = await prisma.agentRateLimit.findUnique({ where: { botId } });
    // Validate tenant ownership before returning the config.
    const config =
        row && row.tenantId === tenantId
            ? {
                  requestsPerMinute: row.requestsPerMinute,
                  burstLimit: row.burstLimit,
                  enabled: row.enabled,
              }
            : null;

    configCache.set(cacheKey, { config, fetchedAt: Date.now() });
    return config;
}

export function invalidateAgentRateLimitCache(botId: string, tenantId: string): void {
    configCache.delete(`${tenantId}:${botId}`);
}
