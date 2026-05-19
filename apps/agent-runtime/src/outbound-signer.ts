/**
 * Outbound message signer — enforces EU AI Act / FTC disclosure requirements.
 *
 * Programmatically appends the agent persona's disclosure statement to any
 * outbound message content when:
 *   - The persona has a non-empty disclosureStatement, AND
 *   - The message does not already contain the disclosure text.
 *
 * This is a defence-in-depth layer on top of the LLM system-prompt instruction
 * in system-prompt-builder.ts, which instructs the model to self-append.
 *
 * Usage:
 *   import { signOutbound } from './outbound-signer.js';
 *   const body = signOutbound(draftBody, persona);
 */

import type { AgentPersonaRecord } from '@agentfarm/shared-types';

/**
 * Append the persona disclosure statement to `content` if not already present.
 *
 * Returns `content` unchanged when:
 * - `persona` is null / undefined, OR
 * - `persona.disclosureStatement` is falsy, OR
 * - `content` already contains the disclosure statement (idempotent).
 */
export function signOutbound(
    content: string,
    persona: AgentPersonaRecord | null | undefined,
): string {
    const disclosure = persona?.disclosureStatement?.trim();
    if (!disclosure) return content;
    if (content.includes(disclosure)) return content;
    return `${content}\n\n${disclosure}`;
}
