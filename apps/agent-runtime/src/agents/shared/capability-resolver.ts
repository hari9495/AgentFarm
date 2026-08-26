/**
 * capability-resolver.ts — the one rule every agent action follows to decide
 * HOW to do a piece of work: use a native API connector if the workspace has
 * one, otherwise fall back to the browser tier and do it by hand (the way a
 * human employee would when an app has no API).
 *
 *   native connector (has a live token)  →  else  →  browser (workspace_web_*)
 *
 * The generic-REST rung lives inside the connector executors themselves, so
 * from an action's point of view the ladder is just native-or-browser.
 *
 * Never throws — any failure resolves to the browser tier, because "do it by
 * hand" is always available and never worse than losing the work.
 */

import { resolveAllConnectorTokens } from '../../connector-token-resolver.js';

export type CapabilityResolution =
    | { tier: 'native'; connectorType: string }
    | { tier: 'browser'; reason: string };

export interface ResolveCapabilityInput {
    /**
     * Native connector types that can perform this action, in preference order.
     * Empty means no API exists for this action at all → always browser.
     */
    nativeConnectors: readonly string[];
    workspaceId: string | undefined;
    gatewayBaseUrl: string | undefined;
    serviceToken: string | undefined;
}

export async function resolveActionCapability(
    input: ResolveCapabilityInput,
): Promise<CapabilityResolution> {
    const { nativeConnectors, workspaceId, gatewayBaseUrl, serviceToken } = input;

    if (nativeConnectors.length === 0) {
        return { tier: 'browser', reason: 'no native connector exists for this action' };
    }
    if (!workspaceId || !gatewayBaseUrl || !serviceToken) {
        return { tier: 'browser', reason: 'missing workspace context to resolve a native connector' };
    }

    try {
        const tokens = await resolveAllConnectorTokens(nativeConnectors, workspaceId, {
            gatewayUrl: gatewayBaseUrl,
            sessionToken: serviceToken,
        });
        const connected = nativeConnectors.find((type) => tokens[type]);
        return connected
            ? { tier: 'native', connectorType: connected }
            : { tier: 'browser', reason: 'no native connector configured for this workspace' };
    } catch {
        return { tier: 'browser', reason: 'could not resolve connector tokens' };
    }
}
