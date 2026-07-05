# Website auth — the two surfaces (read this before debugging a login)

The website has **two independent authentication systems**. They are both
legitimate and serve different users. Confusing them wastes hours — this doc
exists so you don't.

| | **Website account** | **Customer portal (dashboard)** |
|---|---|---|
| Who | Signup / marketing / internal **/admin console** users | Provisioned **customer** operators |
| Login route | `POST /api/auth/login` | `POST /api/portal/auth/login` (+ `/lookup-tenant`) |
| Backing store | Website's own `users` table — **SQLite** locally (`WEBSITE_AUTH_DB_PATH`, `.auth.sqlite`), **Cloudflare D1** in prod | Gateway → **Postgres `TenantPortalAccount`** |
| Code | `apps/website/lib/auth-store.ts` (imported by ~20 admin/signup/whoami routes) | `apps/website/app/api/portal/**` → api-gateway `routes/auth/portal-auth.ts` |
| Seed a user | `scripts/create-customer-user.mjs` (SQLite) | set `passwordHash` on a `TenantPortalAccount` row (Postgres) |
| Password hash | PBKDF2 (`pbkdf2:salt:hash`) | scrypt (`scrypt:salt:hash`, `@agentfarm/auth-utils`) |

## The trap

The **`/dashboard` customer login UI uses the PORTAL system** (`/api/portal/auth/*`).
Seeding a website account with `create-customer-user.mjs` will **not** let you
log into `/dashboard` — the UI never checks the SQLite `users` table for that
login. (This cost a real debugging session; hence this doc.)

## Seed a working customer-dashboard (portal) login locally

The portal login is Postgres-backed. Set a password on an existing
`TenantPortalAccount` (pick a tenant that has data), e.g.:

```bash
node --env-file=apps/api-gateway/.env -e '
const { scrypt, randomBytes } = require("node:crypto");
const { promisify } = require("node:util"); const p = require("node:path"); const { pathToFileURL } = require("node:url");
const s = promisify(scrypt);
(async () => {
  const salt = randomBytes(32).toString("hex");
  const hash = "scrypt:" + salt + ":" + (await s("Customer@1234", salt, 64)).toString("hex");
  const { PrismaClient } = await import(pathToFileURL(p.resolve("apps/api-gateway/node_modules/@prisma/client/index.js")).href);
  const db = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  await db.tenantPortalAccount.updateMany({ where: { email: "you@yourtenant.com" }, data: { passwordHash: hash, isActive: true, isEmailVerified: true } });
  await db.$disconnect();
})();'
```

Then log in at `/login` with that email + `Customer@1234`.

## Why not just delete the SQLite path?

It is **not** dead code. `apps/website/lib/auth-store.ts` backs the entire
`/admin` console, signup, forgot-password, magic-link, whoami, delete-account,
and bot-config routes (Cloudflare D1 in production). Removing it breaks those.
The right fix for the confusion is this signpost, not deletion. A future
consolidation (portal-only auth everywhere) would be a deliberate migration,
not a cleanup.
