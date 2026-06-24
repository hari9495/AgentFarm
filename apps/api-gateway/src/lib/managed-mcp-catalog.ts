/**
 * managed-mcp-catalog.ts
 *
 * Defines the AgentFarm-hosted managed MCP connector catalog.
 * Each entry describes a pre-packaged MCP server that customers can activate
 * by supplying their OAuth token — no custom URL required.
 *
 * The `serverUrl` is the AgentFarm-hosted MCP proxy for that service.
 * The proxy receives the customer's token via the Authorization header and
 * forwards calls to the upstream API on behalf of the agent.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export type ConnectorFieldType = 'secret' | 'text' | 'url';

export type ConnectorField = {
    /** Identifier used as the header name when enabling the connector, e.g. "token" → "Authorization: Bearer <token>" */
    name: string;
    /** Human-readable label for the setup wizard form */
    label: string;
    type: ConnectorFieldType;
    placeholder?: string;
    helpText?: string;
};

export type ManagedConnectorDefinition = {
    id: string;
    displayName: string;
    category: string;
    description: string;
    logoSlug: string;
    /** Base URL of the AgentFarm-hosted MCP proxy for this connector */
    serverUrl: string;
    /** Fields the customer must supply to activate the connector */
    requiredFields: ConnectorField[];
    /** Optional fields that unlock additional capabilities */
    optionalFields?: ConnectorField[];
    /** List of MCP tool names this connector exposes */
    tools: string[];
    /** Agent roles that can use this connector */
    supportedRoles: string[];
};

// ── Catalog ──────────────────────────────────────────────────────────────────

const BASE = 'https://connectors.agentfarm.ai/mcp';

