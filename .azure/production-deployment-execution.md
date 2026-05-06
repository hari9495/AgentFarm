# Task 7.1 / 8.2 / 8.3 — Production Deployment Execution Guide

## Status: Blocked — Azure subscription access required

**Blocker**: `az login` succeeds for `hari.m@yukthixconsulting.com` but ARM API returns
`SubscriptionNotFound` for subscription `e8618958-e77a-4932-b49e-f94ccbaf90bc`.
The account has no subscription-level RBAC. Resolve in Azure portal before proceeding.

**To unblock**:
1. Log in to https://portal.azure.com as a subscription Owner
2. Go to **Subscriptions → YukthiX Consulting Dev Subscription → Access control (IAM)**
3. Add role assignment: Role = **Contributor**, Member = `hari.m@yukthixconsulting.com`
4. Re-run `az login` and verify with `az group list`

---

## Phase 1 — Control Plane Infrastructure (Task 8.2)

### 1.1 Create resource group

```bash
az group create \
  --name agentfarm-control \
  --location eastus
```

### 1.2 Store admin password in environment (never in source)

```bash
# Generate a strong password and store it securely
$DB_ADMIN_PASS = [System.Web.Security.Membership]::GeneratePassword(24, 4)
```

### 1.3 Deploy control-plane Bicep

```bash
az deployment group create \
  --resource-group agentfarm-control \
  --template-file infrastructure/control-plane/main.bicep \
  --parameters environmentName=agentfarm adminPassword=$DB_ADMIN_PASS \
  --query "properties.outputs" \
  --output json > .azure/control-plane-outputs.json
```

Expected outputs saved to `.azure/control-plane-outputs.json`:
- `postgresServerFqdn`
- `redisHostName`
- `acrLoginServer`
- `keyVaultUri`
- `logWorkspaceId`
- `appInsightsConnectionString`

### 1.4 Store PostgreSQL connection string in Key Vault

```bash
KV_URI=$(cat .azure/control-plane-outputs.json | jq -r '.keyVaultUri.value')
PG_FQDN=$(cat .azure/control-plane-outputs.json | jq -r '.postgresServerFqdn.value')

az keyvault secret set \
  --vault-name agentfarm-kv \
  --name "DatabaseUrl" \
  --value "postgresql://agentfarm_admin:${DB_ADMIN_PASS}@${PG_FQDN}/agentfarm?sslmode=require"
```

### 1.5 Grant Key Vault Secrets Officer to deployer identity

```bash
az role assignment create \
  --role "Key Vault Secrets Officer" \
  --assignee hari.m@yukthixconsulting.com \
  --scope $(az keyvault show -n agentfarm-kv -g agentfarm-control --query id -o tsv)
```

### 1.6 Run Prisma migrations against PostgreSQL

```bash
DATABASE_URL=$(az keyvault secret show --vault-name agentfarm-kv --name DatabaseUrl --query value -o tsv) \
  pnpm db:migrate:deploy
```

---

## Phase 2 — Website SWA Deployment (Task 7.1)

### 2.1 Create Static Web App resource

```bash
az staticwebapp create \
  --name agentfarm-website \
  --resource-group agentfarm-control \
  --location eastus \
  --sku Free \
  --source https://github.com/<org>/AgentFarm \
  --branch main \
  --app-location apps/website \
  --output-location .next \
  --login-with-github
```

> Note: `--login-with-github` opens a browser to authorize the GitHub App. Alternatively,
> create the SWA in Azure Portal and link the GitHub repo from the Deployment Center tab.

### 2.2 Retrieve deployment token

```bash
az staticwebapp secrets list \
  --name agentfarm-website \
  --resource-group agentfarm-control \
  --query "properties.apiKey" \
  --output tsv
```

### 2.3 Add GitHub secret

In GitHub → Settings → Secrets and variables → Actions, create:
- **Name**: `AZURE_STATIC_WEB_APPS_API_TOKEN_WEBSITE`
- **Value**: output from step 2.2

### 2.4 Trigger deployment

```bash
git push origin main
```

The workflow `.github/workflows/website-swa.yml` will trigger automatically on push to `main`
when files under `apps/website/**` change.

### 2.5 Verify production deployment

```bash
# Retrieve the SWA hostname
SWA_URL=$(az staticwebapp show \
  --name agentfarm-website \
  --resource-group agentfarm-control \
  --query "defaultHostname" \
  --output tsv)

echo "Production URL: https://$SWA_URL"

# Run production smoke checks
curl -f "https://$SWA_URL/" -o /dev/null -w "HTTP %{http_code}\n"
curl -f "https://$SWA_URL/login" -o /dev/null -w "HTTP %{http_code}\n"
curl -f "https://$SWA_URL/api/auth/session" -o /dev/null -w "HTTP %{http_code}\n"
```

