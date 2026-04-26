---
description: "Azure Static Web Apps guidance for the AgentFarm website app and SWA workflow"
applyTo: "apps/website/**,.github/workflows/website-swa.yml"
---

## Deployment Consistency
- Keep website build behavior consistent between local scripts and GitHub Actions.
- Preserve current SWA deployment action patterns unless migration is intentional.
- When adjusting build output assumptions, verify they match Next.js output expectations.

## Security and Secrets
- Never expose or log SWA deployment tokens.
- Keep token usage scoped to required workflow jobs only.
- Avoid adding permissive workflow settings unless explicitly needed.

## Environment and Runtime
- Keep Node and pnpm versions consistent with repository conventions.
- Validate that path filters include all files that can affect website deployment.
- Prefer explicit build and deploy steps over implicit assumptions.

## Operational Readiness
- For deployment behavior changes, update the related runbook in `operations/runbooks/`.
- Keep failure messaging clear in workflows so on-call engineers can triage quickly.
