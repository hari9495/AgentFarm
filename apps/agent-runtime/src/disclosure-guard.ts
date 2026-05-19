/**
 * Disclosure guard — Sprint 13
 *
 * Ensures every outbound message sent by an AgentFarm agent carries a visible
 * AI disclosure statement as required by:
 *   - EU AI Act Article 52 (AI-generated content must be disclosed)
 *   - FTC AI Guidelines (clear and conspicuous disclosure)
 *   - California SB 1001 (bot disclosure in consumer-facing chat)
 *
 * The guard is called by each outbound channel handler (email, Slack, PR, chat)
 * before the message is transmitted. It:
 *   1. Checks whether the disclosure statement is already present in the message.
 *   2. If absent, appends the persona disclosure statement in a channel-appropriate format.
 *   3. Returns the (potentially modified) message body.
 *
 * The guard does NOT make network calls — it is a pure string transformation.
 * Recording the ack event is the responsibility of the caller after transmission.
 */

export type OutboundChannel = 'email' | 'slack' | 'pr' | 'meeting' | 'chat';

export interface DisclosureGuardOptions {
    /** The agent persona's configured disclosure statement. */
    disclosureStatement: string;
    /** Agent display name for enriched disclosure messages. */
    agentDisplayName?: string;
    /** Outbound channel — affects formatting. */
    channel: OutboundChannel;
}

/**
 * Detects whether a disclosure statement is already embedded in `text`.
 * The check is case-insensitive so minor formatting differences are tolerated.
 */
export function isDisclosurePresent(text: string, disclosureStatement: string): boolean {
    if (!text || !disclosureStatement) return false;
    return text.toLowerCase().includes(disclosureStatement.toLowerCase().slice(0, 40));
}

/**
 * Formats the disclosure statement in a channel-appropriate style.
 */
export function formatDisclosure(options: DisclosureGuardOptions): string {
    const { disclosureStatement, agentDisplayName, channel } = options;
    const name = agentDisplayName ? ` (${agentDisplayName})` : '';
    switch (channel) {
        case 'email':
            return `\n\n---\n${disclosureStatement}${name}`;
        case 'slack':
            return `\n> _${disclosureStatement}${name}_`;
        case 'pr':
            return `\n\n> **AI Agent Notice**: ${disclosureStatement}${name}`;
        case 'meeting':
            return `\n\n[AI Disclosure: ${disclosureStatement}${name}]`;
        case 'chat':
            return `\n\n_${disclosureStatement}${name}_`;
    }
}

/**
 * Enforces the presence of the disclosure statement in an outbound message.
 *
 * Returns the original `body` if disclosure is already present, or a new string
 * with the disclosure appended if it was missing.
 *
 * Also returns a boolean `wasModified` so callers can audit when disclosure was injected.
 */
export function enforceDisclosure(
    body: string,
    options: DisclosureGuardOptions,
): { body: string; wasModified: boolean } {
    if (isDisclosurePresent(body, options.disclosureStatement)) {
        return { body, wasModified: false };
    }
    return {
        body: body + formatDisclosure(options),
        wasModified: true,
    };
}

/**
 * Builds a compliance summary string suitable for logging / audit trails.
 */
export function buildDisclosureAuditNote(
    channel: OutboundChannel,
    wasModified: boolean,
    recipientId?: string,
): string {
    const action = wasModified ? 'disclosure_injected' : 'disclosure_present';
    const recipient = recipientId ? ` recipientId=${recipientId}` : '';
    return `disclosure_guard channel=${channel} action=${action}${recipient}`;
}
