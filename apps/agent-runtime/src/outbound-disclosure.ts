/**
 * Outbound disclosure enforcer.
 *
 * Single chokepoint that injects the agent persona's AI-disclosure statement
 * into outbound connector / direct-API payloads regardless of which call-site
 * dispatches them. Required by:
 *   - EU AI Act Article 52
 *   - FTC AI Guidelines (clear and conspicuous disclosure)
 *   - California SB 1001 (bot disclosure in consumer-facing chat)
 *
 * This complements (and is defence-in-depth on top of):
 *   - outbound-signer.ts        — append-only signer for free-form bodies
 *   - disclosure-guard.ts       — channel-formatted disclosure builder
 *
 * Strategy:
 *   - Map (connectorType, actionType) → list of payload keys that carry
 *     human-visible content (body, text, message, html, subject).
 *   - For each such key with a non-empty string value, run the disclosure
 *     guard. Returns a new payload object — never mutates the caller's input.
 *   - Status / metadata-only actions (update_status, merge_pr, list_prs,
 *     read_task) intentionally have an empty content-key list so we don't
 *     touch payloads that have no human-visible body.
 */

import type { AgentPersonaRecord } from '@agentfarm/shared-types';
import { enforceDisclosure, type OutboundChannel } from './disclosure-guard.js';

/**
 * Minimal persona shape required for disclosure injection. Both
 * `AgentPersonaRecord` and the local `ExtractedPersona` (in
 * `local-workspace-executor.ts`) satisfy this — keeping the surface tight so
 * lightweight extraction paths don't need to construct a full record.
 */
export interface PersonaForDisclosure {
    displayName?: string | null;
    disclosureStatement?: string | null;
}

/** Re-exported for type compatibility at call-sites that already use AgentPersonaRecord. */
export type { AgentPersonaRecord };

/**
 * Per-connector / per-action map of payload keys that carry human-visible
 * content. The disclosure guard is applied to every listed key whose value is
 * a non-empty string.
 */
const CONTENT_KEYS_BY_ACTION: Record<string, string[]> = {
    // Email
    send_email: ['body', 'html'],
    // Chat / messaging
    send_message: ['text', 'message', 'body'],
    // Comments (Jira, GitHub, GitLab, Linear)
    create_comment: ['body'],
    create_pr_comment: ['body'],
    create_issue: ['body'],
    comment_issue: ['body'],
    // Pull requests
    create_pr: ['body'],
    // Documents / pages
    create_document: ['body', 'content'],
    update_document: ['body', 'content'],
    // No-op for non-content actions
    update_status: [],
    list_prs: [],
    merge_pr: [],
    read_task: [],
    read_document: [],
    schedule_meeting: ['description'],
};

const DEFAULT_CONTENT_KEYS = ['body', 'text', 'message', 'content'];

/**
 * Best-effort mapping of connector type → outbound channel for formatting.
 */
function channelForConnector(connectorType: string): OutboundChannel {
    const normalized = connectorType.toLowerCase();
    if (normalized === 'email' || normalized === 'gmail' || normalized === 'outlook'
        || normalized === 'sendgrid' || normalized === 'mailgun' || normalized === 'smtp') {
        return 'email';
    }
    if (normalized === 'slack') return 'slack';
    if (normalized === 'github' || normalized === 'gitlab') return 'pr';
    return 'chat';
}

export interface ApplyDisclosureResult {
    payload: Record<string, unknown>;
    modifiedFields: string[];
}

/**
 * Returns a new payload with disclosure injected into every content-bearing
 * field. Idempotent — if disclosure is already present, the field is left
 * untouched and not reported as modified.
 *
 * Returns the original payload (by reference) when persona has no
 * disclosure statement, to avoid unnecessary allocation.
 */
export function applyDisclosureToConnectorPayload(args: {
    connectorType: string;
    actionType: string;
    payload: Record<string, unknown>;
    persona: PersonaForDisclosure | null | undefined;
    channelOverride?: OutboundChannel;
}): ApplyDisclosureResult {
    const { connectorType, actionType, payload, persona, channelOverride } = args;
    const disclosure = persona?.disclosureStatement?.trim();
    if (!disclosure) {
        return { payload, modifiedFields: [] };
    }

    const keys = CONTENT_KEYS_BY_ACTION[actionType] ?? DEFAULT_CONTENT_KEYS;
    if (keys.length === 0) {
        return { payload, modifiedFields: [] };
    }

    const channel: OutboundChannel = channelOverride ?? channelForConnector(connectorType);
    const next: Record<string, unknown> = { ...payload };
    const modifiedFields: string[] = [];

    for (const key of keys) {
        const value = next[key];
        if (typeof value !== 'string' || value.trim().length === 0) continue;
        const result = enforceDisclosure(value, {
            disclosureStatement: disclosure,
            agentDisplayName: persona?.displayName ?? undefined,
            channel,
        });
        if (result.wasModified) {
            next[key] = result.body;
            modifiedFields.push(key);
        }
    }

    return modifiedFields.length > 0
        ? { payload: next, modifiedFields }
        : { payload, modifiedFields: [] };
}

/**
 * Convenience wrapper for direct-string call-sites (Slack notify, PR review
 * body, bug-report body) that compose their own message strings outside the
 * connector dispatcher.
 */
export function applyDisclosureToText(args: {
    text: string;
    persona: PersonaForDisclosure | null | undefined;
    channel: OutboundChannel;
}): { text: string; wasModified: boolean } {
    const disclosure = args.persona?.disclosureStatement?.trim();
    if (!disclosure || !args.text) {
        return { text: args.text, wasModified: false };
    }
    const result = enforceDisclosure(args.text, {
        disclosureStatement: disclosure,
        agentDisplayName: args.persona?.displayName ?? undefined,
        channel: args.channel,
    });
    return { text: result.body, wasModified: result.wasModified };
}

/**
 * One-shot meeting disclosure announcement. Use at the start of a meeting
 * speech session to satisfy live-audio disclosure requirements (EU AI Act
 * Article 52(1) requires AI systems interacting with humans to inform them).
 *
 * Returns the announcement text or an empty string when persona has no
 * disclosure statement configured.
 */
export function buildMeetingDisclosureAnnouncement(
    persona: PersonaForDisclosure | null | undefined,
): string {
    const disclosure = persona?.disclosureStatement?.trim();
    if (!disclosure) return '';
    const name = persona?.displayName ? `${persona.displayName} — ` : '';
    return `${name}${disclosure}`;
}
