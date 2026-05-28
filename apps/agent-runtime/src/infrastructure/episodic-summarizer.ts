/**
 * episodic-summarizer.ts — compress large episodic context blocks using Haiku.
 *
 * Episodic context is injected raw (up to 12,000 chars) into every classification
 * prompt. For workspaces with rich history this is expensive. This module
 * compresses it once with claude-haiku-4-5 (speed_first tier, ~$0.0003/call)
 * and caches the result in Redis for 15 minutes — paying the compression cost
 * only when new events arrive, not on every task.
 *
 * Falls back to truncation if no Anthropic key is configured or the call fails.
 */

import { createHash } from 'node:crypto';
import { getRedisClient } from '@agentfarm/redis-client';

const SUMMARY_CACHE_TTL_S = 900;          // 15 minutes
const SUMMARY_CACHE_PREFIX = 'af:ep_sum:v1:';
const COMPRESS_THRESHOLD = 2_000;          // chars — skip summarization below this
const SUMMARY_MAX_TOKENS = 400;
const SUMMARIZER_TIMEOUT_MS = 8_000;
const TRUNCATE_FALLBACK_LENGTH = 2_000;

export async function getCompressedEpisodicContext(
    workspaceId: string,
    raw: string,
): Promise<string> {
    if (raw.length <= COMPRESS_THRESHOLD) return raw;

    const inputHash = createHash('sha256').update(raw).digest('hex').slice(0, 16);
    const cacheKey = `${SUMMARY_CACHE_PREFIX}${workspaceId}:${inputHash}`;
    const redis = getRedisClient();

    if (redis) {
        const cached = await redis.get(cacheKey).catch(() => null);
        if (cached) return cached;
    }

    const summary = await summarizeWithHaiku(raw);
    const result = summary ?? raw.slice(0, TRUNCATE_FALLBACK_LENGTH);

    if (redis && summary) {
        await redis.set(cacheKey, result, 'EX', SUMMARY_CACHE_TTL_S).catch(() => {});
    }

    return result;
}

async function summarizeWithHaiku(episodicContext: string): Promise<string | null> {
    const apiKey =
        process.env['AF_ANTHROPIC_API_KEY'] ??
        process.env['AGENTFARM_ANTHROPIC_API_KEY'] ??
        process.env['ANTHROPIC_API_KEY'];
    if (!apiKey?.trim()) return null;

    const model =
        process.env['AF_ANTHROPIC_MODEL_SPEED_FIRST'] ??
        process.env['AGENTFARM_ANTHROPIC_MODEL_SPEED_FIRST'] ??
        'claude-haiku-4-5';

    try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
                model,
                max_tokens: SUMMARY_MAX_TOKENS,
                temperature: 0,
                messages: [
                    {
                        role: 'user',
                        content:
                            'Summarize this agent task history in under 300 words. ' +
                            'Keep: action types, outcomes, files changed, error patterns. ' +
                            'Omit: timestamps, UUIDs, redundant details.\n\n' +
                            episodicContext,
                    },
                ],
            }),
            signal: AbortSignal.timeout(SUMMARIZER_TIMEOUT_MS),
        });

        if (!response.ok) return null;

        const parsed = await response.json() as {
            content?: Array<{ type: string; text?: string }>;
        };
        return parsed.content?.find((b) => b.type === 'text')?.text?.trim() ?? null;
    } catch {
        return null;
    }
}