---

## Phase 3 — Runtime Plane Deployment (Task 8.2 — per-tenant VMs)

> Deploy one VM per active tenant bot. Repeat per tenant.

```bash
TENANT_ID="<tenant-uuid>"
BOT_ID="<bot-uuid>"
ACR_SERVER=$(cat .azure/control-plane-outputs.json | jq -r '.acrLoginServer.value')
KV_URI=$(cat .azure/control-plane-outputs.json | jq -r '.keyVaultUri.value')
LOG_WS_ID=$(cat .azure/control-plane-outputs.json | jq -r '.logWorkspaceId.value')

# Create per-tenant resource group
az group create \
  --name "agentfarm-rt-${TENANT_ID:0:8}" \
  --location eastus

# Deploy runtime VM
az deployment group create \
  --resource-group "agentfarm-rt-${TENANT_ID:0:8}" \
  --template-file infrastructure/runtime-plane/main.bicep \
  --parameters \
    tenantId=$TENANT_ID \
    botId=$BOT_ID \
    adminPassword=$VM_ADMIN_PASS \
    acrLoginServer=$ACR_SERVER \
    keyVaultUri=$KV_URI \
    logWorkspaceId=$LOG_WS_ID
```

### Grant VM managed identity access to Key Vault and ACR

```bash
PRINCIPAL_ID=$(az deployment group show \
  --resource-group "agentfarm-rt-${TENANT_ID:0:8}" \
  --name main \
  --query "properties.outputs.managedIdentityPrincipalId.value" -o tsv)

# Key Vault Secrets User
az role assignment create \
  --role "Key Vault Secrets User" \
  --assignee $PRINCIPAL_ID \
  --scope $(az keyvault show -n agentfarm-kv -g agentfarm-control --query id -o tsv)

# ACR Pull
az role assignment create \
  --role "AcrPull" \
  --assignee $PRINCIPAL_ID \
  --scope $(az acr show -n agentfarmacr -g agentfarm-control --query id -o tsv)
```

---

## Phase 4 — Security & Launch Gates (Task 8.3)

### 4.1 Security header check

```bash
curl -I "https://$SWA_URL/" | grep -i "x-content-type-options\|x-frame-options\|strict-transport-security\|content-security-policy"
```

Expected headers (configured in `apps/website/staticwebapp.config.json`):
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Strict-Transport-Security: max-age=31536000`

### 4.2 Evidence freshness export

```bash
# Authenticated as a valid session token
curl -s "https://$SWA_URL/api/evidence/export?format=json" \
  -H "Cookie: session=<token>" \
  > operations/quality/8.3-evidence-export-$(date +%Y%m%d).json
```

### 4.3 Final quality gate (pre-launch)

```bash
pnpm quality:gate
```

Must report: `SUCCESS` — all lanes pass, DB lane skipped only if DATABASE_URL not configured locally.

### 4.4 Record production deployment evidence

```bash
echo "{
  \"task\": \"8.2\",
  \"status\": \"deployed\",
  \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",
  \"swaUrl\": \"https://$SWA_URL\",
  \"controlPlaneRg\": \"agentfarm-control\",
  \"postgresServer\": \"$(cat .azure/control-plane-outputs.json | jq -r '.postgresServerFqdn.value')\",
  \"acrServer\": \"$(cat .azure/control-plane-outputs.json | jq -r '.acrLoginServer.value')\"
}" > operations/quality/8.2-production-deployment-evidence.json
```

---

## Rollback Procedure

| Component | Rollback command |
|-----------|-----------------|
| SWA revert | Re-push a previous tag to `main` or use GitHub Actions "Re-run workflow" on previous run |
| DB migration | `pnpm --filter @agentfarm/db-schema prisma migrate resolve --rolled-back <migration>` |
| Control plane | `az group delete -n agentfarm-control --yes --no-wait` |
| Runtime VM | `az group delete -n agentfarm-rt-<tenantId> --yes --no-wait` |

---

## IaC Files

| File | Purpose |
|------|---------|
| `infrastructure/control-plane/main.bicep` | PostgreSQL, Redis, ACR, Key Vault, Log Analytics, App Insights |
| `infrastructure/runtime-plane/main.bicep` | Per-tenant VM, NSG, VNet, NIC, managed identity, auto-shutdown |
| `.github/workflows/website-swa.yml` | CI/CD pipeline for website → Azure SWA |
| `apps/website/staticwebapp.config.json` | SWA routing rules and security headers |

<!-- doc-sync: 2026-05-06 sprint-6 -->
> Last synchronized: 2026-05-06 (Sprint 6 hardening and quality gate pass).
