<#
.SYNOPSIS
  Start the AgentFarm voice stack for local Teams development.

.DESCRIPTION
  1. Starts all voice-profile services (including ngrok and teams-media-bot).
  2. Polls the ngrok API until a public HTTPS tunnel URL appears.
  3. Injects that URL into teams-media-bot as TEAMS_CALLBACK_BASE_URL by
     recreating just that container (all other services are unaffected).

.PARAMETER Down
  Stop and remove all voice-profile containers instead of starting them.

.EXAMPLE
  $env:NGROK_AUTHTOKEN = "your_token"
  .\scripts\voice-dev.ps1

.EXAMPLE
  .\scripts\voice-dev.ps1 -Down
#>

param(
  [switch]$Down
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ComposeCmd  = 'docker'
$ComposeArgs = @('compose', '--profile', 'voice')
$NgrokApi    = 'http://localhost:4040/api/tunnels'
$MaxWait     = 60    # seconds to wait for ngrok tunnel
$PollInterval = 3

function Write-Info  { param($m) Write-Host "[voice-dev] $m" -ForegroundColor Cyan    }
function Write-Ok    { param($m) Write-Host "[voice-dev] $m" -ForegroundColor Green   }
function Write-Warn  { param($m) Write-Host "[voice-dev] $m" -ForegroundColor Yellow  }
function Write-Fatal { param($m) Write-Error "[voice-dev] ERROR: $m"; exit 1 }

# ── --down shortcut ────────────────────────────────────────────────────────────

if ($Down) {
  Write-Info 'Stopping voice stack...'
  & $ComposeCmd @ComposeArgs down
  Write-Ok 'Voice stack stopped.'
  exit 0
}

# ── pre-flight checks ──────────────────────────────────────────────────────────

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Write-Fatal 'docker not found in PATH.'
}

if ([string]::IsNullOrEmpty($env:NGROK_AUTHTOKEN)) {
  Write-Warn 'NGROK_AUTHTOKEN is not set.'
  Write-Warn 'Get a free token at https://dashboard.ngrok.com/get-started/your-authtoken'
  Write-Warn 'Then: $env:NGROK_AUTHTOKEN = "<token>"'
  Write-Fatal 'Cannot start ngrok without an auth token.'
}

# ── start the voice stack ──────────────────────────────────────────────────────

Write-Info 'Starting voice stack (profile: voice)...'
& $ComposeCmd @ComposeArgs up -d

# ── wait for ngrok tunnel ──────────────────────────────────────────────────────

Write-Info "Waiting for ngrok tunnel (up to ${MaxWait}s)..."
$elapsed   = 0
$publicUrl = $null

while ($elapsed -lt $MaxWait) {
  try {
    $response = Invoke-RestMethod -Uri $NgrokApi -ErrorAction Stop
    $tunnel = $response.tunnels | Where-Object { $_.proto -eq 'https' } | Select-Object -First 1
    if ($tunnel) {
      $publicUrl = $tunnel.public_url
      break
    }
  } catch {
    # ngrok not ready yet — keep polling
  }
  Start-Sleep -Seconds $PollInterval
  $elapsed += $PollInterval
}

if (-not $publicUrl) {
  Write-Fatal "Timed out waiting for ngrok tunnel. Check: docker compose --profile voice logs ngrok"
}

Write-Ok "ngrok tunnel ready: $publicUrl"

# ── inject URL into teams-media-bot ───────────────────────────────────────────

Write-Info 'Injecting TEAMS_CALLBACK_BASE_URL into teams-media-bot...'
$env:TEAMS_CALLBACK_BASE_URL = $publicUrl
& $ComposeCmd @ComposeArgs up -d --no-deps --force-recreate teams-media-bot

# ── summary ───────────────────────────────────────────────────────────────────

Write-Host ''
Write-Ok 'Voice stack is ready.'
Write-Host ''
Write-Host "  Callback URL : $publicUrl"
Write-Host '  ngrok UI     : http://localhost:4040'
Write-Host '  Bot health   : http://localhost:8090/health'
Write-Host ''
Write-Host '  To stop:  .\scripts\voice-dev.ps1 -Down'
Write-Host '  Logs:     docker compose --profile voice logs -f teams-media-bot'
Write-Host ''
