/**
 * connector-email.ts — the bridge between role agents and the native email
 * connectors.
 *
 * Agents used to reach email only through MCP_GMAIL_URL / MCP_OUTLOOK_URL /
 * MCP_SMTP_URL env vars pointing at MCP servers. Meanwhile the platform grew
 * first-class gmail/outlook executors (provider-clients.ts) that no agent could
 * reach, because agent handlers were never given the connector execute client.
 *
 * This picks whichever email connector the workspace actually has a live token
 * for and dispatches `send_email` through it, using the same
 * connectorActionExecuteClient the executor already uses for
 * workspace_slack_notify.
 */

import { resolveAllConnectorTokens } from '../../connector-token-resolver.js';
import type { LocalWorkspaceConnectorClient } from '../../local-workspace-executor.js';

/**
 * Preference order. gmail/outlook are first-class executors; the generic REST
 * and SMTP paths are the escape hatch for everything else. First one with a
 * live token wins — there is no scoring, because a workspace configuring two
 * mail providers has already expressed its preference by connecting one.
 */
const EMAIL_CONNECTORS = ['gmail', 'outlook', 'generic_rest_email', 'generic_smtp'] as const;

export type ConnectorEmailResult =
    | { sent: true; connectorType: string; statusCode: number; attempts: number }
    | { sent: false; reason: string; triedConnectors: readonly string[] };

export interface SendEmailViaConnectorInput {
    connectorClient: LocalWorkspaceConnectorClient | undefined;
    workspaceId: string | undefined;
    gatewayBaseUrl: string | undefined;
    serviceToken: string | undefined;
    to: string;
    subject: string;
    body: string;
    /** Optional thread/reply context passed straight through to the executor. */
    inReplyTo?: string | undefined;
}

/**
 * Send an email through the workspace's configured email connector.
 *
 * Never throws — every failure path returns { sent: false, reason }, so callers
 * can fall back to returning a composed draft for manual dispatch rather than
 * losing the agent's work to an exception.
 */
export async function sendEmailViaConnector(
    input: SendEmailViaConnectorInput,
): Promise<ConnectorEmailResult> {
    const { connectorClient, workspaceId, gatewayBaseUrl, serviceToken } = input;

    if (!connectorClient) {
        return { sent: false, reason: 'no connector client available', triedConnectors: [] };
    }
    if (!workspaceId || !gatewayBaseUrl || !serviceToken) {
        return {
            sent: false,
            reason: 'workspaceId, gatewayBaseUrl and serviceToken are required to resolve an email connector',
            triedConnectors: [],
        };
    }

    let configured: string[];
    try {
        const tokens = await resolveAllConnectorTokens(EMAIL_CONNECTORS, workspaceId, {
            gatewayUrl: gatewayBaseUrl,
            sessionToken: serviceToken,
        });
        configured = EMAIL_CONNECTORS.filter((type) => tokens[type]);
    } catch {
        return {
            sent: false,
            reason: 'could not resolve connector tokens',
            triedConnectors: [],
        };
    }

    if (configured.length === 0) {
        return {
            sent: false,
            reason: 'no email connector configured for this workspace',
            triedConnectors: EMAIL_CONNECTORS,
        };
    }

    // Only the first configured connector is attempted. Falling through to a
    // second provider on failure risks double-sending when the failure is a
    // timeout on a request the provider actually accepted.
    const connectorType = configured[0]!;
    const result = await connectorClient({
        connectorType,
        actionType: 'send_email',
        payload: {
            to: input.to,
            subject: input.subject,
            body: input.body,
            ...(input.inReplyTo ? { in_reply_to: input.inReplyTo } : {}),
        },
    });

    if (!result.ok) {
        return {
            sent: false,
            reason: result.errorMessage ?? `${connectorType} connector failed with status ${result.statusCode}`,
            triedConnectors: [connectorType],
        };
    }

    return {
        sent: true,
        connectorType,
        statusCode: result.statusCode,
        attempts: result.attempts ?? 1,
    };
}
