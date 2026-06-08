# AgentFarm Cloudflare Tunnel Setup Script (PowerShell)
# Run this in PowerShell AS ADMINISTRATOR on your laptop.
#
# Prerequisites:
#   - cloudflared installed (winget install Cloudflare.cloudflared already done)
#   - All AgentFarm services running (pm2 list shows all "online")
#
# Usage:
#   1. Open PowerShell as Administrator
#   2. cd D:\AgentFarm
#   3. .\scripts\tunnel-setup.ps1
#
# After running, the tunnel will be active and:
#   https://api.agentfarms.in      → localhost:3000 (api-gateway)
#   https://dashboard.agentfarms.in → localhost:3001 (dashboard)
#   https://runtime.agentfarms.in  → localhost:4000 (agent-runtime)

$ErrorActionPreference = "Stop"

$cfExe = $null

# Find cloudflared.exe
$candidates = @(
    "cloudflared",
    "C:\Program Files\cloudflared\cloudflared.exe",
    "C:\ProgramData\chocolatey\bin\cloudflared.exe",
    "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\Cloudflare.cloudflared_*\cloudflared.exe"
)

foreach ($c in $candidates) {
    if (Get-Command $c -ErrorAction SilentlyContinue) {
        $cfExe = $c
        break
    }
    $expanded = Resolve-Path $c -ErrorAction SilentlyContinue
    if ($expanded) { $cfExe = $expanded; break }
}

# Also try winget install location
$wingetCF = Get-ChildItem "$env:LOCALAPPDATA\Microsoft\WinGet\Packages" -Recurse -Filter "cloudflared.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
if ($wingetCF) { $cfExe = $wingetCF.FullName }

if (-not $cfExe) {
    Write-Error "cloudflared not found. Run: winget install Cloudflare.cloudflared"
    exit 1
}

Write-Host "Using cloudflared: $cfExe" -ForegroundColor Cyan

# Step 1: Login (opens browser)
Write-Host ""
Write-Host "STEP 1: Login to Cloudflare" -ForegroundColor Green
Write-Host "A browser window will open. Log in and authorize the agentfarms.in zone." -ForegroundColor Yellow
& $cfExe tunnel login

if ($LASTEXITCODE -ne 0) {
    Write-Error "Login failed. Please try again."
    exit 1
}

Write-Host "Login successful!" -ForegroundColor Green

# Step 2: Create tunnel
$tunnelName = "agentfarm"
Write-Host ""
Write-Host "STEP 2: Creating tunnel '$tunnelName'..." -ForegroundColor Green

# Check if tunnel already exists
$existing = & $cfExe tunnel list 2>&1 | Select-String $tunnelName
if ($existing) {
    Write-Host "Tunnel '$tunnelName' already exists, skipping creation." -ForegroundColor Yellow
} else {
    & $cfExe tunnel create $tunnelName
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to create tunnel."
        exit 1
    }
}

# Get tunnel ID
$tunnelInfo = & $cfExe tunnel info $tunnelName 2>&1
$tunnelId = ($tunnelInfo | Select-String "ID:" | Select-Object -First 1).ToString().Split(":")[1].Trim()
Write-Host "Tunnel ID: $tunnelId" -ForegroundColor Cyan

# Step 3: Write config.yml
$cfDir = "$env:USERPROFILE\.cloudflared"
$configPath = "$cfDir\config.yml"

Write-Host ""
Write-Host "STEP 3: Writing config to $configPath" -ForegroundColor Green

$config = @"
tunnel: $tunnelId
credentials-file: $cfDir\$tunnelId.json

ingress:
  # API Gateway
  - hostname: api.agentfarms.in
    service: http://localhost:3000
    originRequest:
      noTLSVerify: false

  # Dashboard (Next.js)
  - hostname: dashboard.agentfarms.in
    service: http://localhost:3001
    originRequest:
      noTLSVerify: false

  # Agent Runtime
  - hostname: runtime.agentfarms.in
    service: http://localhost:4000
    originRequest:
      noTLSVerify: false

  # Catch-all (required by cloudflared)
  - service: http_status:404
"@

Set-Content -Path $configPath -Value $config -Encoding UTF8
Write-Host "Config written." -ForegroundColor Green

# Step 4: Route DNS
Write-Host ""
Write-Host "STEP 4: Creating DNS routes..." -ForegroundColor Green

$routes = @(
    @("api.agentfarms.in", $tunnelName),
    @("dashboard.agentfarms.in", $tunnelName),
    @("runtime.agentfarms.in", $tunnelName)
)

foreach ($r in $routes) {
    Write-Host "  Routing $($r[0]) → tunnel..." -ForegroundColor Yellow
    & $cfExe tunnel route dns $r[1] $r[0] 2>&1
}

# Step 5: Run the tunnel
Write-Host ""
Write-Host "STEP 5: Starting tunnel (Ctrl+C to stop)..." -ForegroundColor Green
Write-Host "Your services will be live at:" -ForegroundColor Cyan
Write-Host "  https://api.agentfarms.in" -ForegroundColor White
Write-Host "  https://dashboard.agentfarms.in" -ForegroundColor White
Write-Host "  https://runtime.agentfarms.in" -ForegroundColor White
Write-Host ""

& $cfExe tunnel --config $configPath run $tunnelName
