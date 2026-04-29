import type { ExternalPluginLoadRecord, PluginCapabilityAllowlist } from '@agentfarm/shared-types';

export type PluginCapabilityGuardInput = {
    tenantId: string;
    workspaceId: string;
    pluginKey: string;
    capability: string;
    loadRecords: ExternalPluginLoadRecord[];
    allowlists: PluginCapabilityAllowlist[];
};

export type PluginCapabilityGuardDecision = {
    allowed: boolean;
    reason?: 'plugin_not_loaded' | 'plugin_not_trusted' | 'capability_not_allowlisted';
};

export const evaluatePluginCapabilityGuard = (
    input: PluginCapabilityGuardInput,
): PluginCapabilityGuardDecision => {
    const latestRecord = input.loadRecords
        .filter(
            (record) => record.tenantId === input.tenantId
                && record.workspaceId === input.workspaceId
                && record.pluginKey === input.pluginKey,
        )
        .sort((a, b) => (a.loadedAt > b.loadedAt ? -1 : 1))[0];

    if (!latestRecord || latestRecord.loadStatus !== 'loaded') {
        return { allowed: false, reason: 'plugin_not_loaded' };
    }

    if (latestRecord.trustLevel !== 'trusted') {
        return { allowed: false, reason: 'plugin_not_trusted' };
    }

    const allowlist = input.allowlists.find(
        (row) => row.tenantId === input.tenantId
            && row.workspaceId === input.workspaceId
            && row.pluginKey === input.pluginKey,
    );

    if (!allowlist || !allowlist.allowedCapabilities.includes(input.capability)) {
        return { allowed: false, reason: 'capability_not_allowlisted' };
    }

    return { allowed: true };
};
