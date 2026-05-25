/**
 * Business Analyst — Stakeholder Profile
 *
 * Defines the StakeholderProfile type and helpers for reading/writing stakeholder
 * relationship data via the long-term memory service.
 *
 * Stakeholder profiles are persisted as long-term memory patterns with a key of
 * `stakeholder_profile:${stakeholderId}` so they survive across sessions and
 * accumulate richness through repeated interactions.
 *
 * These helpers are PURE — they perform no I/O.  The action handler is
 * responsible for POSTing / GETting patterns from the memory API:
 *   • POST /v1/memory/patterns                    — write / update a pattern
 *   • GET  /v1/workspaces/:workspaceId/memory/patterns — read patterns
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type StakeholderCommunicationStyle =
    | 'direct'        // Values brevity, bullets, no preamble
    | 'narrative'     // Prefers context and explanation before conclusions
    | 'data-driven'  // Needs numbers, evidence, and charts
    | 'collaborative' // Wants to co-create rather than receive finished artefacts
    | 'formal';       // Expects structured documents with precise language

export type StakeholderDecisionMakingStyle =
    | 'top-down'   // Decides unilaterally; wants options ranked
    | 'consensus'  // Needs buy-in from the team before deciding
    | 'analytical' // Delays until all data is available
    | 'intuitive'; // Makes fast decisions based on gut feel

export type StakeholderDetailLevel = 'summary' | 'standard' | 'exhaustive';

/** A friction point captured from a previous interaction. */
export interface StakeholderFrictionPoint {
    /** Short human-readable description of what caused friction. */
    description: string;
    /** ISO-8601 timestamp of the interaction where friction was observed. */
    observedAt: string;
}

/** A record of how a stakeholder responded to a BA deliverable. */
export interface ApprovalHistoryEntry {
    documentId: string;
    documentType: 'user_story' | 'brd' | 'acceptance_criteria' | 'gap_analysis' | 'process_map';
    outcome: 'approved' | 'rejected' | 'revised';
    /** Reason provided when outcome is rejected or revised. */
    rejectionReason?: string;
    /**
     * Structured signal extracted from rejection patterns.
     * Examples: 'too_vague', 'missing_metrics', 'scope_unclear', 'wrong_format'.
     */
    qualitySignal?: string;
    recordedAt: string;
}

/**
 * A stakeholder profile stored in long-term memory.
 * Grows richer through repeated interactions — confidence increases with each
 * recorded outcome.
 */
export interface StakeholderProfile {
    /** Unique identifier — typically an email address or Jira/Slack user ID. */
    stakeholderId: string;
    name: string;
    email: string;
    /** e.g. 'Product Owner', 'CTO', 'Engineering Manager'. */
    role?: string;
    communicationStyle: StakeholderCommunicationStyle;
    decisionMakingStyle: StakeholderDecisionMakingStyle;
    preferredDetailLevel: StakeholderDetailLevel;
    /** Recurring friction points observed across interactions. */
    frictionPoints: StakeholderFrictionPoint[];
    /** History of approval / rejection outcomes for documents sent to this stakeholder. */
    approvalHistory: ApprovalHistoryEntry[];
    /** ISO-8601 timestamp of the most recent interaction. */
    lastInteractionAt: string;
    /**
     * Confidence score in [0, 1].  Starts at 0.1 for a first-time stakeholder
     * and increases by 0.05 per recorded outcome (capped at 0.95).
     */
    confidence: number;
}

/** Input used to record the outcome of a single stakeholder interaction. */
export interface StakeholderInteractionOutcome {
    stakeholderId: string;
    documentId: string;
    documentType: ApprovalHistoryEntry['documentType'];
    outcome: ApprovalHistoryEntry['outcome'];
    rejectionReason?: string;
    qualitySignal?: string;
}

// ---------------------------------------------------------------------------
// Memory serialization
// ---------------------------------------------------------------------------

/** The pattern key prefix used in the long-term memory store. */
const PATTERN_PREFIX = 'stakeholder_profile';

/** Build the pattern key for a given stakeholder. */
export function stakeholderPatternKey(stakeholderId: string): string {
    return `${PATTERN_PREFIX}:${stakeholderId}`;
}

/**
 * Serialize a StakeholderProfile into the `pattern` string persisted in
 * long-term memory.  The value is JSON so deserialization is lossless.
 */
export function serializeStakeholderProfile(profile: StakeholderProfile): string {
    return JSON.stringify(profile);
}

/**
 * Deserialize a raw pattern string back into a StakeholderProfile.
 * Returns null if the JSON is malformed or required fields are absent.
 */
export function deserializeStakeholderProfile(raw: string): StakeholderProfile | null {
    try {
        const parsed = JSON.parse(raw) as Partial<StakeholderProfile>;
        if (!parsed.stakeholderId || !parsed.name || !parsed.email) return null;
        return {
            stakeholderId: parsed.stakeholderId,
            name: parsed.name,
            email: parsed.email,
            role: parsed.role,
            communicationStyle: parsed.communicationStyle ?? 'direct',
            decisionMakingStyle: parsed.decisionMakingStyle ?? 'analytical',
            preferredDetailLevel: parsed.preferredDetailLevel ?? 'standard',
            frictionPoints: parsed.frictionPoints ?? [],
            approvalHistory: parsed.approvalHistory ?? [],
            lastInteractionAt: parsed.lastInteractionAt ?? new Date().toISOString(),
            confidence: parsed.confidence ?? 0.1,
        };
    } catch {
        return null;
    }
}

