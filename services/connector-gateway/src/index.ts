export const serviceName = 'connector-gateway';
console.log(serviceName, 'service scaffold ready');

export * from './adapter-registry.js';
export * from './plugin-loader.js';

import { globalAdapterRegistry } from './adapter-registry.js';
import { randomUUID } from 'crypto';

/**
 * Register Jira and Teams connectors at startup if their env vars are present.
 * Does NOT throw if vars are missing — connectors are optional at registry startup.
 */
export async function bootstrapConnectorAdapters(): Promise<void> {
    const correlationId = randomUUID();

    const jiraPresent =
        process.env['JIRA_BASE_URL'] &&
        process.env['JIRA_USER_EMAIL'] &&
        process.env['JIRA_API_TOKEN'];

    if (jiraPresent) {
        try {
            const existing = await globalAdapterRegistry.getAdapterByKey('jira_connector');
            if (!existing) {
                await globalAdapterRegistry.registerAdapter({
                    adapterType: 'connector',
                    adapterKey: 'jira_connector',
                    displayName: 'Jira',
                    version: '1.0.0',
                    capabilities: [
                        { name: 'list_issues', version: '1.0.0', supported: true },
                        { name: 'create_issue', version: '1.0.0', supported: true },
                        { name: 'update_issue', version: '1.0.0', supported: true },
                        { name: 'add_comment', version: '1.0.0', supported: true },
                        { name: 'transition_issue', version: '1.0.0', supported: true },
                        { name: 'assign_issue', version: '1.0.0', supported: true },
                        { name: 'list_projects', version: '1.0.0', supported: true },
                        { name: 'search_users', version: '1.0.0', supported: true },
                    ],
                    correlationId,
                });
            }
        } catch {
            // Registration failure must not crash the service
        }
    }

    const teamsPresent =
        process.env['TEAMS_TENANT_ID'] &&
        process.env['TEAMS_CLIENT_ID'] &&
        process.env['TEAMS_CLIENT_SECRET'];

    if (teamsPresent) {
        try {
            const existing = await globalAdapterRegistry.getAdapterByKey('teams_connector');
            if (!existing) {
                await globalAdapterRegistry.registerAdapter({
                    adapterType: 'connector',
                    adapterKey: 'teams_connector',
                    displayName: 'Microsoft Teams',
                    version: '1.0.0',
                    capabilities: [
                        { name: 'send_message', version: '1.0.0', supported: true },
                        { name: 'reply_to_thread', version: '1.0.0', supported: true },
                        { name: 'list_channels', version: '1.0.0', supported: true },
                        { name: 'list_teams', version: '1.0.0', supported: true },
                        { name: 'get_channel_info', version: '1.0.0', supported: true },
                        { name: 'send_adaptive_card', version: '1.0.0', supported: true },
                        { name: 'create_meeting', version: '1.0.0', supported: true },
                        { name: 'get_meeting_info', version: '1.0.0', supported: true },
                        { name: 'send_incident_alert', version: '1.0.0', supported: true },
                    ],
                    correlationId,
                });
            }
        } catch {
            // Registration failure must not crash the service
        }
    }

    const gitlabPresent =
        process.env['GITLAB_TOKEN'] ||
        process.env['GITLAB_OAUTH_TOKEN'];

    if (gitlabPresent) {
        try {
            const existing = await globalAdapterRegistry.getAdapterByKey('gitlab_connector');
            if (!existing) {
                await globalAdapterRegistry.registerAdapter({
                    adapterType: 'connector',
                    adapterKey: 'gitlab_connector',
                    displayName: 'GitLab',
                    version: '1.0.0',
                    capabilities: [
                        { name: 'list_issues', version: '1.0.0', supported: true },
                        { name: 'get_issue', version: '1.0.0', supported: true },
                        { name: 'create_issue', version: '1.0.0', supported: true },
                        { name: 'update_issue', version: '1.0.0', supported: true },
                        { name: 'add_comment', version: '1.0.0', supported: true },
                        { name: 'list_merge_requests', version: '1.0.0', supported: true },
                        { name: 'get_merge_request', version: '1.0.0', supported: true },
                        { name: 'create_merge_request', version: '1.0.0', supported: true },
                        { name: 'approve_merge_request', version: '1.0.0', supported: true },
                        { name: 'list_pipelines', version: '1.0.0', supported: true },
                        { name: 'trigger_pipeline', version: '1.0.0', supported: true },
                        { name: 'list_projects', version: '1.0.0', supported: true },
                        { name: 'get_project', version: '1.0.0', supported: true },
                        { name: 'list_commits', version: '1.0.0', supported: true },
                    ],
                    correlationId,
                });
            }
        } catch {
            // Registration failure must not crash the service
        }
    }
}

