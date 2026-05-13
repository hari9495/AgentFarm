# Testing Guide

> AgentFarm testing conventions, patterns, and quality gate reference.
> Last updated: 2026-05-10

---

## Test Summary

| Package | Tests | Framework | Coverage Threshold |
|---|---|---|---|
| `@agentfarm/agent-runtime` | 906 | `node:test` | ≥ 80% |
| `@agentfarm/api-gateway` | 898 | `node:test` | ≥ 80% |
| `@agentfarm/dashboard` | 118 | `node:test` | — |
| `@agentfarm/website` | 118 | `node:test` | — |
| `@agentfarm/orchestrator` | 62 | `node:test` | — |
| `@agentfarm/trigger-service` | 49 | `node:test` | — |
| `@agentfarm/provisioning-service` | 15 | `node:test` | — |
| `@agentfarm/approval-service` | 12 | `node:test` | — |
| `@agentfarm/connector-gateway` | 36 | `node:test` | — |
| `@agentfarm/policy-engine` | 2 | `node:test` | — |
| `@agentfarm/evidence-service` | 24 | `node:test` | — |
| `@agentfarm/agent-observability` | 9 | `node:test` | — |
| `@agentfarm/notification-service` | 31 | `node:test` | — |
| `@agentfarm/meeting-agent` | 23 | `node:test` | — |
| `@agentfarm/memory-service` | 11 | `node:test` | — |
| **Total** | **1,853** | | |

---

## Running Tests

### All packages

```bash
pnpm test
```

### Single package

```bash
pnpm --filter @agentfarm/api-gateway test
pnpm --filter @agentfarm/agent-runtime test
pnpm --filter @agentfarm/dashboard test
pnpm --filter @agentfarm/website test
```

### Single test file

```bash
node --test apps/api-gateway/src/routes/billing.test.ts
node --test apps/api-gateway/src/services/zoho-sign-client.test.ts
```

### With coverage

```bash
node --test --experimental-test-coverage apps/api-gateway/src/**/*.test.ts
```

---

## Test Framework

All tests use **Node.js built-in test runner** (`node:test`). No Vitest, no Jest.

```typescript
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
```

Do **not** import from `vitest` or `jest`. The workspace uses `node:test` exclusively.

---

## Key Testing Patterns

### 1. HTTP Route Testing with Fastify inject

Use `app.inject()` for full HTTP round-trip tests without a running server:

```typescript
import Fastify from 'fastify';
import { registerBillingRoutes } from '../routes/billing.js';

const app = Fastify();
registerBillingRoutes(app, { getSession, prisma: mockPrisma });

const res = await app.inject({
  method: 'POST',
  url: '/v1/billing/webhook/stripe',
  headers: { 'stripe-signature': 'valid_sig' },
  body: JSON.stringify({ type: 'payment_intent.succeeded', data: { object: { id: 'pi_...' } } })
});

assert.equal(res.statusCode, 200);
```

### 2. Prisma Mock via Optional Parameter

Route handlers accept an optional `prisma?: PrismaClient` in their options object. Tests inject a mock that implements only the needed methods:

```typescript
const mockPrisma = {
  order: {
    findFirst: async () => ({ id: 'ord_1', status: 'pending', tenantId: 'ten_1' }),
    update: async (args: unknown) => ({ id: 'ord_1', ...args })
  },
  invoice: {
    create: async () => ({ id: 'inv_1' })
  },
  provisioningJob: {
    findFirst: async () => null,
    create: async () => ({ id: 'job_1', status: 'queued' })
  }
} as unknown as PrismaClient;
```

Route pattern:

```typescript
export function registerBillingRoutes(app: FastifyInstance, options: {
  getSession: GetSession;
  prisma?: PrismaClient;
}) {
  const resolvePrisma = options.prisma
    ? () => Promise.resolve(options.prisma!)
    : getPrisma;
  // ...
}
```

### 3. Fetch Mocking

Mock `globalThis.fetch` for external HTTP calls:

```typescript
const mockFetch = t.mock.method(globalThis, 'fetch', async (url: string) => {
  if (url.includes('accounts.zoho.com')) {
    return new Response(JSON.stringify({ access_token: 'test_token' }), { status: 200 });
  }
  if (url.includes('sign.zoho.com')) {
    return new Response(JSON.stringify({ requests: { request_id: 'req_123' } }), { status: 200 });
  }
  throw new Error(`Unexpected URL: ${url}`);
});
```

Always restore in `after()`:
```typescript
after(() => {
  mockFetch.mock.restore();
});
```

### 4. Session Authentication Mock

