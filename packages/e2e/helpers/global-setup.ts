const API_URL = process.env['API_URL'] ?? 'http://localhost:3000'
const DASHBOARD_URL = process.env['DASHBOARD_URL'] ?? 'http://localhost:3001'
const POLL_INTERVAL_MS = 2000
const MAX_RETRIES = 30
const TEST_EMAIL = process.env['E2E_TEST_EMAIL'] ?? 'test@agentfarm.dev'
const TEST_PASSWORD = process.env['E2E_TEST_PASSWORD'] ?? 'TestPassword123!'

async function pollHealthy(url: string, name: string): Promise<void> {
    let lastError: unknown
    for (let i = 0; i < MAX_RETRIES; i++) {
        try {
            const res = await fetch(url)
            if (res.ok) {
                console.log(`✓ ${name} healthy`)
                return
            }
        } catch (err) {
            lastError = err
        }
        await new Promise<void>((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
    }
    throw new Error(
        `${name} did not become healthy at ${url} after ${MAX_RETRIES} retries. Last error: ${String(lastError)}`,
    )
}

async function ensureTestUser(): Promise<void> {
    try {
        const res = await fetch(`${API_URL}/auth/signup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: 'E2E Test User',
                email: TEST_EMAIL,
                password: TEST_PASSWORD,
                companyName: 'AgentFarm E2E',
            }),
        })
        if (res.status === 409) {
            console.log('✓ Test user already exists')
        } else if (res.status === 201) {
            console.log('✓ Test user created')
        } else {
            const body = (await res.json()) as Record<string, unknown>
            console.warn(`⚠ Test user setup returned ${res.status}: ${JSON.stringify(body)}`)
        }
    } catch (err) {
        console.warn(`⚠ Test user setup failed (non-fatal): ${String(err)}`)
    }
}

export default async function globalSetup(): Promise<void> {
    await pollHealthy(`${API_URL}/health`, 'API gateway')
    await pollHealthy(`${DASHBOARD_URL}/api/health/gateway`, 'Dashboard')
    await ensureTestUser()
}
