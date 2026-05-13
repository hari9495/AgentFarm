$ErrorActionPreference = "Stop"

$files = @(
    "d:\AgentFarm\apps\website\app\admin\billing\page.tsx",
    "d:\AgentFarm\apps\website\app\admin\bots\page.tsx",
    "d:\AgentFarm\apps\website\app\admin\superadmin\page.tsx",
    "d:\AgentFarm\apps\website\app\admin\users\page.tsx",
    "d:\AgentFarm\apps\website\app\checkout\billing\page.tsx",
    "d:\AgentFarm\apps\website\app\company\CompanyPortalPage.tsx",
    "d:\AgentFarm\apps\website\app\company\tenants\[id]\page.tsx",
    "d:\AgentFarm\apps\website\app\connectors\page.tsx",
    "d:\AgentFarm\apps\website\app\dashboard\bots\page.tsx"
)

$changed = 0
foreach ($file in $files) {
    if (-not (Test-Path $file)) { Write-Host "SKIP (not found): $file"; continue }
    $content = [System.IO.File]::ReadAllText($file, [System.Text.Encoding]::UTF8)
    $original = $content

    # Fix: await xxx.json() => await xxx.json() as any (when not already cast)
    # Pattern: .json() followed by anything except " as "
    $content = $content -replace '\.json\(\)(?!\s+as\s)', '.json() as any'

    # Fix: .then((data: { ... }) => { -- remove typed param, use any
    # Pattern: .then((identifier: { ... }) => {
    $content = $content -replace '\.then\(\((\w+):\s*\{[^}]+\}\)\s*=>', '.then(($1: any) =>'

    if ($content -ne $original) {
        [System.IO.File]::WriteAllText($file, $content, [System.Text.Encoding]::UTF8)
        $changed++
        Write-Host "Patched: $file"
    }
    else {
        Write-Host "No change: $file"
    }
}
Write-Host "`nPatched $changed files"
