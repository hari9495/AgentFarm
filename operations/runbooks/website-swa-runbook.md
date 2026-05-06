# Website Azure Static Web App Runbook (Task 7.1)

## Purpose
Operational checklist for deploying the AgentFarm website to Azure Static Web Apps with custom domain, CDN validation, analytics checks, and Lighthouse signoff.

## Scope
- Website source: apps/website
- Deployment workflow: .github/workflows/website-swa.yml
- Static Web App config: apps/website/staticwebapp.config.json

## Prerequisites
1. Azure Static Web App resource created.
2. GitHub repository secret configured:
   - AZURE_STATIC_WEB_APPS_API_TOKEN_WEBSITE
3. Main branch protection and PR workflow enabled.

## Deployment Procedure
1. Merge website changes into main.
2. Verify workflow run in GitHub Actions:
   - job: deploy
   - status: success
   - build command: `pnpm --filter @agentfarm/website exec next build --no-lint`
3. Confirm SWA environment URL returns HTTP 200.
4. Validate key pages:
   - /
   - /signup
   - /target
5. Run automated production verification from repo root:
   - `pnpm verify:website:prod -- --url https://<your-swa-domain>`
   - report output: `operations/quality/7.1-website-swa-verification.json`

## Approval Evidence Pagination Flag Rollout (Dashboard)
1. Default state must remain disabled in production:
   - `NEXT_PUBLIC_APPROVAL_EVIDENCE_PAGINATION=false`
2. Enable in staging first and verify:
   - approval drawer Evidence tab loads latest record
   - Newer/Older controls are visible when total evidence > page size
   - page indicator and range text match API metadata (`total`, `limit`, `offset`)
3. Promote to production in one release window only after staging verification:
   - set `NEXT_PUBLIC_APPROVAL_EVIDENCE_PAGINATION=true`
   - monitor decision workflow and evidence fetch error rate for 30 minutes
4. Run smoke checks immediately after promotion:
   - dashboard approval queue open/close and evidence tab switching
   - approval details for at least one record with >5 evidence entries

## Approval Evidence Pagination Rollback
1. Set `NEXT_PUBLIC_APPROVAL_EVIDENCE_PAGINATION=false` in production environment.
2. Trigger redeploy and verify Evidence tab falls back to single-page evidence retrieval.
3. Confirm no regression in approval decision submission and escalation sweep.
4. Record rollback time, actor, and observed symptom in incident notes.

## Custom Domain Setup
1. In Azure portal, open Static Web App custom domains.
2. Add apex and www records as needed.
3. Configure DNS records at registrar:
   - CNAME for www
   - ALIAS/ANAME (or Azure-supported method) for apex
4. Wait for certificate issuance and TLS validation.
5. Verify HTTPS redirect and certificate validity.

## CDN and Performance Validation
1. Confirm static assets are served with cache headers.
2. Validate cold and warm page response from at least two regions.
3. Run Lighthouse on production URL:
   - Performance >= 90
   - Accessibility >= 90
   - Best Practices >= 90
   - SEO >= 90

## Analytics and SEO Validation
1. Confirm analytics events are emitted from production domain.
2. Validate sitemap and robots.txt exposure.
3. Validate metadata/title/description for top routes.

## Closure Evidence (Task 7.1)
1. Attach successful GitHub Actions run URL for `.github/workflows/website-swa.yml`.
2. Attach verification report file: `operations/quality/7.1-website-swa-verification.json`.
3. Record custom domain DNS and TLS completion timestamp.
4. Record Lighthouse scores for production URL (all categories >= 90).

## Rollback
1. Re-run workflow from last known-good commit.
2. If required, revert main branch to previous release commit.
3. Confirm rollback deployment health and analytics continuity.

## Ownership
- Frontend Lead: website build and UX verification
- DevOps: deployment workflow and domain configuration
- Product: launch signoff
