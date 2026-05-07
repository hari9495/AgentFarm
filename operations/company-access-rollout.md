# Company Access Rollout Checklist

## 1) Configure production environment
Set these variables in the production website environment:

- AGENTFARM_COMPANY_EMAILS
- AGENTFARM_COMPANY_DOMAINS

At least one must be non-empty to grant company portal/API access in production.

## 2) Optional hardening toggles
- AGENTFARM_DISABLE_COMPANY_FALLBACK=true
- AGENTFARM_COMPANY_FALLBACK_DOMAINS (development use)

## 3) Verify behavior after deployment
Run these checks with representative users:

- Company operator:
  - GET /company -> 200
  - GET /api/superadmin/overview -> 200
- Customer superadmin:
  - GET /admin/superadmin -> 200
  - GET /company -> 307 redirect /admin
  - GET /api/superadmin/overview -> 403
- Anonymous:
  - GET /company -> 307 redirect /login
  - GET /api/admin/users -> 401

## 4) Automated test suite
Run:

pnpm --filter @agentfarm/website test:permissions

## 5) CI signal
The repository CI workflow runs website permission tests automatically on pull requests and pushes to main.

<!-- doc-sync: 2026-05-06 sprint-6 -->
> Last synchronized: 2026-05-06 (Sprint 6 hardening and quality gate pass).

<!-- doc-sync: 2026-05-06 full-pass-2 -->
> Last synchronized: 2026-05-06 (Full workspace sync pass 2 + semantic sprint-6 alignment).


## Current Implementation Pointer (2026-05-07)
1. For the latest built-state summary and file map, see planning/build-snapshot-2026-05-07.md.
