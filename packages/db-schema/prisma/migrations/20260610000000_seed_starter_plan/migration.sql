-- Seed the free Starter plan required by portal-register.ts (FREE_PLAN_ID = 'starter').
-- Uses INSERT ... ON CONFLICT DO NOTHING so re-running is safe.
INSERT INTO "Plan" (id, name, "priceInr", "priceUsd", "agentSlots", features, "roleType", "isActive", "createdAt")
VALUES (
    'starter',
    'Starter',
    0,
    0,
    1,
    'Basic agents,Email support,1 workspace',
    'developer_agent',
    true,
    NOW()
)
ON CONFLICT (id) DO NOTHING;
