$ErrorActionPreference = "Stop"

# All auth-store async functions that need await
$asyncFunctions = @(
    "getSessionUser",
    "createSession",
    "authenticateUser",
    "createUser",
    "findUserByEmail",
    "updateUserGatewayIds",
    "updateUserGatewayToken",
    "deleteSession",
    "completeOnboarding",
    "saveMarketplaceSelection",
    "getUserOnboardingState",
    "requestDeployment",
    "getLatestDeploymentForUser",
    "listDeploymentsForUser",
    "cancelDeployment",
    "retryDeployment",
    "listApprovals",
    "createApprovalRequest",
    "listRecentActivity",
    "decideApproval",
    "escalatePendingApprovals",
    "listUsers",
    "getUserById",
    "updateUserRole",
    "listActiveOperatorSessions",
    "revokeSessionById",
    "listBots",
    "getBotBySlug",
    "updateBotStatus",
    "updateBotConfig",
    "listCompanyTenants",
    "listCompanyFleetBots",
    "updateCompanyFleetBotStatus",
    "listCompanyIntegrations",
    "listCompanyIncidents",
    "resolveCompanyIncident",
    "listCompanyLogs",
    "getCompanyBillingSummary",
    "getCompanyTenantById",
    "getCompanyTenantFleetBots",
    "getCompanyTenantIncidents",
    "assignCompanyIncident",
    "updateCompanyIncidentSeverity",
    "getCompanyFleetBotById",
    "getCompanyIncidentById",
    "createCompanyTenant",
    "createCompanyTenantBot",
    "writeAuditEvent",
    "listAuditEvents",
    "getComplianceEvidenceSummary",
    "exportComplianceEvidencePack",
    "getProvisioningTimelineForJob",
    "getProvisioningStatusForUser",
    "listWorkspaceBotsForUser",
    "initializeTenantWorkspaceAndBot",
    "deleteAccount",
    "exportDatabaseSnapshot",
    "exportDatabaseAsCsv",
    "processProvisioningQueue",
    "retryProvisioningJob",
    "autoProcessProvisioningForUser"
)

$targetFiles = Get-ChildItem "d:\AgentFarm\apps\website\app" -Recurse -Filter "*.ts" | 
    Where-Object { $_.FullName -notlike "*node_modules*" -and $_.FullName -notlike "*.test.*" }
$targetFiles += Get-ChildItem "d:\AgentFarm\apps\website\app" -Recurse -Filter "*.tsx" | 
    Where-Object { $_.FullName -notlike "*node_modules*" }

$totalChanged = 0

foreach ($file in $targetFiles) {
    $content = [System.IO.File]::ReadAllText($file.FullName, [System.Text.Encoding]::UTF8)
    $original = $content

    # Fix renamed exports in imports
    $content = $content -replace 'updateApprovalDecision', 'decideApproval'
    $content = $content -replace 'exportTableCsv', 'exportDatabaseAsCsv'

    # Add await before each async function call if not already awaited
    foreach ($fn in $asyncFunctions) {
        # Pattern: match fn( that is NOT preceded by "await " 
        # Use negative lookbehind equivalent: replace lines containing fn( without await
        # Match: (non-word-char or start-of-line)functionName( and not preceded by await
        # Simple approach: replace = functionName( with = await functionName(
        # Also replace: return functionName( and  functionName( at start of statement
        $content = $content -replace "(?<!await )(?<!\bawait\b\s+)(?<prefix>= |return |^\s*|, |\()($fn)\(", "`${prefix}await $fn("
    }

    if ($content -ne $original) {
        [System.IO.File]::WriteAllText($file.FullName, $content, [System.Text.Encoding]::UTF8)
        $totalChanged++
        Write-Host "Patched: $($file.FullName)"
    }
}

Write-Host "`nTotal files patched: $totalChanged"
