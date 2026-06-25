import type { TriggerServiceConfig } from './types.js';

const ANTHROPIC_BASE_URL = 'https://api.anthropic.com';
const ROUTER_MODEL = 'claude-haiku-4-5-20251001';

type RoutingDecision = {
    tenantId: string;
    agentId: string;
    reason: string;
};

function buildSystemPrompt(config: TriggerServiceConfig): string {
    const tenantDescriptions = config.tenants
        .map((t) => {
            const agentLines = t.agents
                .map((a) => `    - ${a.agentId}: ${a.description}`)
                .join('\n');
            return `Tenant "${t.tenantId}" (${t.name ?? t.tenantId}):\n${agentLines}`;
        })
        .join('\n\n');

    return `You are a message routing agent for a multi-tenant AI system.
Given an inbound message, decide which tenant and agent should handle it.

Available tenants and agents:
${tenantDescriptions}

Respond ONLY with valid JSON — no markdown fences, no explanation:
{"tenantId":"...","agentId":"...","reason":"one sentence"}`;
}

/**
 * L1 — Normalize an email address for comparison: strip a display name
 * ("Recruiter <r@acme.com>" → "r@acme.com"), trim, lowercase.
 */
export function normalizeEmail(value: string | undefined): string {
    if (!value) return '';
    const angle = value.match(/<([^>]+)>/);
    const addr = angle ? angle[1]! : value;
    return addr.trim().toLowerCase();
}

/**
 * L1 — Deterministically resolve the agent whose persona mailbox matches the recipient.
 * Returns null when there's no recipient or no configured agent email matches.
 * Pure — no I/O — so it's the testable core of per-agent inbound mail routing.
 */
export function matchAgentByEmail(
    recipient: string | undefined,
    tenants: TriggerServiceConfig['tenants'],
): RoutingDecision | null {
    const target = normalizeEmail(recipient);
    if (!target) return null;
    for (const tenant of tenants) {
        for (const agent of tenant.agents) {
            if (agent.email && normalizeEmail(agent.email) === target) {
                return { tenantId: tenant.tenantId, agentId: agent.agentId, reason: `recipient ${target} matches agent mailbox` };
            }
        }
    }
    return null;
}

export class TriggerRouter {
    constructor(private readonly config: TriggerServiceConfig) { }

    async route(body: string, from: string, recipient?: string): Promise<RoutingDecision> {
        const { tenants } = this.config;

        if (tenants.length === 0) {
            throw new Error('TriggerRouter: no tenants configured');
        }

        // L1 — deterministic per-agent routing: if the recipient matches an agent's persona
        // mailbox, route straight to that agent (takes priority over LLM guessing and the
        // single-tenant default, so a multi-agent tenant still routes to the right inbox).
        const emailMatch = matchAgentByEmail(recipient, tenants);
        if (emailMatch) return emailMatch;

        // Single-tenant shortcut — skip LLM entirely
        if (tenants.length === 1) {
            const tenant = tenants[0]!;
            return {
                tenantId: tenant.tenantId,
                agentId: tenant.defaultAgentId,
                reason: 'single-tenant shortcut',
            };
        }

        // Multi-tenant — ask the LLM
        const apiKey = this.config.anthropicApiKey;
        if (!apiKey) {
            console.error('TriggerRouter: ANTHROPIC_API_KEY not set, falling back to first tenant');
            return this.fallback('missing api key');
        }

        try {
            const response = await fetch(`${ANTHROPIC_BASE_URL}/v1/messages`, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    'x-api-key': apiKey,
                    'anthropic-version': this.config.anthropicApiVersion ?? '2023-06-01',
                },
                body: JSON.stringify({
                    model: ROUTER_MODEL,
                    max_tokens: 256,
                    system: buildSystemPrompt(this.config),
                    messages: [
                        {
                            role: 'user',
                            content: `From: ${from}\nMessage: ${body}`,
                        },
                    ],
                }),
            });

            if (!response.ok) {
                console.error(`TriggerRouter: Anthropic request failed (${response.status}), falling back`);
                return this.fallback(`http_error:${response.status}`);
            }

            const parsed = await response.json() as {
                content?: Array<{ type: string; text?: string }>;
            };

            const raw = (parsed.content ?? [])
                .filter((b) => b.type === 'text')
                .map((b) => b.text ?? '')
                .join('');

            const cleaned = raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
            const decision = JSON.parse(cleaned) as RoutingDecision;

            if (!decision.tenantId || !decision.agentId) {
                throw new Error('LLM response missing tenantId or agentId');
            }

            return decision;
        } catch (err) {
            console.error('TriggerRouter: LLM routing failed, falling back:', err);
            return this.fallback(err instanceof Error ? err.message : String(err));
        }
    }

    private fallback(reason: string): RoutingDecision {
        const tenant = this.config.tenants[0]!;
        return {
            tenantId: tenant.tenantId,
            agentId: tenant.defaultAgentId,
            reason: `fallback:${reason}`,
        };
    }
}
