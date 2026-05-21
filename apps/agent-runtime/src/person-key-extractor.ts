/**
 * Person-key extraction for episodic memory (Gap 4).
 *
 * AgentFarm agents talk to many roles of "other person" depending on the
 * deployed role: developers reviewing PRs, candidates being recruited,
 * customers in support tickets, prospects in sales emails, candidates in
 * Slack DMs, etc. The episodic memory store keys recall by `personKey` so
 * the agent can answer "what did we last say to *this* person".
 *
 * This module inspects task payloads and pulls out the strongest available
 * identifier, normalizing it (lowercase, trim) so it joins consistently
 * across task types. It is intentionally generic and role-agnostic — it
 * recognizes the field-name conventions used by all 12 role processors.
 *
 * Returns `null` when no identifier is present (e.g. an internal
 * `git_commit` task), in which case the caller should skip per-person
 * indexing and only record per-workspace history.
 */

const EMAIL_RX = /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/;

/**
 * Field names checked in priority order. Earlier names win because they are
 * the most identity-strong (an explicit `recipient_email` beats a generic
 * `to` which could be a phone number).
 */
const PERSON_KEY_FIELDS = [
    // Email-typed fields
    'recipient_email',
    'candidate_email',
    'customer_email',
    'contact_email',
    'lead_email',
    'prospect_email',
    'to_email',
    'to',
    'recipient',
    // Slack / Teams identifiers
    'slack_user_id',
    'teams_user_id',
    'mention_user_id',
    // CRM / ATS / generic IDs
    'candidate_id',
    'contact_id',
    'customer_id',
    'lead_id',
    'prospect_id',
    'user_id',
    // Phone / SMS
    'phone_number',
    'recipient_phone',
    // Jira / GitHub assignee-style
    'assignee',
    'reviewer',
] as const;

const LABEL_FIELDS = [
    'recipient_name',
    'candidate_name',
    'customer_name',
    'contact_name',
    'lead_name',
    'prospect_name',
    'to_name',
    'name',
] as const;

const looksLikeEmail = (value: string): boolean => EMAIL_RX.test(value.trim());

const normalizeKey = (raw: string): string => {
    const trimmed = raw.trim();
    if (!trimmed) return '';
    if (looksLikeEmail(trimmed)) {
        return trimmed.toLowerCase();
    }
    // Phone numbers: strip non-digits except leading +
    if (/^[+\d][\d\s().-]+$/.test(trimmed) && trimmed.replace(/\D/g, '').length >= 7) {
        const digits = trimmed.replace(/[^\d+]/g, '');
        return digits.startsWith('+') ? digits : `+${digits}`;
    }
    return trimmed.toLowerCase();
};

const firstNonEmptyString = (payload: Record<string, unknown>, fields: readonly string[]): string => {
    for (const field of fields) {
        const value = payload[field];
        if (typeof value === 'string' && value.trim()) {
            return value.trim();
        }
    }
    return '';
};

export interface ExtractedPerson {
    /** Normalized lowercase key suitable for memory store lookup. */
    personKey: string;
    /** Human-readable label (e.g. "Jane Doe <jane@acme.com>") for context blocks. */
    personLabel: string;
    /** Which payload field the key was extracted from (for trace logging). */
    sourceField: string;
}

/**
 * Extract a normalized person identifier from a task payload, or null if
 * no recognizable identifier is present. This is best-effort — the agent
 * still records per-workspace history regardless.
 */
export const extractPersonKeyFromPayload = (payload: Record<string, unknown>): ExtractedPerson | null => {
    if (!payload || typeof payload !== 'object') return null;

    let rawKey = '';
    let sourceField = '';
    for (const field of PERSON_KEY_FIELDS) {
        const value = payload[field];
        if (typeof value === 'string' && value.trim()) {
            rawKey = value.trim();
            sourceField = field;
            break;
        }
    }

    if (!rawKey) return null;

    const normalized = normalizeKey(rawKey);
    if (!normalized) return null;

    const labelName = firstNonEmptyString(payload, LABEL_FIELDS);
    const personLabel = labelName
        ? (looksLikeEmail(rawKey) ? `${labelName} <${rawKey}>` : `${labelName} (${rawKey})`)
        : rawKey;

    return {
        personKey: normalized,
        personLabel,
        sourceField,
    };
};
