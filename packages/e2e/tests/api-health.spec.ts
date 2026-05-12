import { test, expect } from '@playwright/test'

const API_URL = process.env['API_URL'] ?? 'http://localhost:3000'
const TEST_EMAIL = process.env['E2E_TEST_EMAIL'] ?? 'test@agentfarm.dev'
const TEST_PASSWORD = process.env['E2E_TEST_PASSWORD'] ?? 'TestPassword123!'

test.describe('API health and authentication', () => {
    test('GET /health returns 200', async ({ request }) => {
        const res = await request.get(`${API_URL}/health`)
        expect(res.status()).toBe(200)
    })

    test('GET /status responds (200 or 404)', async ({ request }) => {
        const res = await request.get(`${API_URL}/status`)
        expect([200, 404]).toContain(res.status())
    })

    test('GET /v1/agents without auth returns 401', async ({ request }) => {
        const res = await request.get(`${API_URL}/v1/agents`)
        expect(res.status()).toBe(401)
    })

    test('POST /auth/login with valid credentials returns a token', async ({ request }) => {
        const res = await request.post(`${API_URL}/auth/login`, {
            data: { email: TEST_EMAIL, password: TEST_PASSWORD },
        })
        expect(res.status()).toBe(200)
        const body = (await res.json()) as Record<string, unknown>
        expect(body).toHaveProperty('token')
        expect(typeof body['token']).toBe('string')
    })
})
