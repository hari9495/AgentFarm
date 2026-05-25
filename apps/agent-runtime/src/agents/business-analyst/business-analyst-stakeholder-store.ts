/**
 * Business Analyst — Stakeholder Profile Store
 *
 * Persists StakeholderProfile objects to the gateway's long-term memory
 * patterns API so they survive across sessions and accumulate intelligence
 * through repeated interactions.
 *
 * The action handler uses this to:
 *   - Auto-load a profile at the start of any BA task when payload.stakeholder_id
 *     is present, even if no profile was explicitly passed by the caller.
 *   - Auto-save an updated profile (with bumped confidence + new history entry)
 *     at the end of every BA task that has a known stakeholder.
 *
 * Pattern format:
 *   key:      stakeholder_profile:<stakeholderId>
 *   summary:  "<name> (<role>) — <approval_rate>% approval rate, <n> interactions"
 *   metadata: { profile: <serialized JSON> }
 *
 * All functions are safe to call concurrently and never throw — failures are
 * logged and swallowed so they don't block the main action pipeline.
 */

import {
    type StakeholderProfile,
    type StakeholderInteractionOutcome,
    createDefaultStakeholderProfile,
    serializeStakeholderProfile,
    deserializeStakeholderProfile,
    applyInteractionOutcome,
    stakeholderPatternKey,
} from './business-analyst-stakeholder-profile.js';

// ---------------------------------------------------------------------------
// Load
// ---------------------------------------------------------------------------

/**
 * Load a StakeholderProfile from the gateway memory patterns API.
 *
 * Returns null when:
 *   - The stakeholder has never been seen before (first interaction)
 *   - The gateway call fails
 *   - The stored JSON is malformed
 */
export async function loadStakeholderProfile(
    stakeholderId: string,
    workspaceId: string,
    gatewayBaseUrl: string,
    serviceToken: string,
): Promise<StakeholderProfile | null> {
    const base = gatewayBaseUrl.replace(/\/+$/, '');
    try {
        const res = await fetch(
            `${base}/v1/workspaces/${encodeURIComponent(workspaceId)}/memory/patterns`,
            {
                method: 'GET',
                headers: {
                    'content-type': 'application/json',
                    Authorization: `Bearer ${serviceToken}`,
                },
                signal: AbortSignal.timeout(10_000),
            },
        );

        if (!res.ok) return null;

        const data = (await res.json()) as {
            patterns?: Array<{
                pattern?: string;
                summary?: string;
                metadata?: Record<string, unknown>;
            }>;
        };

        const targetKey = stakeholderPatternKey(stakeholderId);
        const record = (data.patterns ?? []).find((p) => p.pattern === targetKey);
        if (!record) return null;

        // Try metadata.profile first (full JSON), then fall back to summary
        const rawProfile =
            typeof record.metadata?.['profile'] === 'string'
                ? record.metadata['profile']
                : record.summary ?? '';

        return deserializeStakeholderProfile(rawProfile);
    } catch (err) {
        console.warn(`[ba-stakeholder-store] load failed for ${stakeholderId}: ${String(err)}`);
        return null;
    }
}

// ---------------------------------------------------------------------------
// Save
// ---------------------------------------------------------------------------

/**
 * Persist a StakeholderProfile to the gateway memory patterns API.
 *
 * If the profile already exists it is overwritten (upsert by pattern key).
 * Fire-and-forget safe — callers should not await for critical-path code.
 */
export async function saveStakeholderProfile(
    profile: StakeholderProfile,
    workspaceId: string,
    gatewayBaseUrl: string,
    serviceToken: string,
): Promise<void> {
    const base = gatewayBaseUrl.replace(/\/+$/, '');

    const approvals = profile.approvalHistory.filter((e) => e.outcome === 'approved').length;
    const total = profile.approvalHistory.length;
    const approvalRate = total > 0 ? Math.round((approvals / total) * 100) : 0;
    const roleLabel = profile.role ? ` (${profile.role})` : '';

    const summary = `${profile.name}${roleLabel} — ${approvalRate}% approval rate, ${total} interaction(s)`;
    const serialized = serializeStakeholderProfile(profile);

    try {
        await fetch(`${base}/v1/memory/patterns`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                Authorization: `Bearer ${serviceToken}`,
            },
            body: JSON.stringify({
                tenantId: '', // tenantId not available here; gateway infers from token
                workspaceId,
                pattern: stakeholderPatternKey(profile.stakeholderId),
                summary,
                confidence: profile.confidence,
                observedCount: total,
                lastSeen: profile.lastInteractionAt,
                metadata: {
                    profile: serialized, // full profile for lossless reconstruction
                    stakeholderId: profile.stakeholderId,
                    name: profile.name,
                    email: profile.email,
                    role: profile.role,
                },
            }),
            signal: AbortSignal.timeout(10_000),
        });
    } catch (err) {
        console.warn(`[ba-stakeholder-store] save failed for ${profile.stakeholderId}: ${String(err)}`);
    }
}

