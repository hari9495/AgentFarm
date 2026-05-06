# Azure Deployment Plan

## Metadata
- Date: 2026-04-22
- Task: Sprint 1 Task 7.1 (Website deployment)
- Workload: AgentFarm website
- Status: Validated
- Recipe: GitHub Actions + Azure Static Web Apps (SWA)

## Scope
1. Create SWA deployment workflow for website application.
2. Add SWA runtime configuration for baseline security headers.
3. Add operational runbook for custom domain, CDN, analytics, and Lighthouse verification.
4. Update sprint tracker status (8.1 completed, 7.1 in progress).

## Architecture Decision
- App: Next.js website in apps/website.
- Hosting target: Azure Static Web App.
- CI/CD: GitHub Actions workflow dedicated to website path changes.
- Deployment auth: SWA deployment token stored in repository secrets.

## Resource and Configuration Plan
- GitHub secret required: AZURE_STATIC_WEB_APPS_API_TOKEN_WEBSITE.
- GitHub workflow file: .github/workflows/website-swa.yml.
- SWA config file: apps/website/staticwebapp.config.json.
- Runbook file: operations/runbooks/website-swa-runbook.md.

## Validation Plan
1. Workflow YAML lint-level validation through CI syntax checks.
2. Local website build validation:
   - pnpm --filter @agentfarm/website build
3. Sprint tracker updates reviewed in planning document.

## Deployment Readiness Checklist
- [x] Scope confirmed
- [x] Deployment path selected
- [x] Artifacts identified
- [ ] Azure secret configured in repository
- [ ] First deployment executed
- [ ] Domain and CDN validated
- [x] Build path validated (`pnpm --filter @agentfarm/website exec next build --no-lint`)

## Section 7: Validation Proof
### Validation Run
- Timestamp: 2026-04-24 (local workspace)
- Command: `pnpm --filter @agentfarm/website exec next build --no-lint`
- Result: PASS (Next.js production build completed; route manifest generated)

- Command: `pnpm --filter @agentfarm/website build`
- Result: PASS (Build and type checks completed; non-blocking ESLint config warning observed for `next/core-web-vitals` load path)

- Command: `pnpm quality:gate`
- Result: PASS (API gateway and agent-runtime coverage gates, typechecks, dashboard typecheck, and website smoke lane all passed)

### Validation Conclusion
- Deployment plan status advanced to `Validated`.
- Validation confirms artifact integrity and build viability.
- Remaining gates are operational, not code correctness:
   1. Configure `AZURE_STATIC_WEB_APPS_API_TOKEN_WEBSITE` in repository secrets.
   2. Execute first production SWA deployment in GitHub Actions.
   3. Complete custom domain and CDN validation from runbook.

## Notes
- Azure deployment execution is intentionally not triggered in this step.
- Domain and DNS cutover remain operational tasks tracked in runbook.
- Azure extension authentication context is currently signed out in this workspace, so resource creation and deployment execution are blocked until sign-in is completed.

<!-- doc-sync: 2026-05-06 sprint-6 -->
> Last synchronized: 2026-05-06 (Sprint 6 hardening and quality gate pass).

<!-- doc-sync: 2026-05-06 full-pass-2 -->
> Last synchronized: 2026-05-06 (Full workspace sync pass 2 + semantic sprint-6 alignment).
