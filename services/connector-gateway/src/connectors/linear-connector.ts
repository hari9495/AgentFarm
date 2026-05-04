/**
 * Linear Connector
 *
 * Integrates with Linear's API for issue management: create, update,
 * label, assign, and query issues across teams and projects.
 *
 * Uses Linear's GraphQL API (https://api.linear.app/graphql).
 * Requires LINEAR_API_KEY in environment.
 */

export type LinearConnectorConfig = {
    apiKey: string;
    teamId?: string;
};

export type LinearPriority = 0 | 1 | 2 | 3 | 4;

export type LinearIssue = {
    id: string;
    identifier: string;
    title: string;
    description?: string;
    priority: LinearPriority;
    state: string;
    assignee?: string;
    labels?: string[];
    url: string;
    createdAt: string;
    updatedAt: string;
};

export type CreateLinearIssueInput = {
    title: string;
    description?: string;
    teamId: string;
    priority?: LinearPriority;
    labelIds?: string[];
    assigneeId?: string;
};

export type LinearQueryResult<T> = {
    ok: boolean;
    data?: T;
    error?: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const LINEAR_API_URL = 'https://api.linear.app/graphql';

function authHeaders(apiKey: string): Record<string, string> {
    return {
        'Authorization': apiKey,
        'Content-Type': 'application/json',
    };
}

async function executeGraphQL<T>(
    apiKey: string,
    query: string,
    variables: Record<string, unknown> = {}
): Promise<LinearQueryResult<T>> {
    let response: Response;
    try {
        response = await fetch(LINEAR_API_URL, {
            method: 'POST',
            headers: authHeaders(apiKey),
            body: JSON.stringify({ query, variables }),
        });
    } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }

    const json = await response.json() as { data?: T; errors?: Array<{ message: string }> };
    if (json.errors && json.errors.length > 0) {
        return { ok: false, error: json.errors.map((e) => e.message).join('; ') };
    }
    return { ok: true, data: json.data };
}

// ---------------------------------------------------------------------------
// LinearConnector class
// ---------------------------------------------------------------------------

export class LinearConnector {
    private readonly config: LinearConnectorConfig;

    constructor(config: LinearConnectorConfig) {
        if (!config.apiKey || config.apiKey.trim().length === 0) {
            throw new Error('LinearConnector: apiKey is required');
        }
        this.config = config;
    }

    static fromEnv(): LinearConnector {
        const apiKey = process.env['LINEAR_API_KEY'];
        if (!apiKey) throw new Error('LINEAR_API_KEY environment variable is required');
        return new LinearConnector({
            apiKey,
            teamId: process.env['LINEAR_TEAM_ID'],
        });
    }

    async createIssue(input: CreateLinearIssueInput): Promise<LinearQueryResult<LinearIssue>> {
        const mutation = `
            mutation CreateIssue($title: String!, $description: String, $teamId: String!, $priority: Int, $labelIds: [String!], $assigneeId: String) {
                issueCreate(input: {
                    title: $title
                    description: $description
                    teamId: $teamId
                    priority: $priority
                    labelIds: $labelIds
                    assigneeId: $assigneeId
                }) {
                    success
                    issue {
                        id
                        identifier
                        title
                        description
                        priority
                        state { name }
                        assignee { name }
                        url
                        createdAt
                        updatedAt
                    }
                }
            }
        `;
        type RawResult = { issueCreate: { success: boolean; issue: { id: string; identifier: string; title: string; description?: string; priority: number; state: { name: string }; assignee?: { name: string }; url: string; createdAt: string; updatedAt: string } } };
        const result = await executeGraphQL<RawResult>(this.config.apiKey, mutation, {
            title: input.title,
            description: input.description,
            teamId: input.teamId,
            priority: input.priority ?? 0,
            labelIds: input.labelIds,
            assigneeId: input.assigneeId,
        });
        if (!result.ok || !result.data) return { ok: false, error: result.error };
        const raw = result.data.issueCreate.issue;
        return {
            ok: result.data.issueCreate.success,
            data: {
                id: raw.id,
                identifier: raw.identifier,
                title: raw.title,
                description: raw.description,
                priority: raw.priority as LinearPriority,
                state: raw.state.name,
                assignee: raw.assignee?.name,
                url: raw.url,
                createdAt: raw.createdAt,
                updatedAt: raw.updatedAt,
            },
        };
    }

    async getIssue(issueId: string): Promise<LinearQueryResult<LinearIssue>> {
        const query = `
            query GetIssue($id: String!) {
                issue(id: $id) {
                    id identifier title description priority
                    state { name }
                    assignee { name }
                    labels { nodes { name } }
                    url createdAt updatedAt
                }
            }
        `;
        type RawResult = { issue: { id: string; identifier: string; title: string; description?: string; priority: number; state: { name: string }; assignee?: { name: string }; labels: { nodes: Array<{ name: string }> }; url: string; createdAt: string; updatedAt: string } };
        const result = await executeGraphQL<RawResult>(this.config.apiKey, query, { id: issueId });
        if (!result.ok || !result.data) return { ok: false, error: result.error };
        const raw = result.data.issue;
        return {
            ok: true,
            data: {
                id: raw.id,
                identifier: raw.identifier,
                title: raw.title,
                description: raw.description,
                priority: raw.priority as LinearPriority,
                state: raw.state.name,
                assignee: raw.assignee?.name,
                labels: raw.labels.nodes.map((l) => l.name),
                url: raw.url,
                createdAt: raw.createdAt,
                updatedAt: raw.updatedAt,
            },
        };
    }

    async updateIssueState(issueId: string, stateId: string): Promise<LinearQueryResult<{ id: string }>> {
        const mutation = `
            mutation UpdateIssueState($id: String!, $stateId: String!) {
                issueUpdate(id: $id, input: { stateId: $stateId }) {
                    success
                    issue { id }
                }
            }
        `;
        type RawResult = { issueUpdate: { success: boolean; issue: { id: string } } };
        const result = await executeGraphQL<RawResult>(this.config.apiKey, mutation, { id: issueId, stateId });
        if (!result.ok || !result.data) return { ok: false, error: result.error };
        return { ok: result.data.issueUpdate.success, data: result.data.issueUpdate.issue };
    }

    async searchIssues(query: string, teamId?: string): Promise<LinearQueryResult<LinearIssue[]>> {
        const gql = `
            query SearchIssues($filter: IssueFilter, $first: Int) {
                issues(filter: $filter, first: $first) {
                    nodes {
                        id identifier title description priority
                        state { name }
                        assignee { name }
                        url createdAt updatedAt
                    }
                }
            }
        `;
        type RawResult = { issues: { nodes: Array<{ id: string; identifier: string; title: string; description?: string; priority: number; state: { name: string }; assignee?: { name: string }; url: string; createdAt: string; updatedAt: string }> } };
        const filter: Record<string, unknown> = {
            title: { containsIgnoreCase: query },
        };
        if (teamId ?? this.config.teamId) {
            filter['team'] = { id: { eq: teamId ?? this.config.teamId } };
        }
        const result = await executeGraphQL<RawResult>(this.config.apiKey, gql, { filter, first: 20 });
        if (!result.ok || !result.data) return { ok: false, error: result.error };
        return {
            ok: true,
            data: result.data.issues.nodes.map((raw) => ({
                id: raw.id,
                identifier: raw.identifier,
                title: raw.title,
                description: raw.description,
                priority: raw.priority as LinearPriority,
                state: raw.state.name,
                assignee: raw.assignee?.name,
                url: raw.url,
                createdAt: raw.createdAt,
                updatedAt: raw.updatedAt,
            })),
        };
    }
}
