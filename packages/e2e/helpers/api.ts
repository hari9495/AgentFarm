const API_URL = process.env['API_URL'] ?? 'http://localhost:3000'

interface LoginResponse {
    token: string
    user_id: string
    tenant_id: string
    workspace_ids: string[]
}

interface CreateAgentResponse {
    bot: { id: string; role: string; status: string }
}

/**
 * Obtain a session token directly from the API gateway login endpoint.
 */
export async function getAuthToken(email: string, password: string): Promise<string> {
    const res = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
    })
    if (!res.ok) {
        const err = (await res.json()) as Record<string, unknown>
        throw new Error(`Login failed (${res.status}): ${JSON.stringify(err)}`)
    }
    const body = (await res.json()) as LoginResponse
    return body.token
}

/**
 * Create a test agent bot for the given workspace via the API gateway.
 * The token must come from getAuthToken (sets the agentfarm_session cookie value).
 */
export async function createTestAgent(
    token: string,
    workspaceId: string,
    role = 'developer_agent',
): Promise<{ id: string }> {
    const res = await fetch(`${API_URL}/v1/agents`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Cookie: `agentfarm_session=${encodeURIComponent(token)}`,
        },
        body: JSON.stringify({ workspaceId, role }),
    })
    if (!res.ok) {
        const err = (await res.json()) as Record<string, unknown>
        throw new Error(`Create agent failed (${res.status}): ${JSON.stringify(err)}`)
    }
    const body = (await res.json()) as CreateAgentResponse
    return body.bot
}

/**
 * No-op placeholder — no DELETE /v1/agents/:botId route exists yet.
 * Extend this function once a delete/deactivate route is added to the API.
 */
export async function deleteTestAgent(_token: string, _botId: string): Promise<void> {
    // intentional no-op
}