// ---------------------------------------------------------------------------
// Profile factory
// ---------------------------------------------------------------------------

/**
 * Create a minimal stakeholder profile for a first-time interaction.
 * Confidence starts at 0.1 and grows with each recorded outcome.
 */
export function createDefaultStakeholderProfile(
    stakeholderId: string,
    name: string,
    email: string,
    role?: string,
): StakeholderProfile {
    return {
        stakeholderId,
        name,
        email,
        role,
        communicationStyle: 'direct',
        decisionMakingStyle: 'analytical',
        preferredDetailLevel: 'standard',
        frictionPoints: [],
        approvalHistory: [],
        lastInteractionAt: new Date().toISOString(),
        confidence: 0.1,
    };
}

// ---------------------------------------------------------------------------
// Profile mutation helpers
// ---------------------------------------------------------------------------

/**
 * Record the outcome of a BA deliverable interaction and return an updated
 * profile with adjusted confidence and friction points.
 *
 * Call this BEFORE writing the updated profile back to long-term memory.
 */
export function applyInteractionOutcome(
    profile: StakeholderProfile,
    outcome: StakeholderInteractionOutcome,
): StakeholderProfile {
    const entry: ApprovalHistoryEntry = {
        documentId: outcome.documentId,
        documentType: outcome.documentType,
        outcome: outcome.outcome,
        rejectionReason: outcome.rejectionReason,
        qualitySignal: outcome.qualitySignal,
        recordedAt: new Date().toISOString(),
    };

    const updatedHistory = [...profile.approvalHistory, entry];

    // Accumulate friction points when a rejection carries an explicit reason
    const updatedFrictionPoints = [...profile.frictionPoints];
    if (outcome.outcome === 'rejected' && outcome.rejectionReason) {
        updatedFrictionPoints.push({
            description: outcome.rejectionReason,
            observedAt: entry.recordedAt,
        });
    }

    // Confidence grows 0.05 per interaction, capped at 0.95
    const newConfidence = Math.min(0.95, profile.confidence + 0.05);

    return {
        ...profile,
        approvalHistory: updatedHistory,
        frictionPoints: updatedFrictionPoints,
        lastInteractionAt: entry.recordedAt,
        confidence: newConfidence,
    };
}

/**
 * Return the most common quality signal from this stakeholder's rejections,
 * or undefined if there is no repeated pattern (requires ≥ 2 occurrences).
 *
 * Used by buildStakeholderContext() to surface coaching hints to the LLM.
 */
export function dominantRejectionSignal(profile: StakeholderProfile): string | undefined {
    const signals = profile.approvalHistory
        .filter((e) => e.outcome === 'rejected' && e.qualitySignal)
        .map((e) => e.qualitySignal as string);

    if (signals.length === 0) return undefined;

    const freq = new Map<string, number>();
    for (const s of signals) {
        freq.set(s, (freq.get(s) ?? 0) + 1);
    }

    let topSignal = '';
    let topCount = 0;
    for (const [signal, count] of freq) {
        if (count > topCount) {
            topSignal = signal;
            topCount = count;
        }
    }
    return topCount >= 2 ? topSignal : undefined;
}

// ---------------------------------------------------------------------------
// LLM context builder
// ---------------------------------------------------------------------------

/**
 * Format a list of stakeholder profiles into a concise context block for
 * injection into a BA agent system prompt.
 *
 * The block is intentionally terse — the goal is actionable guidance for the
 * LLM, not a complete data dump of every stored field.
 */
export function buildStakeholderContext(profiles: StakeholderProfile[]): string {
    if (profiles.length === 0) return '';

    const lines: string[] = ['## Stakeholder Intelligence\n'];

    for (const p of profiles) {
        const roleLabel = p.role ? ` (${p.role})` : '';
        lines.push(`### ${p.name}${roleLabel} — ${p.email}`);
        lines.push(`- Communication style: ${p.communicationStyle}`);
        lines.push(`- Decision-making style: ${p.decisionMakingStyle}`);
        lines.push(`- Preferred detail level: ${p.preferredDetailLevel}`);

        const rejectionSignal = dominantRejectionSignal(p);
        if (rejectionSignal) {
            lines.push(
                `- Recurring rejection pattern: "${rejectionSignal}" — address this proactively before sending`,
            );
        }

        if (p.frictionPoints.length > 0) {
            const recent = p.frictionPoints
                .slice(-3)
                .map((f) => `"${f.description}"`)
                .join(', ');
            lines.push(`- Known friction points: ${recent}`);
        }

        const totalInteractions = p.approvalHistory.length;
        const approvals = p.approvalHistory.filter((e) => e.outcome === 'approved').length;
        if (totalInteractions > 0) {
            lines.push(`- Approval rate: ${approvals}/${totalInteractions} deliverables`);
        }

        lines.push('');
    }

    return lines.join('\n');
}