```typescript
const getSession = async (request: FastifyRequest) => ({
  userId: 'user_1',
  tenantId: 'ten_1',
  workspaceIds: ['ws_1'],
  scope: 'internal' as const,
  expiresAt: new Date(Date.now() + 3600_000).toISOString()
});
```

For unauthorized test scenarios:
```typescript
const getSession = async () => {
  throw new Error('UNAUTHORIZED');
};
```

---

## Test File Naming Conventions

Test files are co-located with source files:

```
apps/api-gateway/src/routes/billing.ts
apps/api-gateway/src/routes/billing.test.ts

apps/api-gateway/src/services/zoho-sign-client.ts
apps/api-gateway/src/services/zoho-sign-client.test.ts

apps/api-gateway/src/lib/approval-packet.ts
apps/api-gateway/src/lib/approval-packet.test.ts
```

---

## Test Scenarios to Cover

Every new route or service must have tests for:

### Positive Scenarios
- Happy path: valid input, expected output, correct status code
- Idempotency: calling twice produces same safe result
- Auth: valid session grants access

### Negative Scenarios
- Missing required fields → 422 validation error
- Invalid auth token → 401
- Insufficient scope (customer trying admin route) → 403
- Resource not found → 404
- Conflict (e.g. re-deciding an approval) → 409
- External service failure (mock fetch returning error) → graceful error response

---

## Coverage Enforcement

The following modules have enforced minimum coverage via `pnpm quality:gate`:

| Module | Minimum Line Coverage |
|---|---|
| `agent-runtime/src/execution-engine.ts` | 95% |
| `agent-runtime/src/runtime-server.ts` | 81% |
| `provisioning-service/src/provisioning-monitoring.ts` | 94% |

Coverage below threshold fails the quality gate.

---

## Quality Gate

Run the full quality gate:

```bash
pnpm quality:gate
```

The gate runs 46 checks:
1. TypeScript compilation (`pnpm typecheck`) for all packages
2. Lint (`pnpm lint`) for all packages
3. Tests (`pnpm test`) for all packages
4. Coverage checks on critical modules
5. DB smoke lane (skipped if PostgreSQL unavailable)

Full gate report: `operations/quality/8.1-quality-gate-report.md`

---

## Writing New Tests

### Route test template

```typescript
// apps/api-gateway/src/routes/my-route.test.ts
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { registerMyRoutes } from './my-route.js';
import type { PrismaClient } from '@prisma/client';

const makeSession = (scope: 'internal' | 'customer' = 'internal') => async () => ({
  userId: 'user_1',
  tenantId: 'ten_1',
  workspaceIds: ['ws_1'],
  scope,
  expiresAt: new Date(Date.now() + 3600_000).toISOString()
});

describe('my-route', () => {
  let app: FastifyInstance;
  const mockPrisma = {
    myModel: {
      findFirst: async () => ({ id: 'rec_1', status: 'active' }),
      create: async (args: unknown) => ({ id: 'rec_2', ...args })
    }
  } as unknown as PrismaClient;

  before(async () => {
    app = Fastify();
    registerMyRoutes(app, { getSession: makeSession(), prisma: mockPrisma });
    await app.ready();
  });

  after(() => app.close());

  it('GET /v1/my-route returns 200 for valid session', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/my-route' });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body) as { items: unknown[] };
    assert.ok(Array.isArray(body.items));
  });

  it('GET /v1/my-route returns 401 for missing session', async () => {
    const unauthorizedApp = Fastify();
    registerMyRoutes(unauthorizedApp, {
      getSession: async () => { throw new Error('UNAUTHORIZED'); },
      prisma: mockPrisma
    });
    await unauthorizedApp.ready();
    const res = await unauthorizedApp.inject({ method: 'GET', url: '/v1/my-route' });
    assert.equal(res.statusCode, 401);
    await unauthorizedApp.close();
  });
});
```

### Service test template

```typescript
// apps/api-gateway/src/services/my-service.test.ts
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { myServiceFunction } from './my-service.js';

describe('myServiceFunction', () => {
  let fetchMock: ReturnType<typeof globalThis.fetch> | undefined;

  before((t) => {
    fetchMock = t.mock.method(globalThis, 'fetch', async (url: string) => {
      if (url.includes('expected-endpoint')) {
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }
      throw new Error(`Unexpected: ${url}`);
    });
  });

  after(() => {
    fetchMock?.mock?.restore?.();
  });

  it('returns success for valid input', async () => {
    const result = await myServiceFunction({ param: 'value' });
    assert.equal(result.success, true);
  });

  it('throws on non-200 response', async () => {
    // Override mock for this test
    t.mock.method(globalThis, 'fetch', async () =>
      new Response(JSON.stringify({ error: 'server error' }), { status: 500 })
    );
    await assert.rejects(() => myServiceFunction({ param: 'value' }), /server error/);
  });
});
```

