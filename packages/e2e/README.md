# @agentfarm/e2e

End-to-end test suite for AgentFarm. Uses [Playwright](https://playwright.dev/) to test the dashboard UI and API gateway through a real browser.

## Overview

Tests cover authentication, onboarding, agents, billing, navigation smoke tests, and API health checks. The suite runs in CI after the Docker image build job and reports results as an HTML artifact.

## Prerequisites

- All AgentFarm services running locally (`docker-compose up` or manually)
- A test user whose email domain is in `API_INTERNAL_LOGIN_ALLOWED_DOMAINS`
- Chromium browser (installed via `playwright install chromium`)

## Local setup

```sh
# From the monorepo root
pnpm --filter @agentfarm/e2e install
pnpm --filter @agentfarm/e2e exec playwright install chromium
```

## Running tests

```sh
# Run all tests (headless)
pnpm --filter @agentfarm/e2e test

# Run with UI mode (interactive)
pnpm --filter @agentfarm/e2e test:ui

# Run headed (visible browser)
pnpm --filter @agentfarm/e2e test:headed

# View last HTML report
pnpm --filter @agentfarm/e2e test:report
```

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `DASHBOARD_URL` | `http://localhost:3001` | Dashboard base URL |
| `API_URL` | `http://localhost:3000` | API gateway base URL |
| `E2E_TEST_EMAIL` | `test@agentfarm.dev` | Test user email |
| `E2E_TEST_PASSWORD` | `TestPassword123!` | Test user password |

**Required on the API gateway** for dashboard login to succeed:

| Variable | Example | Description |
|---|---|---|
| `API_INTERNAL_LOGIN_ALLOWED_DOMAINS` | `agentfarm.dev` | Comma-separated domains allowed for internal login |

## Test files

| File | Tests | Description |
|---|---|---|
| `tests/auth.spec.ts` | 4 | Login success/failure, unauthenticated redirect, logout |
| `tests/onboarding.spec.ts` | 2 | Wizard step labels, account step form interaction |
| `tests/agents.spec.ts` | 4 | Agent Builder page load, create form, no server errors |
| `tests/billing.spec.ts` | 3 | Billing page load, subscription section, usage section |
| `tests/navigation.spec.ts` | 10 | Smoke test for 10 dashboard pages (no 500 errors) |
| `tests/api-health.spec.ts` | 4 | API gateway health, unauthenticated 401, login token |

## Helpers

- `helpers/global-setup.ts` — polls API gateway and dashboard health before tests start; creates the test user if absent
- `helpers/auth.ts` — `loginAs()` and `logout()` helpers for browser tests
- `helpers/api.ts` — `getAuthToken()`, `createTestAgent()`, `deleteTestAgent()` for direct API calls

## CI

The `e2e` job in `.github/workflows/ci.yml` runs after the `build` job. It starts postgres + redis service containers, applies migrations, starts the API gateway and dashboard, then runs Playwright tests. The HTML report is uploaded as a `playwright-report` artifact (7-day retention).

Secrets used in CI:

| Secret | Description |
|---|---|
| `CI_API_SESSION_SECRET` | Session signing key for the API gateway |
| `CI_DASHBOARD_API_TOKEN` | Internal token used by the dashboard to call the API |
