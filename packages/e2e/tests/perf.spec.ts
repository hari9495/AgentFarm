/**
 * Concurrent Performance Test  (Sprint 8)
 *
 * Validates that the Agent Runtime handles 10 simultaneous task submissions
 * without degradation: all responses must arrive within 30 s and none may
 * return a 5xx status.
 *
 * Run in isolation (not inside the full dashboard Playwright suite) because it
 * targets the API Gateway directly, not the dashboard UI.
 */
import { test, expect } from '@playwright/test'
import { loginAs, TEST_USER } from '../helpers/auth'

const GATEWAY_URL = process.env['GATEWAY_URL'] ?? 'http://localhost:3000'
const CONCURRENCY = 10
const TASK_TIMEOUT_MS = 30_000

test.describe('Concurrent performance', () => {
    test.setTimeout(60_000)

    test(`${CONCURRENCY} simultaneous task submissions all succeed within ${TASK_TIMEOUT_MS / 1_000}s`, async ({
        page,
    }) => {
        await loginAs(page, TEST_USER.email, TEST_USER.password)

        const cookies = await page.context().cookies()
        const session = cookies.find(
            (c) => c.name === 'session' || c.name === 'next-auth.session-token',
        )
        const cookieHeader = session ? `${session.name}=${session.value}` : ''

        const makeTaskRequest = (index: number): Promise<{ status: number; durationMs: number }> => {
            const started = Date.now()
            return fetch(`${GATEWAY_URL}/v1/tasks`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(cookieHeader ? { Cookie: cookieHeader } : {}),
                },
                body: JSON.stringify({
                    tenantId: 'perf-test-tenant',
                    botId: `perf-bot-${index}`,
                    taskType: 'code_change',
                    input: {
                        description: `Perf test task #${index}`,
                        repo: 'agentfarm/api-gateway',
                        branch: 'main',
                    },
                }),
                signal: AbortSignal.timeout(TASK_TIMEOUT_MS),
            })
                .then((res) => ({ status: res.status, durationMs: Date.now() - started }))
                .catch(() => ({ status: 503, durationMs: Date.now() - started }))
        }

        const results = await Promise.all(
            Array.from({ length: CONCURRENCY }, (_, i) => makeTaskRequest(i)),
        )

        const failures = results.filter((r) => r.status >= 500)
        const slowOnes = results.filter((r) => r.durationMs > TASK_TIMEOUT_MS)

        // All responses must come back (no unhandled crashes)
        expect(results).toHaveLength(CONCURRENCY)

        // No 5xx errors under concurrent load
        expect(failures).toHaveLength(0)

        // Every response arrived within the timeout budget
        expect(slowOnes).toHaveLength(0)

        // Log timing summary for CI artefacts
        const durations = results.map((r) => r.durationMs)
        const max = Math.max(...durations)
        const avg = Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
        console.info(
            `Concurrency=${CONCURRENCY} | avg=${avg}ms | max=${max}ms | failures=${failures.length}`,
        )
    })

    test('Health endpoint responds to 10 parallel probes', async () => {
        const probes = Array.from({ length: CONCURRENCY }, () =>
            fetch(`${GATEWAY_URL}/health`).then((r) => r.status).catch(() => 503),
        )
        const statuses = await Promise.all(probes)
        const nonOk = statuses.filter((s) => s !== 200)
        expect(nonOk).toHaveLength(0)
    })
})
