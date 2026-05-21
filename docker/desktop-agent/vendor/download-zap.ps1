# OPTIONAL offline cache helper — the Docker build downloads ZAP automatically.
# Only run this if you need to pre-cache the tarball for air-gapped builds
# or to avoid re-downloading on repeated docker-compose build runs.
#
# Usage (from repo root):  .\docker\desktop-agent\vendor\download-zap.ps1
# Usage (from this dir):   .\download-zap.ps1

$ZAP_VERSION = "2.17.0"
$OUT = Join-Path $PSScriptRoot "ZAP_${ZAP_VERSION}_Linux.tar.gz"
$URL = "https://github.com/zaproxy/zaproxy/releases/download/v${ZAP_VERSION}/ZAP_${ZAP_VERSION}_Linux.tar.gz"

if (Test-Path $OUT) {
    Write-Host "ZAP tarball already present: $OUT"
    exit 0
}

Write-Host "Downloading OWASP ZAP $ZAP_VERSION ..."
try {
    Invoke-WebRequest -Uri $URL -OutFile $OUT -UseBasicParsing
    Write-Host "Saved to $OUT"
    Write-Host "You can now run: docker-compose build desktop-agent"
}
catch {
    Write-Error "Download failed: $_"
    exit 1
}