---

## Database Tests (DB Smoke Lane)

The DB smoke lane is a separate test suite that requires a running PostgreSQL instance. It is skipped in CI if `DATABASE_URL` is not set.

Smoke tests validate:
1. Migrations apply cleanly: `prisma migrate deploy`
2. Basic read/write on two models to confirm schema is correct after migration
3. Startup snapshot: seeded data survives a server restart

Run manually:
```bash
pnpm --filter @agentfarm/db-schema test:smoke
```

Documented in: `operations/runbooks/db-smoke-lane.md`

---

## CI Test Pipeline

`.github/workflows/` runs on every pull request and push to `main`:

```yaml
- name: Install
  run: pnpm install

- name: Typecheck
  run: pnpm typecheck

- name: Lint
  run: pnpm lint

- name: Test
  run: pnpm test

- name: Build
  run: pnpm build
```

Tests run in parallel per package using pnpm workspace filtering.

---

## Common Pitfalls

### Import extensions
All imports in TypeScript source files must use `.js` extensions (NodeNext ESM):
```typescript
// ✅ Correct
import { myFunc } from './my-module.js';

// ❌ Wrong
import { myFunc } from './my-module';
```

### Node:test vs Vitest
Do not use `vitest`, `jest`, or `@testing-library`. Only `node:test` and `node:assert/strict`.

### Async cleanup
Always close Fastify app instances in `after()` to prevent open handles:
```typescript
after(() => app.close());
```

### PrismaClient mock scope
The mock Prisma object only needs to implement the methods actually called by the route under test. Use `as unknown as PrismaClient` cast.

### Fetch mock restoration
Always restore fetch mocks in `after()` or the mock persists and pollutes other tests:
```typescript
after(() => mockFetch.mock.restore());
```

### setImmediate in billing tests
The billing webhook handlers run contract/signature logic in `setImmediate`. To test those paths:
```typescript
await new Promise((resolve) => setImmediate(resolve)); // flush setImmediate queue
```

---

## Deferred Test Coverage

The following areas have intentionally deferred test coverage:

| Area | Status | Notes |
|---|---|---|
| DB smoke lane (migration + startup snapshot) | Deferred | Requires live PostgreSQL. Documented in `operations/runbooks/db-smoke-lane.md`. |
| Desktop Operator native paths (Tier 11/12) | Deferred | Native browser/app/meeting automation requires live OS context. Mock paths are fully tested. |
| VoxCPM2 TTS audio output | Deferred | Requires Docker TTS container. Client HTTP calls are mocked. |
| Zoho Sign signed PDF download | Deferred | Requires live Zoho Sign sandbox. Download function is implemented; integration test deferred. |

---

## Test Locations by Feature

| Feature | Test Files |
|---|---|
| Billing webhooks | `apps/api-gateway/src/routes/billing.test.ts` |
| Zoho Sign webhook | `apps/api-gateway/src/routes/zoho-sign-webhook.test.ts` |
| Zoho Sign client | `apps/api-gateway/src/services/zoho-sign-client.test.ts` |
| Contract PDF generator | `apps/api-gateway/src/services/contract-generator.test.ts` |
| Approval packet parser | `apps/api-gateway/src/lib/approval-packet.test.ts` |
| Approval routes | `apps/api-gateway/src/routes/approvals.test.ts` |
| Admin provisioning routes | `apps/api-gateway/src/routes/admin-provision.test.ts` |
| Agent execution engine | `apps/agent-runtime/src/execution-engine.test.ts` |
| LLM decision adapter | `apps/agent-runtime/src/llm-decision-adapter.test.ts` |
| Skills crystallization | `apps/agent-runtime/src/skills-registry.test.ts` |
| Desktop operator mock | `apps/agent-runtime/src/desktop-operator-factory.test.ts` |
| SSE task queue | `apps/api-gateway/src/routes/sse-tasks.test.ts` |
| Trigger dispatcher | `apps/trigger-service/src/trigger-dispatcher.test.ts` |
| Trigger router | `apps/trigger-service/src/trigger-router.test.ts` |
| Notification service | `services/notification-service/src/*.test.ts` |
| Evidence service | `services/evidence-service/src/*.test.ts` |
| Connector gateway | `services/connector-gateway/src/*.test.ts` |