// ---------------------------------------------------------------------------
// Load-or-create
// ---------------------------------------------------------------------------

/**
 * Load a stakeholder profile from persistent storage, or create a minimal
 * default profile for a first-time stakeholder.
 *
 * Use this when you have a stakeholder ID but don't know if a profile exists:
 *
 * ```ts
 * const profile = await ensureStakeholderProfile(
 *   'user@example.com', 'Alice Smith', workspaceId, ...
 * );
 * ```
 */
export async function ensureStakeholderProfile(
    stakeholderId: string,
    name: string,
    email: string,
    workspaceId: string,
    gatewayBaseUrl: string,
    serviceToken: string,
    role?: string,
): Promise<StakeholderProfile> {
    const existing = await loadStakeholderProfile(
        stakeholderId,
        workspaceId,
        gatewayBaseUrl,
        serviceToken,
    );

    if (existing) return existing;

    // First interaction — create a default profile and persist it
    const profile = createDefaultStakeholderProfile(stakeholderId, name, email, role);
    await saveStakeholderProfile(profile, workspaceId, gatewayBaseUrl, serviceToken);
    return profile;
}

// ---------------------------------------------------------------------------
// Record interaction outcome (load → update → save)
// ---------------------------------------------------------------------------

/**
 * Record the outcome of a BA deliverable interaction and save the updated
 * profile back to persistent storage.
 *
 * Call this after every approval / rejection / revision to keep the
 * stakeholder intelligence current.
 *
 * Returns the updated profile, or null if the stakeholder is not found.
 */
export async function recordStakeholderOutcome(
    stakeholderId: string,
    outcome: Omit<StakeholderInteractionOutcome, 'stakeholderId'>,
    workspaceId: string,
    gatewayBaseUrl: string,
    serviceToken: string,
): Promise<StakeholderProfile | null> {
    const profile = await loadStakeholderProfile(
        stakeholderId,
        workspaceId,
        gatewayBaseUrl,
        serviceToken,
    );

    if (!profile) return null;

    const updated = applyInteractionOutcome(profile, { stakeholderId, ...outcome });
    await saveStakeholderProfile(updated, workspaceId, gatewayBaseUrl, serviceToken);
    return updated;
}

// ---------------------------------------------------------------------------
// List all stakeholder profiles in a workspace
// ---------------------------------------------------------------------------

/**
 * Load all StakeholderProfiles stored in a workspace.
 *
 * Used by buildStakeholderContext() to inject multi-stakeholder intelligence
 * into a BA system prompt.
 */
export async function listWorkspaceStakeholders(
    workspaceId: string,
    gatewayBaseUrl: string,
    serviceToken: string,
): Promise<StakeholderProfile[]> {
    const base = gatewayBaseUrl.replace(/\/+$/, '');
    try {
        const res = await fetch(
            `${base}/v1/workspaces/${encodeURIComponent(workspaceId)}/memory/patterns`,
            {
                method: 'GET',
                headers: {
                    'content-type': 'application/json',
                    Authorization: `Bearer ${serviceToken}`,
                },
                signal: AbortSignal.timeout(10_000),
            },
        );

        if (!res.ok) return [];

        const data = (await res.json()) as {
            patterns?: Array<{
                pattern?: string;
                metadata?: Record<string, unknown>;
                summary?: string;
            }>;
        };

        return (data.patterns ?? [])
            .filter((p) => typeof p.pattern === 'string' && p.pattern.startsWith('stakeholder_profile:'))
            .map((p) => {
                const raw =
                    typeof p.metadata?.['profile'] === 'string'
                        ? p.metadata['profile']
                        : p.summary ?? '';
                return deserializeStakeholderProfile(raw);
            })
            .filter((p): p is StakeholderProfile => p !== null);
    } catch (err) {
        console.warn(`[ba-stakeholder-store] listWorkspaceStakeholders failed: ${String(err)}`);
        return [];
    }
}