export const MANAGED_MCP_CATALOG: ManagedConnectorDefinition[] = [
    {
        id: 'github',
        displayName: 'GitHub',
        category: 'Source Control',
        description: 'Create branches, open pull requests, review code, and triage issues directly from Jira tickets.',
        logoSlug: 'github',
        serverUrl: `${BASE}/github`,
        requiredFields: [
            {
                name: 'token',
                label: 'Personal Access Token (classic)',
                type: 'secret',
                placeholder: 'ghp_…',
                helpText: 'Needs repo + read:org scopes. Fine-grained tokens also supported.',
            },
        ],
        optionalFields: [
            {
                name: 'default_owner',
                label: 'Default owner / org',
                type: 'text',
                placeholder: 'my-org',
            },
            {
                name: 'default_repo',
                label: 'Default repository',
                type: 'text',
                placeholder: 'my-repo',
            },
        ],
        tools: [
            'github_list_issues',
            'github_create_branch',
            'github_create_pull_request',
            'github_list_pull_requests',
            'github_get_file_contents',
            'github_create_or_update_file',
            'github_push_files',
            'github_create_review_comment',
            'github_merge_pull_request',
            'github_run_workflow',
        ],
        supportedRoles: ['developer', 'full-stack-developer', 'tester', 'technical-writer', 'project-manager'],
    },
    {
        id: 'jira',
        displayName: 'Jira',
        category: 'Project Management',
        description: 'Read the backlog, create tickets, update story status, and log work from task completion.',
        logoSlug: 'jira',
        serverUrl: `${BASE}/jira`,
        requiredFields: [
            {
                name: 'token',
                label: 'API Token',
                type: 'secret',
                placeholder: 'ATATT3x…',
                helpText: 'Generate at id.atlassian.com → Security → API tokens.',
            },
            {
                name: 'email',
                label: 'Account email',
                type: 'text',
                placeholder: 'you@company.com',
                helpText: 'The email address associated with the API token.',
            },
            {
                name: 'base_url',
                label: 'Jira base URL',
                type: 'url',
                placeholder: 'https://mycompany.atlassian.net',
            },
        ],
        tools: [
            'jira_list_projects',
            'jira_list_issues',
            'jira_get_issue',
            'jira_create_issue',
            'jira_update_issue',
            'jira_transition_issue',
            'jira_add_comment',
            'jira_list_sprints',
            'jira_assign_issue',
            'jira_log_work',
        ],
        supportedRoles: ['developer', 'full-stack-developer', 'tester', 'business-analyst', 'project-manager'],
    },
    {
        id: 'slack',
        displayName: 'Slack',
        category: 'Communication',
        description: 'Post updates, ask for approvals, and surface work summaries in team channels.',
        logoSlug: 'slack',
        serverUrl: `${BASE}/slack`,
        requiredFields: [
            {
                name: 'token',
                label: 'Bot OAuth Token',
                type: 'secret',
                placeholder: 'xoxb-…',
                helpText: 'Create a Slack app, grant channels:read + chat:write, install to workspace.',
            },
        ],
        tools: [
            'slack_list_channels',
            'slack_post_message',
            'slack_reply_to_thread',
            'slack_get_channel_history',
            'slack_upload_file',
        ],
        supportedRoles: ['developer', 'full-stack-developer', 'tester', 'business-analyst', 'technical-writer', 'sales-rep', 'project-manager', 'corporate-assistant', 'customer-support'],
    },
    {
        id: 'linear',
        displayName: 'Linear',
        category: 'Project Management',
        description: 'Manage Linear issues, cycles, and projects — ideal if your team uses Linear over Jira.',
        logoSlug: 'linear',
        serverUrl: `${BASE}/linear`,
        requiredFields: [
            {
                name: 'token',
                label: 'Personal API Key',
                type: 'secret',
                placeholder: 'lin_api_…',
                helpText: 'Generate at linear.app → Settings → API.',
            },
        ],
        tools: [
            'linear_list_issues',
            'linear_get_issue',
            'linear_create_issue',
            'linear_update_issue',
            'linear_list_projects',
            'linear_list_cycles',
        ],
        supportedRoles: ['developer', 'full-stack-developer', 'tester', 'business-analyst', 'project-manager'],
    },
    {
        id: 'notion',
        displayName: 'Notion',
        category: 'Knowledge Base',
        description: 'Read and write Notion pages — great for docs, runbooks, and meeting notes.',
        logoSlug: 'notion',
        serverUrl: `${BASE}/notion`,
        requiredFields: [
            {
                name: 'token',
                label: 'Integration Secret',
                type: 'secret',
                placeholder: 'secret_…',
                helpText: 'Create an integration at notion.so/my-integrations, then share pages with it.',
            },
        ],
        tools: [
            'notion_search',
            'notion_get_page',
            'notion_create_page',
            'notion_update_page',
            'notion_append_block_children',
            'notion_list_databases',
        ],
        supportedRoles: ['technical-writer', 'content-writer', 'business-analyst', 'corporate-assistant', 'project-manager'],
    },
    {
        id: 'salesforce',
        displayName: 'Salesforce',
        category: 'CRM',
        description: 'Update leads, log calls, create opportunities, and read account data.',
        logoSlug: 'salesforce',
        serverUrl: `${BASE}/salesforce`,
        requiredFields: [
            {
                name: 'token',
                label: 'Connected App Access Token',
                type: 'secret',
                placeholder: '00D…',
                helpText: 'OAuth 2.0 connected app with relevant object permissions.',
            },
            {
                name: 'instance_url',
                label: 'Salesforce instance URL',
                type: 'url',
                placeholder: 'https://myorg.salesforce.com',
            },
        ],
        tools: [
            'sf_query',
            'sf_get_record',
            'sf_create_record',
            'sf_update_record',
            'sf_upsert_record',
            'sf_delete_record',
        ],
        supportedRoles: ['sales-rep', 'marketing-specialist', 'customer-support'],
    },
    {
        id: 'gitlab',
        displayName: 'GitLab',
        category: 'Source Control',
        description: 'Open merge requests, review code, manage issues and pipelines on GitLab (SaaS or self-hosted).',
        logoSlug: 'gitlab',
        serverUrl: `${BASE}/gitlab`,
        requiredFields: [
            { name: 'token', label: 'Personal / Project Access Token', type: 'secret', placeholder: 'glpat-…', helpText: 'Needs api scope.' },
        ],
        optionalFields: [
            { name: 'base_url', label: 'GitLab base URL (self-hosted)', type: 'url', placeholder: 'https://gitlab.example.com' },
            { name: 'default_project', label: 'Default project (group/repo)', type: 'text', placeholder: 'my-group/my-repo' },
        ],
        tools: [
            'gitlab_list_issues',
            'gitlab_create_merge_request',
            'gitlab_list_merge_requests',
            'gitlab_merge_merge_request',
            'gitlab_create_note',
            'gitlab_get_file',
            'gitlab_trigger_pipeline',
        ],
        supportedRoles: ['developer', 'full-stack-developer', 'tester', 'devops', 'project-manager'],
    },
    {
        id: 'sentry',
        displayName: 'Sentry',
        category: 'Observability',
        description: 'Triage errors, inspect stack traces and issue trends, and resolve incidents from Sentry.',
        logoSlug: 'sentry',
        serverUrl: `${BASE}/sentry`,
        requiredFields: [
            { name: 'token', label: 'Auth Token', type: 'secret', placeholder: 'sntrys_…', helpText: 'Org auth token with project:read and event:read.' },
        ],
        optionalFields: [
            { name: 'org_slug', label: 'Organization slug', type: 'text', placeholder: 'my-org' },
        ],
        tools: [
            'sentry_list_issues',
            'sentry_get_issue',
            'sentry_get_event',
            'sentry_resolve_issue',
            'sentry_list_projects',
        ],
        supportedRoles: ['devops', 'developer', 'full-stack-developer'],
    },
    {
        id: 'asana',
        displayName: 'Asana',
        category: 'Project Management',
        description: 'Create and update tasks, manage projects, and report status from Asana.',
        logoSlug: 'asana',
        serverUrl: `${BASE}/asana`,
        requiredFields: [
            { name: 'token', label: 'Personal Access Token', type: 'secret', placeholder: '1/12345…', helpText: 'From Asana → My Settings → Apps → Developer.' },
        ],
        optionalFields: [
            { name: 'workspace_gid', label: 'Default workspace GID', type: 'text', placeholder: '1200…' },
        ],
        tools: [
            'asana_list_tasks',
            'asana_create_task',
            'asana_update_task',
            'asana_add_comment',
            'asana_list_projects',
        ],
        supportedRoles: ['project-manager', 'corporate-assistant', 'marketing-specialist'],
    },
    {
        id: 'postgres',
        displayName: 'PostgreSQL',
        category: 'Database',
        description: 'Run read-only SQL queries and inspect schemas to answer data questions (read-only by default).',
        logoSlug: 'postgres',
        serverUrl: `${BASE}/postgres`,
        requiredFields: [
            { name: 'token', label: 'Connection string', type: 'secret', placeholder: 'postgresql://user:pass@host:5432/db', helpText: 'Use a read-only role. Stored encrypted.' },
        ],
        tools: [
            'pg_list_tables',
            'pg_describe_table',
            'pg_run_query',
        ],
        supportedRoles: ['developer', 'full-stack-developer', 'business-analyst'],
    },
    {
        id: 'google-drive',
        displayName: 'Google Drive',
        category: 'Documents',
        description: 'Search, read, and create documents and spreadsheets in Google Drive.',
        logoSlug: 'google-drive',
        serverUrl: `${BASE}/google-drive`,
        requiredFields: [
            { name: 'token', label: 'OAuth access token', type: 'secret', placeholder: 'ya29.…', helpText: 'drive.file + drive.readonly scopes.' },
        ],
        tools: [
            'gdrive_search',
            'gdrive_read_file',
            'gdrive_create_doc',
            'gdrive_append_to_doc',
        ],
        supportedRoles: ['corporate-assistant', 'technical-writer', 'content-writer', 'business-analyst'],
    },
    {
        id: 'hubspot',
        displayName: 'HubSpot',
        category: 'CRM',
        description: 'Manage contacts, companies, deals, and notes in HubSpot CRM.',
        logoSlug: 'hubspot',
        serverUrl: `${BASE}/hubspot`,
        requiredFields: [
            { name: 'token', label: 'Private App token', type: 'secret', placeholder: 'pat-…', helpText: 'Scopes: crm.objects.contacts/companies/deals read+write.' },
        ],
        tools: [
            'hubspot_search_contacts',
            'hubspot_create_contact',
            'hubspot_update_contact',
            'hubspot_create_deal',
            'hubspot_add_note',
        ],
        supportedRoles: ['sales-rep', 'marketing-specialist', 'customer-support'],
    },
];

// ── Lookup helpers ────────────────────────────────────────────────────────────

export function findConnectorById(id: string): ManagedConnectorDefinition | undefined {
    return MANAGED_MCP_CATALOG.find((c) => c.id === id);
}

/**
 * Build the headers object for registering a managed connector as a TenantMcpServer.
 * Sensitive values (tokens) are stored as Authorization or X-* headers.
 */
export function buildConnectorHeaders(
    connector: ManagedConnectorDefinition,
    fieldValues: Record<string, string>,
): Record<string, string> {
    const headers: Record<string, string> = {};
    for (const field of connector.requiredFields) {
        const value = fieldValues[field.name];
        if (!value) continue;
        if (field.type === 'secret' && field.name === 'token') {
            headers['Authorization'] = `Bearer ${value}`;
        } else {
            headers[`X-Connector-${field.name}`] = value;
        }
    }
    for (const field of connector.optionalFields ?? []) {
        const value = fieldValues[field.name];
        if (value) {
            headers[`X-Connector-${field.name}`] = value;
        }
    }
    return headers;
}
